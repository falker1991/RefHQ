-- Law18Ref v0.7.5: protect site-owner and delegated administrator access.

drop policy if exists "organization admins manage memberships" on public.organization_memberships;

create policy "organization admins insert memberships"
  on public.organization_memberships for insert
  with check (
    public.is_site_owner()
    or public.has_org_role(
      organization_id,
      array['organization_admin']::public.membership_role[]
    )
  );

create policy "organization admins update permitted memberships"
  on public.organization_memberships for update
  using (
    public.is_site_owner()
    or (
      public.has_org_role(
        organization_id,
        array['organization_admin']::public.membership_role[]
      )
      and (role <> 'organization_admin' or user_id = auth.uid())
    )
  )
  with check (
    public.is_site_owner()
    or (
      public.has_org_role(
        organization_id,
        array['organization_admin']::public.membership_role[]
      )
      and (role <> 'organization_admin' or user_id = auth.uid())
    )
  );

create policy "organization admins delete permitted memberships"
  on public.organization_memberships for delete
  using (
    public.is_site_owner()
    or (
      public.has_org_role(
        organization_id,
        array['organization_admin']::public.membership_role[]
      )
      and (role <> 'organization_admin' or user_id = auth.uid())
    )
  );

drop policy if exists "event admins manage event memberships" on public.event_memberships;

create policy "event admins insert memberships"
  on public.event_memberships for insert
  with check (
    public.is_site_owner()
    or exists (
      select 1
      from public.events e
      where e.id = event_id
        and public.has_org_role(
          e.organization_id,
          array['organization_admin']::public.membership_role[]
        )
    )
    or public.has_event_role(
      event_id,
      array['event_admin']::public.membership_role[]
    )
  );

create policy "event admins update permitted memberships"
  on public.event_memberships for update
  using (
    public.is_site_owner()
    or exists (
      select 1
      from public.events e
      where e.id = event_id
        and public.has_org_role(
          e.organization_id,
          array['organization_admin']::public.membership_role[]
        )
    )
    or (
      public.has_event_role(
        event_id,
        array['event_admin']::public.membership_role[]
      )
      and (role <> 'event_admin' or user_id = auth.uid())
    )
  )
  with check (
    public.is_site_owner()
    or exists (
      select 1
      from public.events e
      where e.id = event_id
        and public.has_org_role(
          e.organization_id,
          array['organization_admin']::public.membership_role[]
        )
    )
    or (
      public.has_event_role(
        event_id,
        array['event_admin']::public.membership_role[]
      )
      and (role <> 'event_admin' or user_id = auth.uid())
    )
  );

create policy "event admins delete permitted memberships"
  on public.event_memberships for delete
  using (
    public.is_site_owner()
    or exists (
      select 1
      from public.events e
      where e.id = event_id
        and public.has_org_role(
          e.organization_id,
          array['organization_admin']::public.membership_role[]
        )
    )
    or (
      public.has_event_role(
        event_id,
        array['event_admin']::public.membership_role[]
      )
      and (role <> 'event_admin' or user_id = auth.uid())
    )
  );

create or replace function public.remove_organization_member(
  target_organization uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_owner boolean := public.is_site_owner();
  target_is_owner boolean;
  target_is_admin boolean;
  active_admin_count integer;
begin
  if not (
    actor_is_owner
    or public.has_org_role(
      target_organization,
      array['organization_admin']::public.membership_role[]
    )
  ) then
    raise exception 'Only an organization administrator can remove a member.';
  end if;

  select coalesce(is_site_owner, false)
  into target_is_owner
  from public.profiles
  where id = target_user;

  if coalesce(target_is_owner, false) then
    raise exception 'The site-owner account cannot be removed.';
  end if;

  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_organization
      and user_id = target_user
      and role = 'organization_admin'
      and status = 'active'
  ) into target_is_admin;

  if target_is_admin and not actor_is_owner and target_user <> auth.uid() then
    raise exception 'Organization administrators can only remove their own access. Another administrator or the site owner must complete this change.';
  end if;

  select count(distinct user_id)
  into active_admin_count
  from public.organization_memberships
  where organization_id = target_organization
    and role = 'organization_admin'
    and status = 'active';

  if target_is_admin and not actor_is_owner and active_admin_count <= 1 then
    raise exception 'The last organization administrator must deactivate the organization before leaving.';
  end if;

  update public.organization_memberships
  set status = 'archived'
  where organization_id = target_organization
    and user_id = target_user;

  delete from public.event_memberships em
  using public.events e
  where em.event_id = e.id
    and e.organization_id = target_organization
    and em.user_id = target_user;

  update public.officials
  set identity_status = 'removed',
      updated_at = now()
  where organization_id = target_organization
    and linked_user_id = target_user;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id
  )
  values (
    target_organization,
    auth.uid(),
    'membership.removed',
    'organization_membership',
    target_user::text
  );
end;
$$;

grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;

create or replace function public.bulk_manage_records(
  record_type text,
  lifecycle_action text,
  record_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_org uuid;
  target_event uuid;
  target_user uuid;
  processed_count integer := 0;
  skipped_count integer := 0;
begin
  if record_type not in ('officials', 'ratings', 'events')
    or lifecycle_action not in ('archive', 'restore', 'delete') then
    raise exception 'Unsupported bulk lifecycle action.';
  end if;
  if coalesce(array_length(record_ids, 1), 0) = 0 then
    return jsonb_build_object('processed', 0, 'skipped', 0);
  end if;
  if array_length(record_ids, 1) > 500 then
    raise exception 'Bulk actions are limited to 500 records at a time.';
  end if;

  foreach target_id in array record_ids loop
    begin
      if record_type = 'ratings' then
        select e.organization_id, e.id into target_org, target_event
        from public.assessments a
        join public.games g on g.id = a.game_id
        join public.events e on e.id = g.event_id
        where a.id = target_id;
        if target_org is null or not public.can_manage_assessment(target_id) then
          raise exception 'Rating unavailable.';
        end if;
        if lifecycle_action = 'delete' then
          perform public.delete_rating(target_id);
        else
          perform public.set_rating_archived(target_id, lifecycle_action = 'archive');
        end if;
      elsif record_type = 'events' then
        select organization_id, id into target_org, target_event
        from public.events where id = target_id;
        if target_org is null or not (
          public.is_site_owner()
          or public.has_org_role(target_org, array['organization_admin']::public.membership_role[])
        ) then raise exception 'Event unavailable.'; end if;
        if lifecycle_action = 'archive' then
          perform public.archive_event(target_id);
        elsif lifecycle_action = 'restore' then
          perform public.restore_event(target_id);
        else
          if not exists (select 1 from public.events where id = target_id and archived_at is not null) then
            raise exception 'Events must be archived before permanent deletion.';
          end if;
          insert into public.audit_log (
            organization_id, actor_id, action, entity_type, entity_id, details
          ) values (
            target_org, auth.uid(), 'event.deleted', 'events', target_id::text,
            jsonb_build_object('deleted_from_archive', true)
          );
          delete from public.events where id = target_id;
        end if;
      else
        select organization_id, linked_user_id
        into target_org, target_user
        from public.officials
        where id = target_id;
        if target_org is null or not (
          public.is_site_owner()
          or public.has_org_role(target_org, array['organization_admin']::public.membership_role[])
        ) then raise exception 'Official unavailable.'; end if;

        if lifecycle_action = 'delete' and target_user is not null and (
          exists (
            select 1 from public.profiles
            where id = target_user and is_site_owner
          )
          or exists (
            select 1 from public.organization_memberships
            where organization_id = target_org
              and user_id = target_user
              and role = 'organization_admin'
              and status = 'active'
          )
        ) then
          raise exception 'Site owners and organization administrators cannot be deleted in bulk.';
        end if;

        if lifecycle_action = 'archive' then
          update public.officials set archived_at = now(), archived_by = auth.uid() where id = target_id;
        elsif lifecycle_action = 'restore' then
          update public.officials set archived_at = null, archived_by = null where id = target_id;
        else
          if exists (
            select 1 from public.officials o
            where o.id = target_id and (
              o.linked_user_id is not null
              or exists (select 1 from public.assignments a where a.official_id = o.id)
              or exists (select 1 from public.check_ins c where c.official_id = o.id)
              or exists (select 1 from public.assessments a where a.official_id = o.id)
            )
          ) then raise exception 'Linked officials or officials with history must be archived, not deleted.'; end if;
          delete from public.officials where id = target_id;
        end if;

        insert into public.audit_log (
          organization_id, actor_id, action, entity_type, entity_id
        ) values (
          target_org, auth.uid(), 'official.' || case when lifecycle_action = 'delete' then 'deleted' else lifecycle_action || 'd' end,
          'officials', target_id::text
        );
      end if;
      processed_count := processed_count + 1;
    exception when others then
      skipped_count := skipped_count + 1;
      target_org := null;
      target_event := null;
      target_user := null;
    end;
  end loop;

  return jsonb_build_object('processed', processed_count, 'skipped', skipped_count);
end;
$$;

grant execute on function public.bulk_manage_records(text, text, uuid[]) to authenticated;
