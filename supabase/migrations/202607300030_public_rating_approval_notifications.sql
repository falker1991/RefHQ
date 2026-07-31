-- Law18Ref v0.9.0: public-rating approval, referee unread state, and retained deletion.

alter table public.organizations
  add column if not exists public_rating_approval_role text not null default 'none'
    check (public_rating_approval_role in ('none', 'organization_admin', 'event_admin'));

alter table public.events
  add column if not exists public_rating_approval_role text not null default 'inherit'
    check (public_rating_approval_role in ('inherit', 'none', 'organization_admin', 'event_admin'));

alter table public.assessments
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists shared_at timestamptz,
  add column if not exists referee_seen_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists retained_for_referee boolean not null default false;

create index if not exists assessments_referee_unread_idx
  on public.assessments(official_id, referee_seen_at)
  where visibility = 'public' and status = 'shared';

create or replace function public.effective_public_rating_approval_role(target_event uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.public_rating_approval_role = 'inherit' then o.public_rating_approval_role
    else e.public_rating_approval_role
  end
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.id = target_event;
$$;

grant execute on function public.effective_public_rating_approval_role(uuid) to authenticated;

drop policy if exists "scoped rating visibility" on public.assessments;
create policy "scoped rating visibility" on public.assessments for select
  using (
    (
      deleted_at is null
      and (
        coach_id = auth.uid()
        or public.is_site_owner()
        or public.has_event_role(
          (select event_id from public.games where public.games.id = assessments.game_id),
          array['event_admin','assignor','referee_coach']::public.membership_role[]
        )
      )
    )
    or (
      visibility = 'public'
      and status = 'shared'
      and not coalesce((
        select e.ratings_admin_only
        from public.games g join public.events e on e.id = g.event_id
        where g.id = assessments.game_id
      ), true)
      and (deleted_at is null or retained_for_referee)
      and official_id in (select id from public.officials where linked_user_id = auth.uid())
    )
  );

create or replace function public.enforce_event_rating_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_type text;
  admin_only boolean;
  target_event uuid;
  approval_role text;
  content_changed boolean := true;
begin
  select e.rating_type, e.ratings_admin_only, e.id
  into configured_type, admin_only, target_event
  from public.games g
  join public.events e on e.id = g.event_id
  where g.id = new.game_id;

  if configured_type is null then
    raise exception 'The selected game is not available for ratings.';
  end if;
  new.evaluation_type := configured_type;
  if admin_only then new.visibility := 'private'; end if;

  if tg_op = 'UPDATE' then
    content_changed := row(
      new.overall_rating, new.positioning, new.decision_making, new.communication,
      new.match_control, new.strengths, new.development_focus, new.coach_notes,
      new.visibility, new.status
    ) is distinct from row(
      old.overall_rating, old.positioning, old.decision_making, old.communication,
      old.match_control, old.strengths, old.development_focus, old.coach_notes,
      old.visibility, old.status
    );
  end if;

  if new.visibility = 'public' and new.status = 'submitted' then
    approval_role := public.effective_public_rating_approval_role(target_event);
    if approval_role = 'none' then
      new.status := 'shared';
      new.shared_at := now();
      new.approved_at := null;
      new.approved_by := null;
    else
      new.shared_at := null;
      new.approved_at := null;
      new.approved_by := null;
    end if;
  end if;

  if new.visibility = 'public' and new.status = 'shared' and content_changed then
    new.referee_seen_at := null;
    new.shared_at := coalesce(new.shared_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.can_review_assessment(target_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assessments a
    join public.games g on g.id = a.game_id
    join public.events e on e.id = g.event_id
    where a.id = target_assessment
      and (
        (
          a.deleted_at is null
          and (
            public.is_site_owner()
            or a.coach_id = auth.uid()
            or public.has_org_role(e.organization_id, array['organization_admin']::public.membership_role[])
            or public.has_event_role(e.id, array['event_admin','assignor','referee_coach']::public.membership_role[])
            or exists (
              select 1
              from public.event_memberships access
              join public.events access_event on access_event.id = access.event_id
              where access.user_id = auth.uid()
                and access_event.organization_id = e.organization_id
                and (
                  access.ratings_history_scope = 'all'
                  or (access.ratings_history_scope = 'specific' and e.id = any(access.ratings_event_ids))
                )
            )
          )
        )
        or (
          a.visibility = 'public'
          and a.status = 'shared'
          and not e.ratings_admin_only
          and (a.deleted_at is null or a.retained_for_referee)
          and exists (
            select 1 from public.officials o
            where o.id = a.official_id and o.linked_user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.approve_public_rating(target_assessment uuid)
returns public.assessments
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  required_role text;
  result public.assessments;
begin
  select a.id, a.visibility, a.status, g.event_id, e.organization_id
  into target
  from public.assessments a
  join public.games g on g.id = a.game_id
  join public.events e on e.id = g.event_id
  where a.id = target_assessment and a.deleted_at is null;

  if target.id is null then raise exception 'Rating not found.'; end if;
  if target.visibility <> 'public' or target.status <> 'submitted' then
    raise exception 'This rating is not awaiting public approval.';
  end if;
  required_role := public.effective_public_rating_approval_role(target.event_id);
  if not (
    public.is_site_owner()
    or (required_role = 'organization_admin' and public.has_org_role(target.organization_id, array['organization_admin']::public.membership_role[]))
    or (required_role = 'event_admin' and public.has_event_role(target.event_id, array['event_admin']::public.membership_role[]))
  ) then
    raise exception 'You do not have the required approval role.';
  end if;

  update public.assessments
  set status = 'shared', approved_at = now(), approved_by = auth.uid(),
      shared_at = now(), referee_seen_at = null, updated_at = now()
  where id = target_assessment
  returning * into result;

  insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id)
  values (target.organization_id, target.event_id, auth.uid(), 'rating.approved', 'assessments', target_assessment::text);
  return result;
end;
$$;

grant execute on function public.approve_public_rating(uuid) to authenticated;

create or replace function public.mark_event_ratings_seen(target_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assessments a
  set referee_seen_at = now()
  from public.games g, public.officials o
  where g.id = a.game_id
    and g.event_id = target_event
    and o.id = a.official_id
    and o.linked_user_id = auth.uid()
    and a.visibility = 'public'
    and a.status = 'shared'
    and a.referee_seen_at is null
    and (a.deleted_at is null or a.retained_for_referee);
end;
$$;

grant execute on function public.mark_event_ratings_seen(uuid) to authenticated;

drop function if exists public.delete_rating(uuid);
create function public.delete_rating(target_assessment uuid, keep_for_referee boolean default false)
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
    target.organization_id, target.event_id, auth.uid(),
    case when keep_for_referee then 'rating.deleted_retained' else 'rating.deleted' end,
    'assessments', target_assessment::text,
    jsonb_build_object('game_id', target.game_id, 'official_id', target.official_id, 'coach_id', target.coach_id)
  );

  if keep_for_referee and target.visibility = 'public' and target.status = 'shared' then
    update public.assessments
    set deleted_at = now(), retained_for_referee = true, updated_at = now()
    where id = target_assessment;
  else
    delete from public.assessments where id = target_assessment;
  end if;
end;
$$;

grant execute on function public.delete_rating(uuid, boolean) to authenticated;

create or replace function public.authorized_rating_history()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with visible_assessments as (
    select a.* from public.assessments a where public.can_review_assessment(a.id)
  ),
  visible_games as (
    select distinct g.* from public.games g join visible_assessments a on a.game_id = g.id
  ),
  visible_assignments as (
    select distinct a.* from public.assignments a join visible_games g on g.id = a.game_id
  ),
  visible_officials as (
    select distinct o.* from public.officials o
    where o.id in (select official_id from visible_assessments)
       or o.id in (select official_id from visible_assignments)
  ),
  visible_events as (
    select distinct e.* from public.events e join visible_games g on g.event_id = e.id
  ),
  visible_submitters as (
    select distinct p.id, p.full_name from public.profiles p
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
