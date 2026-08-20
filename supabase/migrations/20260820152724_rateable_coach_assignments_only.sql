-- Coaching-system access is limited to games that can receive ratings.
-- Imported Referee Coach, Site Coordinator, and similar crew positions live
-- in public.assignments and are intentionally unaffected by this migration.

create or replace function public.validate_rateable_coach_assignment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.game_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.games g
    where g.id = new.game_id
      and g.event_id = new.event_id
      and not coalesce(g.operational, false)
      and lower(coalesce(g.field_name, '') || ' ' || coalesce(g.venue_name, '')) not like '%hq%'
  ) then
    raise exception 'Referee coaches can only be assigned through Coaching to ratings-enabled games.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_rateable_coach_assignment on public.coach_assignments;
create trigger validate_rateable_coach_assignment
before insert or update of event_id, game_id on public.coach_assignments
for each row execute function public.validate_rateable_coach_assignment();

-- Remove only coaching-system links to non-rateable games. Imported schedule
-- positions are stored separately and remain exactly as imported.
delete from public.coach_assignments ca
using public.games g
where ca.game_id = g.id
  and (
    coalesce(g.operational, false)
    or lower(coalesce(g.field_name, '') || ' ' || coalesce(g.venue_name, '')) like '%hq%'
  );
