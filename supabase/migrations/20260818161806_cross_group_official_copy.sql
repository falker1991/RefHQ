-- Law18Ref v0.24.0: securely add selected officials from one managed group to
-- another without removing or changing their source-group records.

create or replace function public.can_add_officials_to_group(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) is not null and (
    public.is_site_owner()
    or public.has_org_role(
      target_organization,
      array['organization_director','organization_admin','assignor']::public.membership_role[]
    )
    or exists (
      select 1
      from public.event_memberships membership
      join public.events event on event.id = membership.event_id
      where event.organization_id = target_organization
        and membership.user_id = (select auth.uid())
        and membership.role in ('event_admin','assignor')
    )
  )
$$;

revoke all on function public.can_add_officials_to_group(uuid) from public, anon;
grant execute on function public.can_add_officials_to_group(uuid) to authenticated;

create or replace function public.groups_available_for_official_addition()
returns setof public.organizations
language sql
stable
security definer
set search_path = public
as $$
  select organization.*
  from public.organizations organization
  where organization.active is not false
    and public.can_add_officials_to_group(organization.id)
  order by organization.name
$$;

revoke all on function public.groups_available_for_official_addition() from public, anon;
grant execute on function public.groups_available_for_official_addition() to authenticated;

create or replace function public.add_officials_to_group(
  source_organization uuid,
  target_organization uuid,
  source_official_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_official public.officials%rowtype;
  destination_official public.officials%rowtype;
  added_count integer := 0;
  existing_count integer := 0;
  conflict_count integer := 0;
  conflict_names text[] := '{}'::text[];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;
  if source_organization = target_organization then
    raise exception 'Choose a different destination group.';
  end if;
  if cardinality(coalesce(source_official_ids, '{}'::uuid[])) = 0 then
    raise exception 'Select at least one official.';
  end if;
  if not public.can_add_officials_to_group(source_organization)
     or not public.can_add_officials_to_group(target_organization) then
    raise exception 'You must have permission to add officials in both groups.';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = target_organization and active is not false
  ) then
    raise exception 'The destination group is not active.';
  end if;

  for source_official in
    select official.*
    from public.officials official
    where official.organization_id = source_organization
      and official.id = any(source_official_ids)
      and official.merged_into_official_id is null
      and official.archived_at is null
      and official.identity_status <> 'removed'
    order by official.full_name
    for update
  loop
    destination_official := null;

    if source_official.linked_user_id is not null then
      select * into destination_official
      from public.officials official
      where official.organization_id = target_organization
        and official.linked_user_id = source_official.linked_user_id
        and official.merged_into_official_id is null
      order by official.archived_at nulls first, official.created_at
      limit 1
      for update;
    end if;

    if destination_official.id is null and source_official.email is not null then
      select * into destination_official
      from public.officials official
      where official.organization_id = target_organization
        and lower(btrim(official.email)) = lower(btrim(source_official.email))
        and official.merged_into_official_id is null
      limit 1
      for update;
    end if;

    if destination_official.id is null then
      select * into destination_official
      from public.officials official
      where official.organization_id = target_organization
        and official.source = 'law18ref_cross_group'
        and official.source_official_id = source_official.id::text
        and official.merged_into_official_id is null
      limit 1
      for update;
    end if;

    if destination_official.id is not null
       and source_official.linked_user_id is not null
       and destination_official.linked_user_id is not null
       and destination_official.linked_user_id <> source_official.linked_user_id then
      conflict_count := conflict_count + 1;
      conflict_names := array_append(conflict_names, source_official.full_name);
      continue;
    end if;

    if destination_official.id is null then
      insert into public.officials (
        organization_id, full_name, email, secondary_email, date_of_birth, phone,
        personal_contact_locked, badge_level, ussf_id, external_check_in_other,
        source, source_official_id, source_display_name, linked_user_id,
        identity_status, pending_org_role, pending_org_roles
      ) values (
        target_organization, source_official.full_name, source_official.email,
        source_official.secondary_email, source_official.date_of_birth,
        source_official.phone, source_official.personal_contact_locked,
        source_official.badge_level, source_official.ussf_id,
        source_official.external_check_in_other, 'law18ref_cross_group',
        source_official.id::text,
        coalesce(source_official.source_display_name, source_official.full_name),
        source_official.linked_user_id,
        case when source_official.linked_user_id is null then 'provisional' else 'linked' end,
        'referee'::public.membership_role,
        array['referee']::public.membership_role[]
      ) returning * into destination_official;
      added_count := added_count + 1;
    else
      update public.officials
      set archived_at = null,
          archived_by = null,
          linked_user_id = coalesce(linked_user_id, source_official.linked_user_id),
          identity_status = case when coalesce(linked_user_id, source_official.linked_user_id) is null then 'provisional' else 'linked' end,
          updated_at = now()
      where id = destination_official.id;
      existing_count := existing_count + 1;
    end if;

    if source_official.linked_user_id is not null then
      insert into public.organization_memberships (
        organization_id, user_id, role, status, created_by
      ) values (
        target_organization, source_official.linked_user_id,
        'referee'::public.membership_role, 'active'::public.membership_status,
        (select auth.uid())
      )
      on conflict (organization_id, user_id, role) do update
      set status = 'active'::public.membership_status, updated_at = now();
    end if;

    insert into public.audit_log (
      organization_id, actor_id, action, entity_type, entity_id, details
    ) values (
      target_organization, (select auth.uid()), 'official.added_from_group',
      'official', destination_official.id::text,
      jsonb_build_object(
        'source_organization_id', source_organization,
        'source_official_id', source_official.id,
        'linked_user_id', source_official.linked_user_id,
        'invitation_sent', false
      )
    );
  end loop;

  return jsonb_build_object(
    'added', added_count,
    'already_present', existing_count,
    'conflicts', conflict_count,
    'conflict_names', conflict_names
  );
end;
$$;

revoke all on function public.add_officials_to_group(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.add_officials_to_group(uuid, uuid, uuid[]) to authenticated;
