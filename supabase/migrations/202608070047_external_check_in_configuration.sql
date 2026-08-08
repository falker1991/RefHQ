-- Law18Ref v0.19.0: configurable External Check-In identity, messaging, and links.

alter table public.events
  add column if not exists external_check_in_fields text[] not null default array['last_name','email']::text[],
  add column if not exists external_check_in_other_label text not null default 'Other identifier',
  add column if not exists check_in_confirmation_message text not null default 'You’re checked in. Have a great day!',
  add column if not exists external_check_in_first_failure_message text not null default 'No matching referee was found in today’s schedule. Try again and confirm the information matches your Assignr account.',
  add column if not exists external_check_in_second_failure_message text not null default 'Please check in in person with the Site Supervisor.',
  add column if not exists check_in_links jsonb not null default '[]'::jsonb;

alter table public.officials
  add column if not exists ussf_id text,
  add column if not exists external_check_in_other text;

create or replace function public.valid_external_check_in_fields(fields text[])
returns boolean language sql immutable set search_path = public
as $$ select cardinality(fields) > 0 and fields <@ array['last_name','first_name','email','phone','ussf_id','date_of_birth','other']::text[] $$;

create or replace function public.valid_check_in_links(links jsonb)
returns boolean language sql immutable set search_path = public
as $$
  select jsonb_typeof(links) = 'array' and not exists (
    select 1 from jsonb_array_elements(links) link
    where btrim(coalesce(link->>'title','')) = ''
       or coalesce(link->>'url','') !~* '^https?://'
  )
$$;

alter table public.events drop constraint if exists events_external_check_in_fields_valid;
alter table public.events add constraint events_external_check_in_fields_valid check (public.valid_external_check_in_fields(external_check_in_fields));
alter table public.events drop constraint if exists events_check_in_links_valid;
alter table public.events add constraint events_check_in_links_valid check (public.valid_check_in_links(check_in_links));

create index if not exists officials_ussf_id_idx on public.officials(organization_id, lower(ussf_id)) where ussf_id is not null;

create or replace function public.get_external_check_in_config(event_slug text, event_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare selected_event public.events;
begin
  select * into selected_event from public.events event
  where event.check_in_slug = event_slug and event.archived_at is null
    and event.check_in_enabled and event.guest_check_in_enabled
    and coalesce((event.feature_settings ->> 'check_in')::boolean, true)
    and event_day between event.starts_on and event.ends_on;
  if selected_event.id is null then raise exception 'External check-in is not available for this event date.'; end if;
  return jsonb_build_object(
    'event_name', selected_event.name,
    'required_fields', selected_event.external_check_in_fields,
    'other_label', selected_event.external_check_in_other_label,
    'first_failure_message', selected_event.external_check_in_first_failure_message,
    'second_failure_message', selected_event.external_check_in_second_failure_message
  );
end;
$$;

create or replace function public.find_external_check_in(
  event_slug text,
  event_day date,
  entered_identity jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_event public.events;
  selected_official public.officials;
  required_field text;
  lookup_token uuid;
  daily_schedule jsonb;
  already_checked_in boolean;
begin
  delete from public.guest_check_in_sessions where expires_at < now() - interval '1 day';
  select * into selected_event from public.events event
  where event.check_in_slug = event_slug and event.archived_at is null
    and event.check_in_enabled and event.guest_check_in_enabled
    and coalesce((event.feature_settings ->> 'check_in')::boolean, true)
    and event_day between event.starts_on and event.ends_on;
  if selected_event.id is null then raise exception 'External check-in is not available for this event date.'; end if;
  if cardinality(selected_event.external_check_in_fields) = 0 then raise exception 'External check-in identity fields are not configured.'; end if;
  foreach required_field in array selected_event.external_check_in_fields loop
    if btrim(coalesce(entered_identity->>required_field, '')) = '' then raise exception 'Complete every required check-in field.'; end if;
  end loop;

  select official.* into selected_official
  from public.officials official
  where official.organization_id = selected_event.organization_id
    and (not ('last_name' = any(selected_event.external_check_in_fields)) or lower(regexp_replace(btrim(official.full_name), '^.*\s+', '')) = lower(btrim(entered_identity->>'last_name')))
    and (not ('first_name' = any(selected_event.external_check_in_fields)) or lower(split_part(btrim(official.full_name), ' ', 1)) = lower(btrim(entered_identity->>'first_name')))
    and (not ('email' = any(selected_event.external_check_in_fields)) or lower(btrim(official.email)) = lower(btrim(entered_identity->>'email')))
    and (not ('phone' = any(selected_event.external_check_in_fields)) or regexp_replace(coalesce(official.phone,''), '\D', '', 'g') = regexp_replace(coalesce(entered_identity->>'phone',''), '\D', '', 'g'))
    and (not ('ussf_id' = any(selected_event.external_check_in_fields)) or lower(btrim(official.ussf_id)) = lower(btrim(entered_identity->>'ussf_id')))
    and (not ('date_of_birth' = any(selected_event.external_check_in_fields)) or official.date_of_birth = (entered_identity->>'date_of_birth')::date)
    and (not ('other' = any(selected_event.external_check_in_fields)) or lower(btrim(official.external_check_in_other)) = lower(btrim(entered_identity->>'other')))
    and official.merged_into_official_id is null and official.archived_at is null
    and exists (select 1 from public.assignments assignment join public.games game on game.id = assignment.game_id
      where assignment.official_id = official.id and game.event_id = selected_event.id
        and (game.starts_at at time zone selected_event.timezone)::date = event_day)
  order by official.created_at limit 1;
  if selected_official.id is null then raise exception 'No matching referee was found in today’s schedule.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'game_id', game.id, 'starts_at', game.starts_at, 'field_name', game.field_name,
    'venue_name', game.venue_name, 'home_team', game.home_team, 'away_team', game.away_team,
    'age_group', game.age_group, 'gender', game.gender, 'position', assignment.position,
    'position_title', assignment.position_title
  ) order by game.starts_at, assignment.position_title), '[]'::jsonb)
  into daily_schedule from public.assignments assignment join public.games game on game.id = assignment.game_id
  where assignment.official_id = selected_official.id and game.event_id = selected_event.id
    and (game.starts_at at time zone selected_event.timezone)::date = event_day;

  select exists (select 1 from public.check_ins checkin where checkin.event_id = selected_event.id
    and checkin.event_date = event_day and checkin.official_id = selected_official.id and checkin.status = 'checked_in')
  into already_checked_in;
  insert into public.guest_check_in_sessions(event_id, event_date, official_id)
  values (selected_event.id, event_day, selected_official.id) returning id into lookup_token;

  return jsonb_build_object(
    'token', lookup_token, 'event_name', selected_event.name, 'event_date', event_day,
    'official_name', selected_official.full_name, 'already_checked_in', already_checked_in,
    'confirmation_message', selected_event.check_in_confirmation_message,
    'check_in_links', selected_event.check_in_links, 'assignments', daily_schedule
  );
end;
$$;

revoke all on function public.get_external_check_in_config(text, date) from public;
revoke all on function public.find_external_check_in(text, date, jsonb) from public;
grant execute on function public.get_external_check_in_config(text, date) to anon, authenticated;
grant execute on function public.find_external_check_in(text, date, jsonb) to anon, authenticated;
