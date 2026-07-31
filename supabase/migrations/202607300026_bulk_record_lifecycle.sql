-- Law18Ref v0.7.1: audited bulk archive, restore, and deletion.

alter table public.officials
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists officials_active_organization_idx
  on public.officials(organization_id, full_name)
  where archived_at is null and merged_into_official_id is null;

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
        select organization_id into target_org from public.officials where id = target_id;
        if target_org is null or not (
          public.is_site_owner()
          or public.has_org_role(target_org, array['organization_admin']::public.membership_role[])
        ) then raise exception 'Official unavailable.'; end if;
        if exists (
          select 1 from public.officials
          where id = target_id and linked_user_id = auth.uid() and public.is_site_owner()
        ) then raise exception 'The site-owner record cannot be changed in bulk.'; end if;

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
    end;
  end loop;

  return jsonb_build_object('processed', processed_count, 'skipped', skipped_count);
end;
$$;

grant execute on function public.bulk_manage_records(text, text, uuid[]) to authenticated;
