-- Law18Ref v0.2.1 — site-owner organization management
-- Organization creation is site-owner only. Destructive organization actions
-- use a short-lived password + email-link verification challenge.

create table if not exists public.organization_action_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_action text not null check (requested_action in ('deactivate', 'delete')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.organization_action_challenges enable row level security;
revoke all on public.organization_action_challenges from anon, authenticated;

create index if not exists organization_action_challenges_user_idx
  on public.organization_action_challenges(user_id, expires_at desc);

create or replace function public.jwt_has_recent_method(method_name text, maximum_age interval)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and to_timestamp(coalesce((auth.jwt() ->> 'iat')::bigint, 0)) >= now() - maximum_age
    and exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as method
      where method ->> 'method' = method_name
    )
$$;

create or replace function public.create_organization(organization_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(organization_name);
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  created_organization public.organizations;
begin
  if not public.is_site_owner() then
    raise exception 'Only the site owner can create organizations.';
  end if;
  if length(clean_name) < 2 or length(clean_name) > 120 then
    raise exception 'Organization name must be between 2 and 120 characters.';
  end if;

  base_slug := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'organization'; end if;
  candidate_slug := base_slug;
  while exists (select 1 from public.organizations where slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;

  insert into public.organizations (name, slug, active)
  values (clean_name, candidate_slug, true)
  returning * into created_organization;

  insert into public.audit_log
    (organization_id, actor_id, action, entity_type, entity_id, details)
  values
    (created_organization.id, auth.uid(), 'organization.created', 'organization',
     created_organization.id::text, jsonb_build_object('name', clean_name));

  return created_organization;
end;
$$;

create or replace function public.begin_organization_action(
  target_organization_id uuid,
  action_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_id uuid;
  target public.organizations;
begin
  if not public.is_site_owner() then
    raise exception 'Only the site owner can manage organizations.';
  end if;
  if action_name not in ('deactivate', 'delete') then
    raise exception 'Unsupported organization action.';
  end if;
  if not public.jwt_has_recent_method('password', interval '5 minutes') then
    raise exception 'Please confirm your password again.';
  end if;

  select * into target from public.organizations
  where id = target_organization_id;
  if not found then raise exception 'Organization not found.'; end if;
  if action_name = 'deactivate' and not target.active then
    raise exception 'This organization is already deactivated.';
  end if;
  if action_name = 'delete' then
    if target.active then
      raise exception 'Deactivate this organization before deleting it.';
    end if;
    if target.deactivated_at is null or target.deactivated_at > now() - interval '7 days' then
      raise exception 'A deactivated organization must remain recoverable for seven days before permanent deletion.';
    end if;
  end if;

  delete from public.organization_action_challenges
  where user_id = auth.uid() and completed_at is null;

  insert into public.organization_action_challenges
    (user_id, organization_id, requested_action)
  values
    (auth.uid(), target_organization_id, action_name)
  returning id into challenge_id;

  insert into public.audit_log
    (organization_id, actor_id, action, entity_type, entity_id, details)
  values
    (target_organization_id, auth.uid(), 'organization.verification_started',
     'organization', target_organization_id::text,
     jsonb_build_object('requested_action', action_name));

  return challenge_id;
end;
$$;

create or replace function public.complete_organization_action(challenge_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge public.organization_action_challenges;
  target public.organizations;
  result_message text;
begin
  if not public.is_site_owner() then
    raise exception 'Only the site owner can manage organizations.';
  end if;
  if not public.jwt_has_recent_method('otp', interval '15 minutes') then
    raise exception 'Open the verification link sent to the site owner email.';
  end if;

  select * into challenge
  from public.organization_action_challenges
  where id = challenge_id and user_id = auth.uid()
  for update;
  if not found or challenge.completed_at is not null or challenge.expires_at < now() then
    raise exception 'This verification link is invalid or has expired.';
  end if;

  select * into target from public.organizations
  where id = challenge.organization_id;
  if not found then raise exception 'Organization not found.'; end if;

  if challenge.requested_action = 'deactivate' then
    update public.organizations
    set active = false, deactivated_at = now(), deactivated_by = auth.uid()
    where id = target.id;
    update public.organization_action_challenges
    set completed_at = now() where id = challenge.id;
    insert into public.audit_log
      (organization_id, actor_id, action, entity_type, entity_id, details)
    values
      (target.id, auth.uid(), 'organization.deactivated', 'organization',
       target.id::text, jsonb_build_object('name', target.name));
    result_message := target.name || ' was deactivated.';
  else
    if target.active or target.deactivated_at is null
       or target.deactivated_at > now() - interval '7 days' then
      raise exception 'This organization is not eligible for permanent deletion.';
    end if;
    delete from public.organizations where id = target.id;
    insert into public.audit_log
      (actor_id, action, entity_type, entity_id, details)
    values
      (auth.uid(), 'organization.deleted', 'organization', target.id::text,
       jsonb_build_object('name', target.name));
    result_message := target.name || ' was permanently deleted.';
  end if;

  return result_message;
end;
$$;

create or replace function public.reactivate_organization(target_organization_id uuid)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  restored public.organizations;
begin
  if not public.is_site_owner() then
    raise exception 'Only the site owner can reactivate organizations.';
  end if;
  update public.organizations
  set active = true, deactivated_at = null, deactivated_by = null
  where id = target_organization_id and active = false
  returning * into restored;
  if not found then raise exception 'Deactivated organization not found.'; end if;
  insert into public.audit_log
    (organization_id, actor_id, action, entity_type, entity_id, details)
  values
    (restored.id, auth.uid(), 'organization.reactivated', 'organization',
     restored.id::text, jsonb_build_object('name', restored.name));
  return restored;
end;
$$;

grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.begin_organization_action(uuid, text) to authenticated;
grant execute on function public.complete_organization_action(uuid) to authenticated;
grant execute on function public.reactivate_organization(uuid) to authenticated;
