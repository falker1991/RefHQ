-- Law18Ref v0.21.6: merge linked and provisional official identities.

create or replace function public.merge_group_official_records_with_profile(
  organization_uuid uuid,
  primary_official_uuid uuid,
  secondary_official_uuid uuid,
  field_sources jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_official public.officials%rowtype;
  secondary_official public.officials%rowtype;
  primary_user uuid;
  secondary_user uuid;
  surviving_email text;
  selected_full_name text;
  selected_secondary_email text;
  selected_date_of_birth date;
  selected_phone text;
  selected_badge_level text;
  contains_director boolean;
  contains_admin boolean;
begin
  if primary_official_uuid = secondary_official_uuid then
    raise exception 'Choose two different official records.';
  end if;
  if not (
    public.is_site_owner()
    or public.has_org_role(organization_uuid, array['organization_director','organization_admin']::public.membership_role[])
  ) then
    raise exception 'Only cleared group leadership can merge official records.';
  end if;

  select * into primary_official from public.officials
  where id = primary_official_uuid and organization_id = organization_uuid
    and merged_into_official_id is null and archived_at is null
  for update;
  select * into secondary_official from public.officials
  where id = secondary_official_uuid and organization_id = organization_uuid
    and merged_into_official_id is null and archived_at is null
  for update;
  if primary_official.id is null or secondary_official.id is null then
    raise exception 'Both officials must be active members of this group.';
  end if;

  primary_user := primary_official.linked_user_id;
  secondary_user := secondary_official.linked_user_id;
  if primary_user is null and secondary_user is not null then
    raise exception 'Choose the linked account as the surviving record.';
  end if;
  if primary_user is not null and primary_user = secondary_user then
    secondary_user := null;
  end if;

  select
    coalesce(bool_or(role = 'organization_director' and status = 'active'), false),
    coalesce(bool_or(role = 'organization_admin' and status = 'active'), false)
  into contains_director, contains_admin
  from public.organization_memberships
  where organization_id = organization_uuid
    and user_id in (primary_official.linked_user_id, secondary_official.linked_user_id);
  contains_director := contains_director
    or 'organization_director'::public.membership_role = any(primary_official.pending_org_roles)
    or 'organization_director'::public.membership_role = any(secondary_official.pending_org_roles);
  contains_admin := contains_admin
    or 'organization_admin'::public.membership_role = any(primary_official.pending_org_roles)
    or 'organization_admin'::public.membership_role = any(secondary_official.pending_org_roles);
  if contains_director and not public.is_site_owner() then
    raise exception 'Only the site owner can merge a Group Director record.';
  end if;
  if contains_admin and not (
    public.is_site_owner()
    or public.has_org_role(organization_uuid, array['organization_director']::public.membership_role[])
  ) then
    raise exception 'Only the site owner or Group Director can merge a Group Admin record.';
  end if;

  if primary_official.personal_contact_locked and (
    coalesce(field_sources->>'full_name', 'primary') = 'secondary'
    or coalesce(field_sources->>'secondary_email', 'primary') = 'secondary'
    or coalesce(field_sources->>'date_of_birth', 'primary') = 'secondary'
    or coalesce(field_sources->>'phone', 'primary') = 'secondary'
  ) then
    raise exception 'The surviving user has locked their personal contact information.';
  end if;

  selected_full_name := case when field_sources->>'full_name' = 'secondary' then secondary_official.full_name else primary_official.full_name end;
  selected_secondary_email := case when field_sources->>'secondary_email' = 'secondary' then secondary_official.secondary_email else primary_official.secondary_email end;
  selected_date_of_birth := case when field_sources->>'date_of_birth' = 'secondary' then secondary_official.date_of_birth else primary_official.date_of_birth end;
  selected_phone := case when field_sources->>'phone' = 'secondary' then secondary_official.phone else primary_official.phone end;
  selected_badge_level := case when field_sources->>'badge_level' = 'secondary' then secondary_official.badge_level else primary_official.badge_level end;

  -- Official-based operational records.
  delete from public.assignments secondary where secondary.official_id = secondary_official_uuid
    and exists (select 1 from public.assignments primary_row where primary_row.official_id = primary_official_uuid and primary_row.game_id = secondary.game_id and primary_row.position = secondary.position);
  update public.assignments set official_id = primary_official_uuid where official_id = secondary_official_uuid;
  delete from public.check_ins secondary where secondary.official_id = secondary_official_uuid
    and exists (select 1 from public.check_ins primary_row where primary_row.official_id = primary_official_uuid and primary_row.event_id = secondary.event_id and primary_row.event_date = secondary.event_date);
  update public.check_ins set official_id = primary_official_uuid where official_id = secondary_official_uuid;
  delete from public.assessments secondary where secondary.official_id = secondary_official_uuid
    and exists (select 1 from public.assessments primary_row where primary_row.official_id = primary_official_uuid and primary_row.game_id = secondary.game_id and primary_row.coach_id = secondary.coach_id);
  update public.assessments set official_id = primary_official_uuid where official_id = secondary_official_uuid;
  update public.coach_assignments set official_id = primary_official_uuid where official_id = secondary_official_uuid;
  update public.guest_check_in_sessions set official_id = primary_official_uuid where official_id = secondary_official_uuid;
  update public.import_identity_conflicts set resolved_official_id = primary_official_uuid where resolved_official_id = secondary_official_uuid;

  -- Preserve staged event permissions on the surviving official.
  insert into public.provisional_event_access (
    official_id, event_id, roles, full_schedule_access, coaching_tools_enabled,
    ratings_history_scope, ratings_event_ids, assigned_game_ids, created_by
  )
  select primary_official_uuid, event_id, roles, full_schedule_access, coaching_tools_enabled,
    ratings_history_scope, ratings_event_ids, assigned_game_ids, created_by
  from public.provisional_event_access where official_id = secondary_official_uuid
  on conflict (official_id, event_id) do update set
    roles = (select array_agg(distinct role) from unnest(public.provisional_event_access.roles || excluded.roles) role),
    full_schedule_access = public.provisional_event_access.full_schedule_access or excluded.full_schedule_access,
    coaching_tools_enabled = public.provisional_event_access.coaching_tools_enabled or excluded.coaching_tools_enabled,
    ratings_history_scope = case
      when public.provisional_event_access.ratings_history_scope = 'all' or excluded.ratings_history_scope = 'all' then 'all'
      when public.provisional_event_access.ratings_history_scope = 'specific' or excluded.ratings_history_scope = 'specific' then 'specific'
      else 'none' end,
    ratings_event_ids = (select coalesce(array_agg(distinct value), '{}'::uuid[]) from unnest(public.provisional_event_access.ratings_event_ids || excluded.ratings_event_ids) value),
    assigned_game_ids = (select coalesce(array_agg(distinct value), '{}'::uuid[]) from unnest(public.provisional_event_access.assigned_game_ids || excluded.assigned_game_ids) value),
    updated_at = now();
  delete from public.provisional_event_access where official_id = secondary_official_uuid;

  if primary_user is not null then
    update public.coach_assignments set coach_id = primary_user, coach_official_id = null where coach_official_id = secondary_official_uuid;
  else
    update public.coach_assignments set coach_official_id = primary_official_uuid where coach_official_id = secondary_official_uuid;
  end if;

  -- User-based legacy records and permissions only exist when both records had logins.
  if primary_user is not null and secondary_user is not null then
    delete from public.assignments secondary where secondary.referee_id = secondary_user
      and exists (select 1 from public.assignments primary_row where primary_row.referee_id = primary_user and primary_row.game_id = secondary.game_id and primary_row.position = secondary.position);
    update public.assignments set referee_id = primary_user where referee_id = secondary_user;
    delete from public.check_ins secondary where secondary.referee_id = secondary_user
      and exists (select 1 from public.check_ins primary_row where primary_row.referee_id = primary_user and primary_row.event_id = secondary.event_id);
    update public.check_ins set referee_id = primary_user where referee_id = secondary_user;
    delete from public.assessments secondary where secondary.referee_id = secondary_user
      and exists (select 1 from public.assessments primary_row where primary_row.referee_id = primary_user and primary_row.game_id = secondary.game_id and primary_row.coach_id = secondary.coach_id);
    update public.assessments set referee_id = primary_user where referee_id = secondary_user;
    update public.coach_assignments set coach_id = primary_user where coach_id = secondary_user;
    update public.coach_assignments set referee_id = primary_user where referee_id = secondary_user;

    insert into public.organization_memberships (organization_id, user_id, role, status, created_by)
    select organization_id, primary_user, role, status, auth.uid() from public.organization_memberships
    where organization_id = organization_uuid and user_id = secondary_user
    on conflict (organization_id, user_id, role) do update set
      status = case when excluded.status = 'active' then 'active'::public.membership_status else public.organization_memberships.status end,
      updated_at = now();
    insert into public.event_memberships (
      event_id, user_id, role, full_schedule_access, coaching_tools_enabled,
      ratings_history_scope, ratings_event_ids, assigned_game_ids, created_by
    )
    select em.event_id, primary_user, em.role, em.full_schedule_access, em.coaching_tools_enabled,
      em.ratings_history_scope, em.ratings_event_ids, em.assigned_game_ids, auth.uid()
    from public.event_memberships em join public.events event on event.id = em.event_id
    where event.organization_id = organization_uuid and em.user_id = secondary_user
    on conflict (event_id, user_id, role) do update set
      full_schedule_access = public.event_memberships.full_schedule_access or excluded.full_schedule_access,
      coaching_tools_enabled = public.event_memberships.coaching_tools_enabled or excluded.coaching_tools_enabled,
      ratings_history_scope = case
        when public.event_memberships.ratings_history_scope = 'all' or excluded.ratings_history_scope = 'all' then 'all'
        when public.event_memberships.ratings_history_scope = 'specific' or excluded.ratings_history_scope = 'specific' then 'specific'
        else 'none' end,
      ratings_event_ids = (select coalesce(array_agg(distinct value), '{}'::uuid[]) from unnest(public.event_memberships.ratings_event_ids || excluded.ratings_event_ids) value),
      assigned_game_ids = (select coalesce(array_agg(distinct value), '{}'::uuid[]) from unnest(public.event_memberships.assigned_game_ids || excluded.assigned_game_ids) value);
    delete from public.event_memberships membership using public.events event
      where membership.event_id = event.id and event.organization_id = organization_uuid and membership.user_id = secondary_user;
    delete from public.organization_memberships where organization_id = organization_uuid and user_id = secondary_user;
    update public.profiles set merged_into_user_id = primary_user, merged_at = now(), updated_at = now() where id = secondary_user;
  end if;

  if primary_user is not null then
    select lower(coalesce(primary_email, email)) into surviving_email from public.profiles where id = primary_user;
  else
    surviving_email := nullif(lower(trim(primary_official.email)), '');
  end if;

  update public.officials
  set linked_user_id = primary_user, identity_status = 'merged', merged_into_official_id = primary_official_uuid, updated_at = now()
  where id = secondary_official_uuid;
  update public.officials
  set full_name = selected_full_name,
      secondary_email = nullif(lower(trim(selected_secondary_email)), ''),
      date_of_birth = selected_date_of_birth,
      phone = nullif(trim(selected_phone), ''),
      badge_level = nullif(trim(selected_badge_level), ''),
      email = coalesce(surviving_email, email),
      linked_user_id = primary_user,
      identity_status = case when primary_user is null then 'provisional' else 'linked' end,
      pending_org_roles = (select coalesce(array_agg(distinct role), array['referee']::public.membership_role[]) from unnest(primary_official.pending_org_roles || secondary_official.pending_org_roles) role),
      updated_at = now()
  where id = primary_official_uuid;

  if primary_user is not null and not primary_official.personal_contact_locked then
    update public.profiles set full_name = selected_full_name,
      secondary_email = nullif(lower(trim(selected_secondary_email)), ''),
      date_of_birth = selected_date_of_birth, phone = nullif(trim(selected_phone), ''), updated_at = now()
    where id = primary_user;
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, details)
  values (organization_uuid, auth.uid(), 'official_records_merged', 'official', primary_official_uuid::text,
    jsonb_build_object('primary_official_id', primary_official_uuid, 'secondary_official_id', secondary_official_uuid,
      'primary_user_id', primary_user, 'secondary_user_id', secondary_user, 'primary_email', surviving_email,
      'included_provisional_record', primary_official.linked_user_id is null or secondary_official.linked_user_id is null,
      'field_sources', field_sources));

  return jsonb_build_object('primary_official_id', primary_official_uuid, 'primary_user_id', primary_user,
    'primary_email', surviving_email, 'primary_is_linked', primary_user is not null);
end;
$$;

revoke execute on function public.merge_group_official_records_with_profile(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.merge_group_official_records_with_profile(uuid, uuid, uuid, jsonb) to authenticated;
