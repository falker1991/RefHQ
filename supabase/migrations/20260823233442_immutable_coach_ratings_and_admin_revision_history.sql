-- Law18Ref v0.40.0: submitted coach ratings are immutable; authorized
-- administrators revise the existing record with a durable before-image.

alter table public.assessments
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null;

create table if not exists public.assessment_revisions (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  edited_by uuid references auth.users(id) on delete set null,
  previous_record jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists assessment_revisions_assessment_created_idx
  on public.assessment_revisions (assessment_id, created_at desc);

alter table public.assessment_revisions enable row level security;
revoke all on table public.assessment_revisions from public, anon, authenticated;
revoke all on sequence public.assessment_revisions_id_seq from public, anon, authenticated;

create or replace function public.is_rating_admin(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      public.is_site_owner()
      or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
      or public.has_event_role(event.id, array['event_admin']::public.membership_role[])
    from public.games game
    join public.events event on event.id = game.event_id
    where game.id = target_game
  ), false)
$$;

create or replace function public.protect_submitted_rating_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and coalesce(current_setting('law18ref.rating_admin_edit', true), '') <> 'on'
     and row(
       new.visibility, new.status, new.evaluation_type, new.overall_rating,
       new.positioning, new.decision_making, new.communication, new.match_control,
       new.strengths, new.development_focus, new.additional_comments, new.coach_notes
     ) is distinct from row(
       old.visibility, old.status, old.evaluation_type, old.overall_rating,
       old.positioning, old.decision_making, old.communication, old.match_control,
       old.strengths, old.development_focus, old.additional_comments, old.coach_notes
     ) then
    raise exception 'Submitted ratings cannot be edited. Ask an Event Admin or Group Admin to make a correction.';
  end if;
  return new;
end
$$;

drop trigger if exists protect_submitted_rating_edits on public.assessments;
create trigger protect_submitted_rating_edits
before update on public.assessments
for each row execute function public.protect_submitted_rating_edits();

create or replace function public.save_rating(payload jsonb, target_assessment uuid default null)
returns setof public.assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  existing public.assessments%rowtype;
  target_game uuid := (payload->>'game_id')::uuid;
  target_official uuid := (payload->>'official_id')::uuid;
  target_organization uuid;
  target_event uuid;
begin
  if actor is null then raise exception 'Sign in to save a rating.'; end if;

  select event.organization_id, event.id
    into target_organization, target_event
  from public.games game
  join public.events event on event.id = game.event_id
  where game.id = target_game;

  if target_organization is null or target_organization <> (payload->>'organization_id')::uuid then
    raise exception 'The selected game is not available for this group.';
  end if;

  if target_assessment is not null then
    select * into existing from public.assessments where id = target_assessment for update;
    if existing.id is null or existing.game_id <> target_game or existing.official_id <> target_official then
      raise exception 'The rating selected for editing no longer matches this crew.';
    end if;
    if not public.is_rating_admin(existing.game_id) then
      raise exception 'Only an Event Admin or higher can edit a submitted rating.';
    end if;

    insert into public.assessment_revisions (assessment_id, edited_by, previous_record)
    values (existing.id, actor, to_jsonb(existing));
    perform set_config('law18ref.rating_admin_edit', 'on', true);

    update public.assessments set
      visibility = (payload->>'visibility')::public.assessment_visibility,
      status = (payload->>'status')::public.assessment_status,
      evaluation_type = (payload->>'evaluation_type'),
      overall_rating = nullif(payload->>'overall_rating', '')::smallint,
      positioning = nullif(payload->>'positioning', '')::smallint,
      decision_making = nullif(payload->>'decision_making', '')::smallint,
      communication = nullif(payload->>'communication', '')::smallint,
      match_control = nullif(payload->>'match_control', '')::smallint,
      strengths = nullif(payload->>'strengths', ''),
      development_focus = nullif(payload->>'development_focus', ''),
      additional_comments = nullif(payload->>'additional_comments', ''),
      coach_notes = nullif(payload->>'coach_notes', ''),
      submitted_at = case when payload->>'status' = 'draft' then null else coalesce(existing.submitted_at, now()) end,
      edited_at = now(), edited_by = actor, updated_at = now()
    where id = existing.id;

    insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id, details)
    values (target_organization, target_event, actor, 'rating.edited', 'assessments', existing.id::text,
      jsonb_build_object('original_coach_id', existing.coach_id, 'official_id', existing.official_id));
    return query select * from public.assessments where id = existing.id;
    return;
  end if;

  select * into existing
  from public.assessments
  where game_id = target_game and official_id = target_official and coach_id = actor
  for update;

  if existing.id is not null and existing.status <> 'draft' then
    raise exception 'You already submitted a rating for this game. Ask an Event Admin or Group Admin to make a correction.';
  end if;

  if existing.id is not null then
    update public.assessments set
      visibility = (payload->>'visibility')::public.assessment_visibility, status = (payload->>'status')::public.assessment_status,
      evaluation_type = (payload->>'evaluation_type'),
      overall_rating = nullif(payload->>'overall_rating', '')::smallint,
      positioning = nullif(payload->>'positioning', '')::smallint,
      decision_making = nullif(payload->>'decision_making', '')::smallint,
      communication = nullif(payload->>'communication', '')::smallint,
      match_control = nullif(payload->>'match_control', '')::smallint,
      strengths = nullif(payload->>'strengths', ''),
      development_focus = nullif(payload->>'development_focus', ''),
      additional_comments = nullif(payload->>'additional_comments', ''),
      coach_notes = nullif(payload->>'coach_notes', ''),
      submitted_at = case when payload->>'status' = 'draft' then null else now() end,
      updated_at = now()
    where id = existing.id;
    return query select * from public.assessments where id = existing.id;
    return;
  end if;

  insert into public.assessments (
    organization_id, game_id, official_id, coach_id, visibility, status,
    evaluation_type, overall_rating, positioning, decision_making, communication,
    match_control, strengths, development_focus, additional_comments, coach_notes,
    submitted_at, updated_at
  ) values (
    target_organization, target_game, target_official, actor,
    (payload->>'visibility')::public.assessment_visibility, (payload->>'status')::public.assessment_status, payload->>'evaluation_type',
    nullif(payload->>'overall_rating', '')::smallint,
    nullif(payload->>'positioning', '')::smallint,
    nullif(payload->>'decision_making', '')::smallint,
    nullif(payload->>'communication', '')::smallint,
    nullif(payload->>'match_control', '')::smallint,
    nullif(payload->>'strengths', ''), nullif(payload->>'development_focus', ''),
    nullif(payload->>'additional_comments', ''), nullif(payload->>'coach_notes', ''),
    case when payload->>'status' = 'draft' then null else now() end, now()
  ) returning * into existing;
  return next existing;
end
$$;

revoke all on function public.is_rating_admin(uuid) from public, anon;
revoke all on function public.save_rating(jsonb, uuid) from public, anon;
revoke all on function public.protect_submitted_rating_edits() from public, anon, authenticated;
grant execute on function public.is_rating_admin(uuid) to authenticated;
grant execute on function public.save_rating(jsonb, uuid) to authenticated;

create or replace function public.authorized_rating_history(target_organization uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible_assessments as (
    select assessment.* from public.assessments assessment
    join public.games game on game.id = assessment.game_id
    join public.events event on event.id = game.event_id
    where event.organization_id = target_organization
      and assessment.organization_id = target_organization
      and public.can_review_assessment(assessment.id)
  ), visible_games as (
    select distinct game.* from public.games game
    join public.events event on event.id = game.event_id
    join visible_assessments assessment on assessment.game_id = game.id
    where event.organization_id = target_organization
  ), visible_assignments as (
    select distinct assignment.* from public.assignments assignment
    join visible_games game on game.id = assignment.game_id
  ), visible_officials as (
    select distinct official.* from public.officials official
    where official.organization_id = target_organization and (
      official.id in (select official_id from visible_assessments)
      or official.id in (select official_id from visible_assignments)
    )
  ), visible_events as (
    select distinct event.* from public.events event
    join visible_games game on game.event_id = event.id
    where event.organization_id = target_organization
  ), visible_submitters as (
    select distinct profile.id, profile.full_name from public.profiles profile
    where profile.id in (select coach_id from visible_assessments)
       or profile.id in (select edited_by from visible_assessments where edited_by is not null)
  )
  select jsonb_build_object(
    'assessments', coalesce((select jsonb_agg(to_jsonb(assessment) order by assessment.created_at desc) from visible_assessments assessment), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(game)) from visible_games game), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(assignment)) from visible_assignments assignment), '[]'::jsonb),
    'officials', coalesce((select jsonb_agg(to_jsonb(official)) from visible_officials official), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(event)) from visible_events event), '[]'::jsonb),
    'submitters', coalesce((select jsonb_agg(to_jsonb(submitter)) from visible_submitters submitter), '[]'::jsonb)
  )
$$;

revoke all on function public.authorized_rating_history(uuid) from public, anon;
grant execute on function public.authorized_rating_history(uuid) to authenticated;
