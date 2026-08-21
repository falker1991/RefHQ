alter table public.assessments
  add column if not exists rated_position public.assignment_position,
  add column if not exists rated_position_title text;

update public.assessments assessment
set rated_position = assignment.position,
    rated_position_title = assignment.position_title
from public.assignments assignment
where assignment.game_id = assessment.game_id
  and assignment.official_id = assessment.official_id
  and assessment.official_id is not null
  and assessment.rated_position is null;

alter table public.assessments drop constraint if exists assessments_game_id_fkey;
alter table public.assessments add constraint assessments_game_id_fkey
  foreign key (game_id) references public.games(id) on delete restrict;

alter table public.assessments drop constraint if exists assessments_organization_id_fkey;
alter table public.assessments add constraint assessments_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete restrict;

alter table public.assessments drop constraint if exists assessments_official_id_fkey;
alter table public.assessments add constraint assessments_official_id_fkey
  foreign key (official_id) references public.officials(id) on delete restrict;

alter table public.assessments drop constraint if exists assessments_coach_id_fkey;
alter table public.assessments add constraint assessments_coach_id_fkey
  foreign key (coach_id) references public.profiles(id) on delete restrict;

alter table public.assessments drop constraint if exists assessments_referee_id_fkey;
alter table public.assessments add constraint assessments_referee_id_fkey
  foreign key (referee_id) references public.profiles(id) on delete restrict;

create or replace function public.prevent_automatic_assessment_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_setting('law18ref.manual_rating_delete', true), '') <> 'on' then
    raise exception 'Ratings can only be deleted manually from the Ratings area.';
  end if;
  return old;
end;
$$;

drop trigger if exists require_manual_assessment_delete on public.assessments;
create trigger require_manual_assessment_delete
before delete on public.assessments
for each row execute function public.prevent_automatic_assessment_delete();

create or replace function public.delete_rating(target_assessment uuid, keep_for_referee boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  select a.*, g.event_id, e.organization_id
  into target
  from public.assessments a
  join public.games g on g.id = a.game_id
  join public.events e on e.id = g.event_id
  where a.id = target_assessment and a.deleted_at is null;

  if target.id is null then raise exception 'Rating not found.'; end if;
  if not public.can_manage_assessment(target_assessment) then
    raise exception 'You do not have permission to delete this rating.';
  end if;

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id, details
  ) values (
    target.organization_id, target.event_id, (select auth.uid()),
    case when keep_for_referee then 'rating.deleted_retained' else 'rating.deleted' end,
    'assessments', target_assessment::text,
    jsonb_build_object('game_id', target.game_id, 'official_id', target.official_id, 'coach_id', target.coach_id)
  );

  if keep_for_referee and target.visibility = 'public' and target.status = 'shared' then
    update public.assessments
    set deleted_at = now(), retained_for_referee = true, updated_at = now()
    where id = target_assessment;
  else
    perform set_config('law18ref.manual_rating_delete', 'on', true);
    delete from public.assessments where id = target_assessment;
  end if;
end;
$$;

create or replace function public.sync_assessment_rated_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assessments
  set rated_position = new.position,
      rated_position_title = new.position_title,
      updated_at = now()
  where game_id = new.game_id
    and official_id = new.official_id;
  return new;
end;
$$;

drop trigger if exists sync_assessment_rated_position_from_assignment on public.assignments;
create trigger sync_assessment_rated_position_from_assignment
after insert or update of official_id, position, position_title on public.assignments
for each row execute function public.sync_assessment_rated_position();

create or replace function public.capture_assessment_rated_position()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_assignment public.assignments;
begin
  if new.official_id is not null and new.rated_position is null then
    select * into current_assignment
    from public.assignments
    where game_id = new.game_id and official_id = new.official_id
    order by crew_order, id
    limit 1;
    if current_assignment.id is not null then
      new.rated_position := current_assignment.position;
      new.rated_position_title := current_assignment.position_title;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_assessment_rated_position_on_save on public.assessments;
create trigger capture_assessment_rated_position_on_save
before insert or update of official_id, game_id on public.assessments
for each row execute function public.capture_assessment_rated_position();

create or replace function public.swap_same_game_ratings(first_assessment uuid, second_assessment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  first_rating public.assessments;
  second_rating public.assessments;
  first_official uuid;
  second_official uuid;
  target_event uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required.'; end if;
  if first_assessment = second_assessment then raise exception 'Choose two different ratings.'; end if;

  select * into first_rating from public.assessments where id = first_assessment for update;
  select * into second_rating from public.assessments where id = second_assessment for update;
  if first_rating.id is null or second_rating.id is null then raise exception 'One of these ratings no longer exists.'; end if;
  if first_rating.game_id <> second_rating.game_id then raise exception 'Ratings can only be swapped within the same game.'; end if;
  if first_rating.coach_id <> second_rating.coach_id then raise exception 'Choose ratings submitted by the same coach.'; end if;
  if first_rating.official_id is null or second_rating.official_id is null or first_rating.official_id = second_rating.official_id then
    raise exception 'Choose ratings for two different officials.';
  end if;
  if not public.can_manage_assessment(first_rating.id) or not public.can_manage_assessment(second_rating.id) then
    raise exception 'You do not have permission to swap these ratings.';
  end if;

  first_official := first_rating.official_id;
  second_official := second_rating.official_id;
  select event_id into target_event from public.games where id = first_rating.game_id;

  update public.assessments set official_id = null where id = first_rating.id;
  update public.assessments set official_id = first_official where id = second_rating.id;
  update public.assessments set official_id = second_official where id = first_rating.id;

  update public.assessments assessment
  set rated_position = assignment.position,
      rated_position_title = assignment.position_title,
      referee_seen_at = null,
      shared_at = case when assessment.visibility = 'public' and assessment.status = 'shared' then now() else assessment.shared_at end,
      updated_at = now()
  from public.assignments assignment
  where assessment.id in (first_rating.id, second_rating.id)
    and assignment.game_id = assessment.game_id
    and assignment.official_id = assessment.official_id;

  insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id, details)
  values (first_rating.organization_id, target_event, (select auth.uid()), 'rating.swapped', 'game', first_rating.game_id::text,
    jsonb_build_object('first_rating_id', first_rating.id, 'second_rating_id', second_rating.id,
      'first_official_id', first_official, 'second_official_id', second_official));
end;
$$;

revoke all on function public.sync_assessment_rated_position() from public, anon, authenticated;
revoke all on function public.capture_assessment_rated_position() from public, anon, authenticated;
revoke all on function public.prevent_automatic_assessment_delete() from public, anon, authenticated;
revoke all on function public.delete_rating(uuid, boolean) from public, anon;
grant execute on function public.delete_rating(uuid, boolean) to authenticated;
revoke all on function public.swap_same_game_ratings(uuid, uuid) from public, anon;
grant execute on function public.swap_same_game_ratings(uuid, uuid) to authenticated;
