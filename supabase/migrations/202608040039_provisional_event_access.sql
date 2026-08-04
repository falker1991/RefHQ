-- Law18Ref v0.12.4: event permissions may be staged before account creation.

create table if not exists public.provisional_event_access (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references public.officials(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  roles public.membership_role[] not null default array['referee']::public.membership_role[],
  full_schedule_access boolean not null default true,
  coaching_tools_enabled boolean not null default false,
  ratings_history_scope text not null default 'none' check (ratings_history_scope in ('none','specific','all')),
  ratings_event_ids uuid[] not null default '{}',
  assigned_game_ids uuid[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (official_id, event_id)
);

alter table public.provisional_event_access enable row level security;

create policy "cleared event staff view provisional access"
on public.provisional_event_access for select
using (
  exists (
    select 1 from public.events event
    where event.id = event_id and (
      public.is_site_owner()
      or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
      or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
    )
  )
);

grant select on public.provisional_event_access to authenticated;

create or replace function public.save_provisional_event_access(
  official_uuid uuid,
  event_uuid uuid,
  requested_roles public.membership_role[],
  requested_full_schedule boolean,
  requested_coaching_tools boolean,
  requested_ratings_scope text,
  requested_ratings_events uuid[],
  requested_game_ids uuid[]
)
returns public.provisional_event_access
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  official_org uuid;
  normalized_roles public.membership_role[] := coalesce(requested_roles, array['referee']::public.membership_role[]);
  saved public.provisional_event_access;
begin
  select organization_id into target_org from public.events where id = event_uuid;
  select organization_id into official_org from public.officials where id = official_uuid and linked_user_id is null;
  if target_org is null or official_org is null or target_org <> official_org then
    raise exception 'The provisional official and event must belong to the same organization.';
  end if;
  if normalized_roles = '{}'::public.membership_role[] then
    normalized_roles := array['referee']::public.membership_role[];
  end if;
  if normalized_roles && array['site_owner','organization_director','organization_admin']::public.membership_role[] then
    raise exception 'Organization leadership cannot be staged as event access.';
  end if;

  if public.is_site_owner()
     or public.has_org_role(target_org, array['organization_director','organization_admin']::public.membership_role[]) then
    if not normalized_roles <@ array['event_admin','assignor','site_coordinator','referee_coach','referee']::public.membership_role[] then
      raise exception 'Unsupported event role.';
    end if;
  elsif public.has_event_role(event_uuid, array['event_admin']::public.membership_role[]) then
    if not normalized_roles <@ array['assignor','site_coordinator','referee_coach','referee']::public.membership_role[] then
      raise exception 'Event Admins may stage roles beneath Event Admin.';
    end if;
  elsif public.has_event_role(event_uuid, array['assignor']::public.membership_role[]) then
    if not normalized_roles <@ array['site_coordinator','referee_coach','referee']::public.membership_role[] then
      raise exception 'Assignors may stage Referee Coach and Site Supervisor access.';
    end if;
  else
    raise exception 'You do not have permission to stage event access.';
  end if;

  insert into public.provisional_event_access (
    official_id, event_id, roles, full_schedule_access, coaching_tools_enabled,
    ratings_history_scope, ratings_event_ids, assigned_game_ids, created_by
  ) values (
    official_uuid, event_uuid, normalized_roles, coalesce(requested_full_schedule, true),
    coalesce(requested_coaching_tools, false), coalesce(requested_ratings_scope, 'none'),
    coalesce(requested_ratings_events, '{}'), coalesce(requested_game_ids, '{}'), auth.uid()
  )
  on conflict (official_id, event_id) do update set
    roles = excluded.roles,
    full_schedule_access = excluded.full_schedule_access,
    coaching_tools_enabled = excluded.coaching_tools_enabled,
    ratings_history_scope = excluded.ratings_history_scope,
    ratings_event_ids = excluded.ratings_event_ids,
    assigned_game_ids = excluded.assigned_game_ids,
    updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

grant execute on function public.save_provisional_event_access(uuid, uuid, public.membership_role[], boolean, boolean, text, uuid[], uuid[]) to authenticated;

-- Preserve organization-role activation and materialize staged event access
-- after the email-matched provisional official becomes linked.
create or replace function public.link_current_referee()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if verified_email = '' then return; end if;

  insert into public.profiles (id, organization_id, full_name, email, primary_email, role)
  select auth.uid(), null,
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', split_part(verified_email, '@', 1)),
    verified_email, verified_email, 'referee'::public.app_role
  on conflict (id) do update set primary_email = excluded.primary_email, email = excluded.email;

  update public.officials
  set linked_user_id = auth.uid(), identity_status = 'linked', updated_at = now()
  where lower(trim(email)) = verified_email
    and (linked_user_id is null or linked_user_id = auth.uid());

  insert into public.organization_memberships (organization_id, user_id, role, status)
  select distinct official.organization_id, auth.uid(), intended.role, 'active'::public.membership_status
  from public.officials official
  cross join lateral unnest(case when cardinality(official.pending_org_roles) > 0 then official.pending_org_roles else array[coalesce(official.pending_org_role, 'referee'::public.membership_role)] end) intended(role)
  where official.linked_user_id = auth.uid()
    and intended.role not in ('site_owner','event_admin')
  on conflict (organization_id, user_id, role) do update set status = 'active', updated_at = now();

  insert into public.event_memberships (
    event_id, user_id, role, full_schedule_access, coaching_tools_enabled,
    ratings_history_scope, ratings_event_ids, assigned_game_ids, created_by
  )
  select staged.event_id, auth.uid(), intended.role, staged.full_schedule_access,
    staged.coaching_tools_enabled, staged.ratings_history_scope,
    staged.ratings_event_ids, staged.assigned_game_ids, staged.created_by
  from public.provisional_event_access staged
  join public.officials official on official.id = staged.official_id
  cross join lateral unnest(staged.roles) intended(role)
  where official.linked_user_id = auth.uid()
  on conflict (event_id, user_id, role) do update set
    full_schedule_access = excluded.full_schedule_access,
    coaching_tools_enabled = excluded.coaching_tools_enabled,
    ratings_history_scope = excluded.ratings_history_scope,
    ratings_event_ids = excluded.ratings_event_ids,
    assigned_game_ids = excluded.assigned_game_ids;

  delete from public.provisional_event_access staged
  using public.officials official
  where staged.official_id = official.id and official.linked_user_id = auth.uid();
end;
$$;

grant execute on function public.link_current_referee() to authenticated;
