-- Law18Ref v0.40.1: reduce event loading to one database round trip and
-- save a complete crew rating atomically in one request.

create or replace function public.load_event_workspace(target_event uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with visible_games as materialized (
    select game.*
    from public.games game
    where game.event_id = target_event
  ), visible_assignments as materialized (
    select assignment.*
    from public.assignments assignment
    join visible_games game on game.id = assignment.game_id
  ), visible_coach_assignments as materialized (
    select coach_assignment.*
    from public.coach_assignments coach_assignment
    where coach_assignment.event_id = target_event
  ), relevant_user_ids as (
    select membership.user_id
    from public.event_memberships membership
    where membership.event_id = target_event
    union
    select coach_assignment.coach_id
    from visible_coach_assignments coach_assignment
    where coach_assignment.coach_id is not null
  ), relevant_official_ids as (
    select assignment.official_id from visible_assignments assignment
    union
    select coach_assignment.coach_official_id
    from visible_coach_assignments coach_assignment
    where coach_assignment.coach_official_id is not null
  ), visible_officials as (
    select official.*
    from public.officials official
    join public.events event on event.id = target_event
    where official.organization_id = event.organization_id
      and (
        official.id in (select official_id from relevant_official_ids)
        or official.linked_user_id in (select user_id from relevant_user_ids)
      )
  )
  select jsonb_build_object(
    'games', coalesce((select jsonb_agg(to_jsonb(game) order by game.starts_at, game.field_name, game.id) from visible_games game), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(assignment) order by assignment.game_id, assignment.crew_order, assignment.id) from visible_assignments assignment), '[]'::jsonb),
    'officials', coalesce((select jsonb_agg(to_jsonb(official) order by official.last_name nulls last, official.full_name, official.id) from visible_officials official), '[]'::jsonb),
    'checkIns', coalesce((select jsonb_agg(to_jsonb(check_in) order by check_in.checked_in_at desc) from public.check_ins check_in where check_in.event_id = target_event), '[]'::jsonb),
    'attendanceOverrides', coalesce((select jsonb_agg(to_jsonb(attendance_override)) from public.attendance_expectation_overrides attendance_override where attendance_override.event_id = target_event), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(to_jsonb(assessment) order by assessment.created_at desc) from public.assessments assessment join visible_games game on game.id = assessment.game_id), '[]'::jsonb),
    'coachAssignments', coalesce((select jsonb_agg(to_jsonb(coach_assignment)) from visible_coach_assignments coach_assignment), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(document) order by document.created_at desc) from public.event_documents document where document.event_id = target_event), '[]'::jsonb),
    'provisionalAccess', coalesce((select jsonb_agg(to_jsonb(access)) from public.provisional_event_access access where access.event_id = target_event), '[]'::jsonb)
  )
$$;

create or replace function public.save_ratings_batch(items jsonb)
returns setof public.assessments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to save ratings.'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'At least one rating is required.';
  end if;
  if jsonb_array_length(items) > 20 then
    raise exception 'A crew rating cannot contain more than 20 officials.';
  end if;

  for item in select value from jsonb_array_elements(items)
  loop
    return query
      select * from public.save_rating(
        item->'payload',
        nullif(item->>'target_assessment', '')::uuid
      );
  end loop;
end
$$;

revoke all on function public.load_event_workspace(uuid) from public, anon;
revoke all on function public.save_ratings_batch(jsonb) from public, anon;
grant execute on function public.load_event_workspace(uuid) to authenticated;
grant execute on function public.save_ratings_batch(jsonb) to authenticated;
