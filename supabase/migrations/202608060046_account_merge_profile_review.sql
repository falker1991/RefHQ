-- Law18Ref v0.18.1: field-by-field profile resolution during account merges.

create or replace function public.secure_merge_organization_accounts_with_profile(
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
  merge_result jsonb;
  selected_full_name text;
  selected_secondary_email text;
  selected_date_of_birth date;
  selected_phone text;
  selected_badge_level text;
begin
  select * into primary_official
  from public.officials
  where id = primary_official_uuid and organization_id = organization_uuid;

  select * into secondary_official
  from public.officials
  where id = secondary_official_uuid and organization_id = organization_uuid;

  if primary_official.id is null or secondary_official.id is null then
    raise exception 'Both officials must be active members of this group.';
  end if;

  if primary_official.personal_contact_locked and (
    coalesce(field_sources->>'full_name', 'primary') = 'secondary'
    or coalesce(field_sources->>'secondary_email', 'primary') = 'secondary'
    or coalesce(field_sources->>'date_of_birth', 'primary') = 'secondary'
    or coalesce(field_sources->>'phone', 'primary') = 'secondary'
  ) then
    raise exception 'The primary user has locked their personal contact information.';
  end if;

  selected_full_name := case when field_sources->>'full_name' = 'secondary'
    then secondary_official.full_name else primary_official.full_name end;
  selected_secondary_email := case when field_sources->>'secondary_email' = 'secondary'
    then secondary_official.secondary_email else primary_official.secondary_email end;
  selected_date_of_birth := case when field_sources->>'date_of_birth' = 'secondary'
    then secondary_official.date_of_birth else primary_official.date_of_birth end;
  selected_phone := case when field_sources->>'phone' = 'secondary'
    then secondary_official.phone else primary_official.phone end;
  selected_badge_level := case when field_sources->>'badge_level' = 'secondary'
    then secondary_official.badge_level else primary_official.badge_level end;

  merge_result := public.secure_merge_organization_accounts(
    organization_uuid,
    primary_official_uuid,
    secondary_official_uuid
  );

  if not primary_official.personal_contact_locked then
    update public.profiles
    set full_name = selected_full_name,
        secondary_email = nullif(lower(trim(selected_secondary_email)), ''),
        date_of_birth = selected_date_of_birth,
        phone = nullif(trim(selected_phone), ''),
        updated_at = now()
    where id = primary_official.linked_user_id;
  end if;

  update public.officials
  set badge_level = nullif(trim(selected_badge_level), ''),
      updated_at = now()
  where id = primary_official_uuid;

  insert into public.audit_log
    (organization_id, actor_id, action, entity_type, entity_id, details)
  values (
    organization_uuid,
    auth.uid(),
    'account_merge_profile_resolved',
    'official',
    primary_official_uuid::text,
    jsonb_build_object('field_sources', field_sources)
  );

  return merge_result || jsonb_build_object('field_sources', field_sources);
end;
$$;

revoke all on function public.secure_merge_organization_accounts_with_profile(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.secure_merge_organization_accounts_with_profile(uuid, uuid, uuid, jsonb) to authenticated;

