create or replace function public.swap_game_assignments(
  first_assignment_uuid uuid,
  second_assignment_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  first_assignment public.assignments;
  second_assignment public.assignments;
  first_game public.games;
  second_game public.games;
  selected_event public.events;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;
  if first_assignment_uuid is null or second_assignment_uuid is null or first_assignment_uuid = second_assignment_uuid then
    raise exception 'Choose two different assignments.';
  end if;

  perform 1 from public.assignments
  where id in (first_assignment_uuid, second_assignment_uuid)
  order by id
  for update;

  select * into first_assignment
  from public.assignments
  where id = first_assignment_uuid;

  select * into second_assignment
  from public.assignments
  where id = second_assignment_uuid;

  if first_assignment.id is null or second_assignment.id is null then
    raise exception 'One of the selected assignments no longer exists.';
  end if;
  if first_assignment.game_id = second_assignment.game_id then
    raise exception 'Choose assignments from two different games.';
  end if;
  if first_assignment.official_id is null or second_assignment.official_id is null then
    raise exception 'Only staffed assignments can be swapped.';
  end if;
  if first_assignment.official_id = second_assignment.official_id then
    raise exception 'Choose assignments held by two different officials.';
  end if;

  perform 1 from public.games
  where id in (first_assignment.game_id, second_assignment.game_id)
  order by id
  for update;
  select * into first_game from public.games where id = first_assignment.game_id;
  select * into second_game from public.games where id = second_assignment.game_id;

  if first_game.event_id <> second_game.event_id then
    raise exception 'Assignments can only be swapped within the same event.';
  end if;
  if not public.can_manage_game(first_game.id, first_game.event_id)
     or not public.can_manage_game(second_game.id, second_game.event_id) then
    raise exception 'You do not have permission to edit both selected games.';
  end if;

  if exists (
    select 1 from public.assignments assignment
    where assignment.game_id = second_game.id
      and assignment.official_id = first_assignment.official_id
      and assignment.id <> second_assignment.id
  ) or exists (
    select 1 from public.assignments assignment
    where assignment.game_id = first_game.id
      and assignment.official_id = second_assignment.official_id
      and assignment.id <> first_assignment.id
  ) then
    raise exception 'A selected official is already assigned to the other game.';
  end if;

  update public.assignments
  set official_id = second_assignment.official_id,
      referee_id = null
  where id = first_assignment.id;

  update public.assignments
  set official_id = first_assignment.official_id,
      referee_id = null
  where id = second_assignment.id;

  update public.games
  set schedule_changed_at = now(),
      schedule_changed_by = (select auth.uid()),
      schedule_change_summary = 'Assignments swapped between games'
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
    'assignment.swapped',
    'event',
    selected_event.id::text,
    jsonb_build_object(
      'first_assignment_id', first_assignment.id,
      'first_game_id', first_game.id,
      'first_position', first_assignment.position,
      'first_official_before', first_assignment.official_id,
      'first_official_after', second_assignment.official_id,
      'second_assignment_id', second_assignment.id,
      'second_game_id', second_game.id,
      'second_position', second_assignment.position,
      'second_official_before', second_assignment.official_id,
      'second_official_after', first_assignment.official_id,
      'ratings_changed', false,
      'notifications_sent', false
    )
  );

  return jsonb_build_object(
    'event_id', selected_event.id,
    'first_game_id', first_game.id,
    'second_game_id', second_game.id
  );
end;
$$;

revoke all on function public.swap_game_assignments(uuid, uuid) from public, anon;
grant execute on function public.swap_game_assignments(uuid, uuid) to authenticated;
