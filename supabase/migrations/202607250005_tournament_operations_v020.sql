-- Law18Referee Management v0.2.0 — tournament operations
-- Adds scoped memberships, durable imported identities, daily check-in,
-- coach scope, assessment visibility, appearance campaigns, and audit history.

do $$ begin
  create type public.membership_role as enum
    ('site_owner', 'organization_admin', 'event_admin', 'assignor', 'referee_coach', 'referee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum
    ('pending', 'active', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.assessment_visibility as enum ('public', 'private');
exception when duplicate_object then null; end $$;

alter table public.organizations
  add column if not exists active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users(id);

alter table public.profiles
  alter column organization_id drop not null,
  add column if not exists primary_email text,
  add column if not exists secondary_email text,
  add column if not exists date_of_birth date,
  add column if not exists preferred_name text,
  add column if not exists is_site_owner boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.profiles set primary_email = lower(trim(email))
where primary_email is null and email is not null;

create unique index if not exists profiles_primary_email_unique
  on public.profiles(lower(primary_email))
  where primary_email is not null;

alter table public.officials
  alter column email drop not null,
  add column if not exists source text not null default 'manual',
  add column if not exists source_official_id text,
  add column if not exists source_display_name text,
  add column if not exists secondary_email text,
  add column if not exists date_of_birth date,
  add column if not exists phone text,
  add column if not exists badge_level text,
  add column if not exists claim_code_hash text,
  add column if not exists identity_status text not null default 'provisional',
  add column if not exists updated_at timestamptz not null default now();

drop index if exists officials_email_idx;
create unique index if not exists officials_org_email_unique
  on public.officials(organization_id, lower(email))
  where email is not null;
create unique index if not exists officials_source_identity_unique
  on public.officials(organization_id, source, source_official_id)
  where source_official_id is not null;
create index if not exists officials_name_search_idx
  on public.officials(organization_id, lower(full_name));

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'referee',
  status public.membership_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, role)
);

create table if not exists public.event_memberships (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  full_schedule_access boolean not null default true,
  coaching_tools_enabled boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (event_id, user_id, role)
);

alter table public.events
  add column if not exists archived_at timestamptz,
  add column if not exists check_in_code_version integer not null default 1;

alter table public.check_ins
  add column if not exists event_date date;

update public.check_ins c
set event_date = coalesce(
  (select min((g.starts_at at time zone e.timezone)::date)
   from public.assignments a
   join public.games g on g.id = a.game_id
   join public.events e on e.id = c.event_id
   where a.official_id = c.official_id and g.event_id = c.event_id),
  (select starts_on from public.events where id = c.event_id)
)
where event_date is null;

alter table public.check_ins alter column event_date set not null;
alter table public.check_ins alter column event_date set default current_date;
drop index if exists check_ins_event_official_idx;
alter table public.check_ins drop constraint if exists check_ins_event_official_key;
create unique index if not exists check_ins_event_date_official_unique
  on public.check_ins(event_id, event_date, official_id)
  where official_id is not null;

alter table public.coach_assignments
  add column if not exists official_id uuid references public.officials(id) on delete cascade,
  add column if not exists scope_date date,
  add column if not exists venue_name text,
  add column if not exists field_name text,
  add column if not exists full_schedule boolean not null default true;

alter table public.assessments
  alter column referee_id drop not null,
  add column if not exists official_id uuid references public.officials(id) on delete cascade,
  add column if not exists visibility public.assessment_visibility not null default 'private';
create unique index if not exists assessments_game_official_coach_unique
  on public.assessments(game_id, official_id, coach_id)
  where official_id is not null;

create table if not exists public.import_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid references public.import_jobs(id) on delete cascade,
  imported_name text not null,
  imported_email text,
  source_official_id text,
  reason text not null,
  status text not null default 'open',
  resolved_official_id uuid references public.officials(id),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.site_appearance_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  primary_color text,
  accent_color text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_memberships_user_idx
  on public.organization_memberships(user_id, status);
create index if not exists event_memberships_user_idx
  on public.event_memberships(user_id, role);
create index if not exists audit_log_scope_idx
  on public.audit_log(organization_id, event_id, created_at desc);

-- Migrate the original one-role profile records into scoped memberships.
insert into public.organization_memberships (organization_id, user_id, role, status)
select organization_id, id,
  case role::text
    when 'admin' then 'organization_admin'::public.membership_role
    when 'assignor' then 'assignor'::public.membership_role
    when 'coach' then 'referee_coach'::public.membership_role
    else 'referee'::public.membership_role
  end,
  'active'::public.membership_status
from public.profiles
where organization_id is not null
on conflict (organization_id, user_id, role) do nothing;

create or replace function public.is_site_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_site_owner from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.has_org_role(org_id uuid, allowed public.membership_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_site_owner() or exists (
    select 1 from public.organization_memberships
    where organization_id = org_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any(allowed)
  )
$$;

create or replace function public.has_event_role(event_uuid uuid, allowed public.membership_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_site_owner()
    or exists (
      select 1 from public.events e
      where e.id = event_uuid
        and public.has_org_role(e.organization_id, array['organization_admin']::public.membership_role[])
    )
    or exists (
      select 1 from public.event_memberships
      where event_id = event_uuid and user_id = auth.uid() and role = any(allowed)
    )
$$;

grant execute on function public.is_site_owner() to authenticated;
grant execute on function public.has_org_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.has_event_role(uuid, public.membership_role[]) to authenticated;

alter table public.organization_memberships enable row level security;
alter table public.event_memberships enable row level security;
alter table public.import_identity_conflicts enable row level security;
alter table public.site_appearance_campaigns enable row level security;
alter table public.audit_log enable row level security;

create policy "members view organization memberships"
  on public.organization_memberships for select
  using (
    user_id = auth.uid()
    or public.has_org_role(organization_id, array['organization_admin']::public.membership_role[])
  );
create policy "organization admins manage memberships"
  on public.organization_memberships for all
  using (public.has_org_role(organization_id, array['organization_admin']::public.membership_role[]))
  with check (public.has_org_role(organization_id, array['organization_admin']::public.membership_role[]));

create policy "members view event memberships"
  on public.event_memberships for select
  using (
    user_id = auth.uid()
    or public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[])
  );
create policy "event admins manage event memberships"
  on public.event_memberships for all
  using (public.has_event_role(event_id, array['event_admin']::public.membership_role[]))
  with check (public.has_event_role(event_id, array['event_admin']::public.membership_role[]));

create policy "admins manage import conflicts"
  on public.import_identity_conflicts for all
  using (public.has_org_role(organization_id, array['organization_admin']::public.membership_role[]))
  with check (public.has_org_role(organization_id, array['organization_admin']::public.membership_role[]));

create policy "everyone views active appearance"
  on public.site_appearance_campaigns for select
  using (active and now() between starts_at and ends_at or public.is_site_owner());
create policy "owner manages appearance"
  on public.site_appearance_campaigns for all
  using (public.is_site_owner())
  with check (public.is_site_owner());

create policy "authorized users view audit"
  on public.audit_log for select
  using (
    public.is_site_owner()
    or (organization_id is not null and public.has_org_role(
      organization_id, array['organization_admin']::public.membership_role[]
    ))
    or (event_id is not null and public.has_event_role(
      event_id, array['event_admin','assignor']::public.membership_role[]
    ))
  );
create policy "authenticated append audit"
  on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid());

-- Replace broad legacy read policies with scoped equivalents.
drop policy if exists "members view organization" on public.organizations;
create policy "scoped members view organization" on public.organizations for select
  using (
    public.is_site_owner()
    or exists (
      select 1 from public.organization_memberships m
      where m.organization_id = organizations.id and m.user_id = auth.uid() and m.status = 'active'
    )
  );
create policy "owner creates organizations" on public.organizations for insert
  with check (public.is_site_owner());
create policy "organization admins update organization" on public.organizations for update
  using (public.has_org_role(organizations.id, array['organization_admin']::public.membership_role[]));

drop policy if exists "members view events" on public.events;
create policy "scoped members view events" on public.events for select
  using (
    archived_at is null and (
      public.has_org_role(organization_id, array['organization_admin']::public.membership_role[])
      or exists (
        select 1 from public.event_memberships em
        where em.event_id = events.id and em.user_id = auth.uid()
      )
      or exists (
        select 1 from public.games g
        join public.assignments a on a.game_id = g.id
        join public.officials o on o.id = a.official_id
        where g.event_id = events.id and o.linked_user_id = auth.uid()
      )
    )
  );
create policy "scoped staff create events" on public.events for insert
  with check (public.has_org_role(
    organization_id, array['organization_admin','event_admin','assignor']::public.membership_role[]
  ));
create policy "scoped staff update events" on public.events for update
  using (public.has_event_role(events.id, array['event_admin','assignor']::public.membership_role[]));

create policy "scoped staff manage games" on public.games for all
  using (public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[]))
  with check (public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[]));
create policy "scoped users view games" on public.games for select
  using (
    public.has_event_role(event_id, array['event_admin','assignor','referee_coach','referee']::public.membership_role[])
    or exists (
      select 1 from public.assignments a
      join public.officials o on o.id = a.official_id
      where a.game_id = games.id and o.linked_user_id = auth.uid()
    )
  );

create policy "scoped staff manage assignments" on public.assignments for all
  using (public.has_event_role(
    (select event_id from public.games where public.games.id = assignments.game_id),
    array['event_admin','assignor']::public.membership_role[]
  ))
  with check (public.has_event_role(
    (select event_id from public.games where public.games.id = assignments.game_id),
    array['event_admin','assignor']::public.membership_role[]
  ));

create policy "scoped coaches view coach assignments" on public.coach_assignments for select
  using (
    coach_id = auth.uid()
    or public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[])
  );
create policy "scoped staff manage coach assignments" on public.coach_assignments for all
  using (public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[]))
  with check (public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[]));

create policy "scoped staff view checkins" on public.check_ins for select
  using (public.has_event_role(event_id, array['event_admin','assignor','referee_coach']::public.membership_role[]));
create policy "scoped staff manage checkins" on public.check_ins for all
  using (public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[]))
  with check (public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[]));

create policy "scoped assessment visibility" on public.assessments for select
  using (
    coach_id = auth.uid()
    or public.has_event_role(
      (select event_id from public.games where public.games.id = assessments.game_id),
      array['event_admin','assignor']::public.membership_role[]
    )
    or (
      visibility = 'public'
      and official_id in (select id from public.officials where linked_user_id = auth.uid())
    )
  );
create policy "scoped coaches submit assessments" on public.assessments for insert
  with check (
    coach_id = auth.uid()
    and (
      public.has_event_role(
        (select event_id from public.games where public.games.id = assessments.game_id),
        array['event_admin','assignor','referee_coach']::public.membership_role[]
      )
    )
  );
create policy "scoped coaches update assessments" on public.assessments for update
  using (
    coach_id = auth.uid()
    or public.has_event_role(
      (select event_id from public.games where public.games.id = assessments.game_id),
      array['event_admin','assignor']::public.membership_role[]
    )
  );

drop policy if exists "members view profiles" on public.profiles;
create policy "users view own profile and admins view members" on public.profiles for select
  using (
    profiles.id = auth.uid() or public.is_site_owner()
    or exists (
      select 1 from public.organization_memberships mine
      join public.organization_memberships theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and mine.role = 'organization_admin'
        and mine.status = 'active'
        and theirs.user_id = profiles.id
    )
  );
drop policy if exists "staff manage profiles" on public.profiles;
create policy "users update own profile" on public.profiles for update
  using (profiles.id = auth.uid()) with check (profiles.id = auth.uid());

drop policy if exists "staff manage imported officials" on public.officials;
create policy "organization staff manage officials" on public.officials for all
  using (
    public.has_org_role(organization_id, array['organization_admin','assignor']::public.membership_role[])
    or exists (
      select 1 from public.event_memberships em
      join public.events e on e.id = em.event_id
      where e.organization_id = officials.organization_id
        and em.user_id = auth.uid() and em.role in ('event_admin','assignor')
    )
  )
  with check (
    public.has_org_role(organization_id, array['organization_admin','assignor']::public.membership_role[])
    or exists (
      select 1 from public.event_memberships em
      join public.events e on e.id = em.event_id
      where e.organization_id = officials.organization_id
        and em.user_id = auth.uid() and em.role in ('event_admin','assignor')
    )
  );

-- Link a verified account to every uniquely matching provisional record while
-- keeping its site profile independent of any one organization.
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
  select distinct organization_id, auth.uid(), 'referee'::public.membership_role, 'active'::public.membership_status
  from public.officials
  where linked_user_id = auth.uid()
  on conflict (organization_id, user_id, role)
  do update set status = 'active', updated_at = now();
end;
$$;
grant execute on function public.link_current_referee() to authenticated;

-- Preserve legacy admin/assignor policies during the migration window; new app
-- authorization additionally checks scoped memberships before exposing actions.

grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.event_memberships to authenticated;
grant select, insert, update, delete on public.import_identity_conflicts to authenticated;
grant select, insert, update, delete on public.site_appearance_campaigns to authenticated;
grant select, insert on public.audit_log to authenticated;
