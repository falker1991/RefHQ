-- Law18Ref v0.8.6: include submitter display names in authorized rating history.

create or replace function public.authorized_rating_history()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with visible_assessments as (
    select a.*
    from public.assessments a
    where public.can_review_assessment(a.id)
  ),
  visible_games as (
    select distinct g.*
    from public.games g
    join visible_assessments a on a.game_id = g.id
  ),
  visible_assignments as (
    select distinct a.*
    from public.assignments a
    join visible_games g on g.id = a.game_id
  ),
  visible_officials as (
    select distinct o.*
    from public.officials o
    where o.id in (select official_id from visible_assessments)
       or o.id in (select official_id from visible_assignments)
  ),
  visible_events as (
    select distinct e.*
    from public.events e
    join visible_games g on g.event_id = e.id
  ),
  visible_submitters as (
    select distinct p.id, p.full_name
    from public.profiles p
    join visible_assessments a on a.coach_id = p.id
  )
  select jsonb_build_object(
    'assessments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from visible_assessments a), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g)) from visible_games g), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from visible_assignments a), '[]'::jsonb),
    'officials', coalesce((select jsonb_agg(to_jsonb(o)) from visible_officials o), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from visible_events e), '[]'::jsonb),
    'submitters', coalesce((select jsonb_agg(to_jsonb(s)) from visible_submitters s), '[]'::jsonb)
  );
$$;

grant execute on function public.authorized_rating_history() to authenticated;
