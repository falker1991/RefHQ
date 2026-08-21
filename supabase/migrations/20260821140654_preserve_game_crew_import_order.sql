alter table public.assignments
  add column if not exists crew_order integer;

with ordered as (
  select id, row_number() over (partition by game_id order by ctid) - 1 as crew_order
  from public.assignments
)
update public.assignments assignment
set crew_order = ordered.crew_order
from ordered
where assignment.id = ordered.id
  and assignment.crew_order is null;

alter table public.assignments
  alter column crew_order set default 0,
  alter column crew_order set not null;

create index if not exists assignments_game_crew_order_idx
  on public.assignments (game_id, crew_order, id);

create or replace function public.replace_game_assignments(game_uuid uuid, requested_assignments jsonb)
returns setof public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.games;
  old_crew jsonb;
  new_crew jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required.'; end if;
  select * into target_game from public.games where id = game_uuid for update;
  if target_game.id is null or not public.can_manage_game(target_game.id, target_game.event_id) then
    raise exception 'You do not have permission to edit assignments for this game.';
  end if;
  if jsonb_typeof(coalesce(requested_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Assignments must be provided as a list.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(requested_assignments, '[]'::jsonb)) item
    left join public.officials official on official.id = (item ->> 'official_id')::uuid
    join public.events event on event.id = target_game.event_id
    where official.id is null or official.organization_id <> event.organization_id or official.archived_at is not null
  ) then
    raise exception 'Every assigned official must be an active member of this group.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('official_id', assignment.official_id, 'position', assignment.position, 'position_title', assignment.position_title, 'crew_order', assignment.crew_order) order by assignment.crew_order, assignment.id), '[]'::jsonb)
  into old_crew from public.assignments assignment where assignment.game_id = game_uuid;

  delete from public.assignments where game_id = game_uuid;
  insert into public.assignments (game_id, referee_id, official_id, position, position_title, source_position_title, crew_order, accepted)
  select game_uuid, null, (item.value ->> 'official_id')::uuid,
    coalesce(nullif(item.value ->> 'position', ''), 'other')::public.assignment_position,
    nullif(item.value ->> 'position_title', ''), nullif(item.value ->> 'source_position_title', ''),
    item.ordinality - 1, true
  from jsonb_array_elements(coalesce(requested_assignments, '[]'::jsonb)) with ordinality as item(value, ordinality);

  select coalesce(jsonb_agg(jsonb_build_object('official_id', assignment.official_id, 'position', assignment.position, 'position_title', assignment.position_title, 'crew_order', assignment.crew_order) order by assignment.crew_order, assignment.id), '[]'::jsonb)
  into new_crew from public.assignments assignment where assignment.game_id = game_uuid;

  update public.games set schedule_changed_at = now(), schedule_changed_by = (select auth.uid()),
    schedule_change_summary = 'Crew assignment updated' where id = game_uuid;
  insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id, details)
  select event.organization_id, target_game.event_id, (select auth.uid()), 'assignment.updated', 'game', game_uuid::text,
    jsonb_build_object('previous_crew', old_crew, 'updated_crew', new_crew, 'notifications_sent', false)
  from public.events event where event.id = target_game.event_id;
  return query select * from public.assignments where game_id = game_uuid order by crew_order, id;
end;
$$;

revoke all on function public.replace_game_assignments(uuid, jsonb) from public, anon;
grant execute on function public.replace_game_assignments(uuid, jsonb) to authenticated;
