-- Law18Ref v0.40.3 — expose only the signed-in referee's own shared evaluation
-- for each Law18Ref assignment in the account-wide My Assignments view.

create or replace function public.my_assignment_shared_ratings()
returns table (
  assignment_id uuid,
  rating jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select assignment.id, to_jsonb(assessment) - 'coach_notes'
  from public.assessments assessment
  join public.games game on game.id = assessment.game_id
  join public.events event on event.id = game.event_id
  join public.officials official on official.id = assessment.official_id
  join public.assignments assignment
    on assignment.game_id = assessment.game_id
   and assignment.official_id = assessment.official_id
  where official.linked_user_id = (select auth.uid())
    and assessment.organization_id = event.organization_id
    and assessment.include_in_averages
    and assessment.visibility = 'public'
    and assessment.status = 'shared'
    and not event.ratings_admin_only
    and (assessment.deleted_at is null or assessment.retained_for_referee)
  order by assessment.submitted_at desc nulls last, assessment.created_at desc;
$$;

revoke all on function public.my_assignment_shared_ratings() from public, anon;
grant execute on function public.my_assignment_shared_ratings() to authenticated;

comment on function public.my_assignment_shared_ratings() is
  'Returns only the caller''s own shared public evaluation, keyed to their assignment. Administrative roles do not broaden this personal result.';
