-- Law18Ref v0.10.0: private personal calendar feeds and unified assignments.

create table if not exists public.personal_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'other' check (provider in ('assignr', 'arbiter', 'usofficials', 'refquest', 'other')),
  display_name text not null,
  feed_url_ciphertext text not null,
  feed_url_iv text not null,
  active boolean not null default true,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'syncing', 'connected', 'error', 'paused')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, display_name)
);

create table if not exists public.external_calendar_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_id uuid not null references public.personal_calendar_feeds(id) on delete cascade,
  external_uid text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text,
  description text,
  source_url text,
  assignment_status text not null default 'external',
  source_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feed_id, external_uid)
);

create index if not exists personal_calendar_feeds_user_idx
  on public.personal_calendar_feeds(user_id, active);
create index if not exists external_calendar_assignments_user_time_idx
  on public.external_calendar_assignments(user_id, starts_at);

alter table public.personal_calendar_feeds enable row level security;
alter table public.external_calendar_assignments enable row level security;

-- Feed URLs are deliberately unavailable through the authenticated REST API.
-- The Cloudflare Worker owns ciphertext writes through its service-role connection.
revoke all on public.personal_calendar_feeds from authenticated;
grant select on public.external_calendar_assignments to authenticated;

drop policy if exists "users read their external assignments" on public.external_calendar_assignments;
create policy "users read their external assignments"
  on public.external_calendar_assignments for select
  using (user_id = auth.uid());

create or replace function public.my_calendar_feed_connections()
returns table (
  id uuid,
  provider text,
  display_name text,
  active boolean,
  sync_status text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.provider, f.display_name, f.active, f.sync_status,
    f.last_synced_at, f.last_error, f.created_at
  from public.personal_calendar_feeds f
  where f.user_id = auth.uid()
  order by f.created_at;
$$;

grant execute on function public.my_calendar_feed_connections() to authenticated;

create or replace function public.my_law18_assignments()
returns table (
  id uuid,
  source_id uuid,
  source_type text,
  source_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue text,
  position_title text,
  status text,
  source_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, e.id, 'law18ref'::text, e.name,
    concat_ws(' vs. ', nullif(g.home_team, ''), nullif(g.away_team, '')),
    g.starts_at,
    null::timestamptz,
    concat_ws(' · ', nullif(g.venue_name, ''), nullif(g.field_name, '')),
    coalesce(nullif(a.position_title, ''), initcap(replace(a.position::text, '_', ' '))),
    'assigned'::text,
    null::text
  from public.assignments a
  join public.officials o on o.id = a.official_id
  join public.games g on g.id = a.game_id
  join public.events e on e.id = g.event_id
  where o.linked_user_id = auth.uid()
    and e.archived_at is null;
$$;

grant execute on function public.my_law18_assignments() to authenticated;

create or replace function public.my_external_assignments()
returns table (
  id uuid,
  source_id uuid,
  source_type text,
  source_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue text,
  position_title text,
  status text,
  source_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, f.id, f.provider, f.display_name, a.title, a.starts_at, a.ends_at,
    a.venue, null::text, a.assignment_status, a.source_url
  from public.external_calendar_assignments a
  join public.personal_calendar_feeds f on f.id = a.feed_id
  where a.user_id = auth.uid()
    and f.active;
$$;

grant execute on function public.my_external_assignments() to authenticated;
