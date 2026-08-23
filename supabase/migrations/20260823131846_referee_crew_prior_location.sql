create or replace function public.find_external_check_in(event_slug text, event_day date, entered_identity jsonb)
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
  checked_in boolean := false;
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
    'position_title', assignment.position_title,
    'crew_arrivals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'official_id', crew_assignment.official_id,
        'official_name', crew_official.full_name,
        'position', crew_assignment.position,
        'position_title', crew_assignment.position_title,
        'prior_starts_at', prior_game.starts_at,
        'prior_field_name', prior_game.field_name,
        'prior_position', prior_assignment.position,
        'prior_position_title', prior_assignment.position_title,
        'first_game', prior_game.id is null
      ) order by crew_assignment.crew_order, crew_assignment.id), '[]'::jsonb)
      from public.assignments crew_assignment
      join public.officials crew_official on crew_official.id = crew_assignment.official_id
      left join lateral (
        select earlier_assignment.position, earlier_assignment.position_title, earlier_game.id,
          earlier_game.starts_at, earlier_game.field_name
        from public.assignments earlier_assignment
        join public.games earlier_game on earlier_game.id = earlier_assignment.game_id
        where earlier_assignment.official_id = crew_assignment.official_id
          and earlier_game.event_id = selected_event.id
          and (earlier_game.starts_at at time zone selected_event.timezone)::date = event_day
          and earlier_game.starts_at < game.starts_at
        order by earlier_game.starts_at desc, earlier_assignment.crew_order desc, earlier_assignment.id desc
        limit 1
      ) prior_game on true
      left join lateral (
        select prior_game.position, prior_game.position_title
      ) prior_assignment on true
      where crew_assignment.game_id = game.id
        and crew_assignment.official_id is not null
        and crew_assignment.official_id <> selected_official.id
    )
  ) order by game.starts_at, assignment.crew_order, assignment.id), '[]'::jsonb)
  into daily_schedule from public.assignments assignment join public.games game on game.id = assignment.game_id
  where assignment.official_id = selected_official.id and game.event_id = selected_event.id
    and (game.starts_at at time zone selected_event.timezone)::date = event_day;

  select exists (select 1 from public.check_ins checkin where checkin.event_id = selected_event.id
    and checkin.event_date = event_day and checkin.official_id = selected_official.id and checkin.status = 'checked_in')
  into already_checked_in;
  insert into public.guest_check_in_sessions(event_id, event_date, official_id)
  values (selected_event.id, event_day, selected_official.id) returning id into lookup_token;

  if not selected_event.external_check_in_confirmation_required then
    perform public.confirm_guest_check_in(lookup_token);
    checked_in := true;
  end if;

  return jsonb_build_object(
    'token', lookup_token, 'event_name', selected_event.name, 'event_date', event_day,
    'official_name', selected_official.full_name, 'already_checked_in', already_checked_in,
    'checked_in', checked_in or already_checked_in,
    'confirmation_required', selected_event.external_check_in_confirmation_required,
    'confirmation_message', selected_event.check_in_confirmation_message,
    'check_in_links', selected_event.check_in_links, 'assignments', daily_schedule
  );
end;
$$;

revoke all on function public.find_external_check_in(text, date, jsonb) from public;
grant execute on function public.find_external_check_in(text, date, jsonb) to anon, authenticated;
