-- RefHQ MVP schema for Supabase/PostgreSQL
create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'assignor', 'referee', 'coach');
create type public.assignment_position as enum ('referee', 'assistant_referee', 'fourth_official', 'mentor');
create type public.check_in_status as enum ('expected', 'checked_in', 'late', 'missing', 'excused');
create type public.assessment_status as enum ('draft', 'submitted', 'shared');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'referee',
  phone text,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  venue_name text not null,
  starts_on date not null,
  ends_on date not null,
  timezone text not null default 'America/New_York',
  check_in_slug text not null unique,
  check_in_opens_minutes int not null default 90,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  external_id text,
  starts_at timestamptz not null,
  field_name text not null,
  home_team text not null,
  away_team text not null,
  division text,
  created_at timestamptz not null default now(),
  unique(event_id, external_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  position public.assignment_position not null,
  accepted boolean not null default false,
  unique(game_id, referee_id, position)
);

create table public.coach_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  status public.check_in_status not null default 'checked_in',
  checked_in_at timestamptz not null default now(),
  method text not null default 'qr',
  recorded_by uuid references public.profiles(id),
  unique(event_id, referee_id)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  status public.assessment_status not null default 'draft',
  positioning smallint check (positioning between 1 and 5),
  decision_making smallint check (decision_making between 1 and 5),
  communication smallint check (communication between 1 and 5),
  match_control smallint check (match_control between 1 and 5),
  strengths text,
  development_focus text,
  coach_notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(game_id, referee_id, coach_id)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  source text not null default 'assignr_csv',
  file_name text not null,
  row_count int not null default 0,
  status text not null default 'pending',
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index games_event_starts_idx on public.games(event_id, starts_at);
create index assignments_referee_idx on public.assignments(referee_id);
create index assessments_referee_idx on public.assessments(referee_id, created_at desc);

create or replace function public.current_org_id() returns uuid language sql stable security definer set search_path = '' as $$
  select organization_id from public.profiles where id = auth.uid()
$$;
create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.games enable row level security;
alter table public.assignments enable row level security;
alter table public.coach_assignments enable row level security;
alter table public.check_ins enable row level security;
alter table public.assessments enable row level security;
alter table public.import_jobs enable row level security;

create policy "members view organization" on public.organizations for select using (id = public.current_org_id());
create policy "members view profiles" on public.profiles for select using (organization_id = public.current_org_id());
create policy "staff manage profiles" on public.profiles for all using (organization_id = public.current_org_id() and public.current_role() in ('admin','assignor')) with check (organization_id = public.current_org_id());
create policy "members view events" on public.events for select using (organization_id = public.current_org_id());
create policy "staff manage events" on public.events for all using (organization_id = public.current_org_id() and public.current_role() in ('admin','assignor')) with check (organization_id = public.current_org_id());
create policy "members view games" on public.games for select using (event_id in (select id from public.events where organization_id = public.current_org_id()));
create policy "staff manage games" on public.games for all using (event_id in (select id from public.events where organization_id = public.current_org_id()) and public.current_role() in ('admin','assignor'));
create policy "members view relevant assignments" on public.assignments for select using (referee_id = auth.uid() or public.current_role() in ('admin','assignor','coach'));
create policy "staff manage assignments" on public.assignments for all using (public.current_role() in ('admin','assignor'));
create policy "coaches view coaching scope" on public.coach_assignments for select using (coach_id = auth.uid() or public.current_role() in ('admin','assignor'));
create policy "staff manage coaching" on public.coach_assignments for all using (public.current_role() in ('admin','assignor'));
create policy "members view relevant checkins" on public.check_ins for select using (referee_id = auth.uid() or public.current_role() in ('admin','assignor','coach'));
create policy "referees check themselves in" on public.check_ins for insert with check (referee_id = auth.uid());
create policy "staff manage checkins" on public.check_ins for all using (public.current_role() in ('admin','assignor'));
create policy "assessment participants view" on public.assessments for select using (organization_id = public.current_org_id() and (referee_id = auth.uid() or coach_id = auth.uid() or public.current_role() in ('admin','assignor')));
create policy "coaches create assessments" on public.assessments for insert with check (organization_id = public.current_org_id() and coach_id = auth.uid() and public.current_role() = 'coach');
create policy "coaches update own drafts" on public.assessments for update using (coach_id = auth.uid() and status = 'draft') with check (coach_id = auth.uid());
create policy "staff manage assessments" on public.assessments for all using (organization_id = public.current_org_id() and public.current_role() in ('admin','assignor'));
create policy "staff manage imports" on public.import_jobs for all using (organization_id = public.current_org_id() and public.current_role() in ('admin','assignor')) with check (organization_id = public.current_org_id());
