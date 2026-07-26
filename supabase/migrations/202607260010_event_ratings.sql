-- Law18Ref v0.3.0 — event-configurable ratings

alter table public.events
  add column if not exists rating_type text not null default 'skills_eval'
    check (rating_type in ('skills_eval', 'basic_eval')),
  add column if not exists ratings_admin_only boolean not null default false;

alter table public.assessments
  add column if not exists evaluation_type text not null default 'skills_eval'
    check (evaluation_type in ('skills_eval', 'basic_eval')),
  add column if not exists overall_rating smallint
    check (overall_rating between 1 and 5);

create or replace function public.enforce_event_rating_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_type text;
  admin_only boolean;
begin
  select e.rating_type, e.ratings_admin_only
  into configured_type, admin_only
  from public.games g
  join public.events e on e.id = g.event_id
  where g.id = new.game_id;

  if configured_type is null then
    raise exception 'The selected game is not available for ratings.';
  end if;
  new.evaluation_type := configured_type;
  if admin_only then new.visibility := 'private'; end if;
  return new;
end;
$$;

drop trigger if exists enforce_event_rating_settings on public.assessments;
create trigger enforce_event_rating_settings
before insert or update on public.assessments
for each row execute function public.enforce_event_rating_settings();

drop policy if exists "scoped assessment visibility" on public.assessments;
create policy "scoped rating visibility" on public.assessments for select
  using (
    coach_id = auth.uid()
    or public.has_event_role(
      (select event_id from public.games where public.games.id = assessments.game_id),
      array['event_admin','assignor','referee_coach']::public.membership_role[]
    )
    or (
      visibility = 'public'
      and not coalesce((
        select e.ratings_admin_only
        from public.games g join public.events e on e.id = g.event_id
        where g.id = assessments.game_id
      ), true)
      and official_id in (select id from public.officials where linked_user_id = auth.uid())
    )
  );
