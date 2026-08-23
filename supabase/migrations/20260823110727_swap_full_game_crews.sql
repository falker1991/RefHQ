create or replace function public.swap_game_crews(
  first_game_uuid uuid,
  second_game_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  first_game public.games;
  second_game public.games;
  selected_event public.events;
  first_assignment_ids uuid[];
  second_assignment_ids uuid[];
  first_official_ids uuid[];
  second_official_ids uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;
  if first_game_uuid is null or second_game_uuid is null or first_game_uuid = second_game_uuid then
    raise exception 'Choose two different games.';
  end if;

  perform 1 from public.games
  where id in (first_game_uuid, second_game_uuid)
  order by id
  for update;

  select * into first_game from public.games where id = first_game_uuid;
  select * into second_game from public.games where id = second_game_uuid;

  if first_game.id is null or second_game.id is null then
    raise exception 'One of the selected games no longer exists.';
  end if;
  if first_game.event_id <> second_game.event_id then
    raise exception 'Crews can only be swapped within the same event.';
  end if;
  if not public.can_manage_game(first_game.id, first_game.event_id)
     or not public.can_manage_game(second_game.id, second_game.event_id) then
    raise exception 'You do not have permission to edit both selected games.';
  end if;

  perform 1 from public.assignments
  where game_id in (first_game.id, second_game.id)
  order by game_id, crew_order, id
  for update;

  select
    array_agg(assignment.id order by assignment.crew_order, assignment.id),
    array_agg(assignment.official_id order by assignment.crew_order, assignment.id)
  into first_assignment_ids, first_official_ids
  from public.assignments assignment
  where assignment.game_id = first_game.id
    and assignment.official_id is not null;

  select
    array_agg(assignment.id order by assignment.crew_order, assignment.id),
    array_agg(assignment.official_id order by assignment.crew_order, assignment.id)
  into second_assignment_ids, second_official_ids
  from public.assignments assignment
  where assignment.game_id = second_game.id
    and assignment.official_id is not null;

  if coalesce(cardinality(first_assignment_ids), 0) = 0
     or coalesce(cardinality(second_assignment_ids), 0) = 0 then
    raise exception 'Both games must have a staffed crew.';
  end if;
  if cardinality(first_assignment_ids) <> cardinality(second_assignment_ids) then
    raise exception 'Full crews can only be swapped when both games have the same number of staffed assignments.';
  end if;

  update public.assignments
  set official_id = null,
      referee_id = null
  where id = any(first_assignment_ids)
     or id = any(second_assignment_ids);

  with replacements as (
    select * from unnest(first_assignment_ids, second_official_ids)
      as replacement(assignment_id, official_id)
  )
  update public.assignments assignment
  set official_id = replacement.official_id,
      referee_id = null
  from replacements replacement
  where assignment.id = replacement.assignment_id;

  with replacements as (
    select * from unnest(second_assignment_ids, first_official_ids)
      as replacement(assignment_id, official_id)
  )
  update public.assignments assignment
  set official_id = replacement.official_id,
      referee_id = null
  from replacements replacement
  where assignment.id = replacement.assignment_id;

  update public.games
  set schedule_changed_at = now(),
      schedule_changed_by = (select auth.uid()),
      schedule_change_summary = 'Full crews swapped between games'
  where id in (first_game.id, second_game.id);

  select event.* into selected_event
  from public.events event
  where event.id = first_game.event_id;

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id, details
  ) values (
    selected_event.organization_id,
    selected_event.id,
    (select auth.uid()),
    'assignment.crews_swapped',
    'event',
    selected_event.id::text,
    jsonb_build_object(
      'first_game_id', first_game.id,
      'first_crew_before', to_jsonb(first_official_ids),
      'first_crew_after', to_jsonb(second_official_ids),
      'second_game_id', second_game.id,
      'second_crew_before', to_jsonb(second_official_ids),
      'second_crew_after', to_jsonb(first_official_ids),
      'ratings_changed', false,
      'notifications_sent', false
    )
  );

  return jsonb_build_object(
    'event_id', selected_event.id,
    'first_game_id', first_game.id,
    'second_game_id', second_game.id,
    'crew_size', cardinality(first_assignment_ids)
  );
end;
$$;

revoke all on function public.swap_game_crews(uuid, uuid) from public, anon;
grant execute on function public.swap_game_crews(uuid, uuid) to authenticated;
