-- Law18Ref v0.17.0: account-free guest check-in using exact imported identity matching.

alter table public.events
  add column if not exists guest_check_in_enabled boolean not null default false;

create table if not exists public.guest_check_in_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_date date not null,
  official_id uuid not null references public.officials(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.guest_check_in_sessions enable row level security;
revoke all on public.guest_check_in_sessions from anon, authenticated;

create index if not exists guest_check_in_sessions_expiry_idx
  on public.guest_check_in_sessions(expires_at);

create or replace function public.find_guest_check_in(
  event_slug text,
  event_day date,
  entered_last_name text,
  entered_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_event public.events;
  selected_official public.officials;
  lookup_token uuid;
  daily_schedule jsonb;
  already_checked_in boolean;
begin
  delete from public.guest_check_in_sessions where expires_at < now() - interval '1 day';

  if btrim(coalesce(entered_last_name, '')) = '' or btrim(coalesce(entered_email, '')) = '' then
    raise exception 'Enter the last name and email from your Assignr account.';
  end if;

  select * into selected_event
  from public.events event
  where event.check_in_slug = event_slug
    and event.archived_at is null
    and event.check_in_enabled
    and event.guest_check_in_enabled
    and coalesce((event.feature_settings ->> 'check_in')::boolean, true)
    and event_day between event.starts_on and event.ends_on;

  if selected_event.id is null then
    raise exception 'Guest check-in is not available for this event date.';
  end if;

  select official.* into selected_official
  from public.officials official
  where official.organization_id = selected_event.organization_id
    and lower(btrim(official.email)) = lower(btrim(entered_email))
    and lower(regexp_replace(btrim(official.full_name), '^.*\s+', '')) = lower(btrim(entered_last_name))
    and exists (
      select 1
      from public.assignments assignment
      join public.games game on game.id = assignment.game_id
      where assignment.official_id = official.id
        and game.event_id = selected_event.id
        and (game.starts_at at time zone selected_event.timezone)::date = event_day
    )
  order by official.created_at
  limit 1;

  if selected_official.id is null then
    raise exception 'No scheduled official matched that last name and email. Use the information exactly as it appears in your Assignr account or see event staff.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'game_id', game.id,
    'starts_at', game.starts_at,
    'field_name', game.field_name,
    'venue_name', game.venue_name,
    'home_team', game.home_team,
    'away_team', game.away_team,
    'age_group', game.age_group,
    'gender', game.gender,
    'position', assignment.position,
    'position_title', assignment.position_title
  ) order by game.starts_at, assignment.position_title), '[]'::jsonb)
  into daily_schedule
  from public.assignments assignment
  join public.games game on game.id = assignment.game_id
  where assignment.official_id = selected_official.id
    and game.event_id = selected_event.id
    and (game.starts_at at time zone selected_event.timezone)::date = event_day;

  select exists (
    select 1 from public.check_ins checkin
    where checkin.event_id = selected_event.id
      and checkin.event_date = event_day
      and checkin.official_id = selected_official.id
      and checkin.status = 'checked_in'
  ) into already_checked_in;

  insert into public.guest_check_in_sessions(event_id, event_date, official_id)
  values (selected_event.id, event_day, selected_official.id)
  returning id into lookup_token;

  return jsonb_build_object(
    'token', lookup_token,
    'event_name', selected_event.name,
    'event_date', event_day,
    'official_name', selected_official.full_name,
    'already_checked_in', already_checked_in,
    'assignments', daily_schedule
  );
end;
$$;

create or replace function public.confirm_guest_check_in(lookup_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  guest_session public.guest_check_in_sessions;
  selected_event public.events;
  existing_check_in public.check_ins;
begin
  select * into guest_session
  from public.guest_check_in_sessions
  where id = lookup_token and expires_at > now()
  for update;

  if guest_session.id is null then
    raise exception 'This confirmation has expired. Scan the event QR code and try again.';
  end if;

  select * into selected_event from public.events where id = guest_session.event_id;
  if selected_event.id is null or selected_event.archived_at is not null
     or not selected_event.check_in_enabled or not selected_event.guest_check_in_enabled
     or not coalesce((selected_event.feature_settings ->> 'check_in')::boolean, true) then
    raise exception 'Guest check-in is no longer available for this event.';
  end if;

  select * into existing_check_in
  from public.check_ins
  where event_id = guest_session.event_id
    and event_date = guest_session.event_date
    and official_id = guest_session.official_id;

  if existing_check_in.id is null then
    insert into public.check_ins(event_id, event_date, official_id, status, method, checked_in_at)
    values (guest_session.event_id, guest_session.event_date, guest_session.official_id, 'checked_in', 'guest_qr', now())
    returning * into existing_check_in;
  elsif existing_check_in.status <> 'checked_in' then
    update public.check_ins
    set status = 'checked_in', method = 'guest_qr', checked_in_at = now(), recorded_by = null
    where id = existing_check_in.id
    returning * into existing_check_in;
  end if;

  update public.guest_check_in_sessions set confirmed_at = now() where id = guest_session.id;

  return jsonb_build_object(
    'checked_in', true,
    'already_checked_in', existing_check_in.method <> 'guest_qr' or guest_session.confirmed_at is not null,
    'checked_in_at', existing_check_in.checked_in_at
  );
end;
$$;

revoke all on function public.find_guest_check_in(text, date, text, text) from public;
revoke all on function public.confirm_guest_check_in(uuid) from public;
grant execute on function public.find_guest_check_in(text, date, text, text) to anon, authenticated;
grant execute on function public.confirm_guest_check_in(uuid) to anon, authenticated;
