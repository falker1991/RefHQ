-- Law18Ref v0.7.0: durable rating history, archival, deletion, and export auditing.

alter table public.assessments
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists assessments_archived_at_idx
  on public.assessments(archived_at);

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
        public.is_site_owner()
        or a.coach_id = auth.uid()
        or exists (
          select 1 from public.organization_memberships om
          where om.organization_id = e.organization_id
            and om.user_id = auth.uid()
            and om.status = 'active'
            and om.role = 'organization_admin'
        )
        or exists (
          select 1 from public.event_memberships em
          where em.event_id = e.id
            and em.user_id = auth.uid()
            and em.role in ('event_admin', 'assignor', 'referee_coach')
        )
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
        or (
          a.visibility = 'public'
          and not e.ratings_admin_only
          and exists (
            select 1 from public.officials o
            where o.id = a.official_id and o.linked_user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_manage_assessment(target_assessment uuid)
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
        public.is_site_owner()
        or a.coach_id = auth.uid()
        or public.has_org_role(e.organization_id, array['organization_admin']::public.membership_role[])
        or public.has_event_role(e.id, array['event_admin','assignor']::public.membership_role[])
      )
  );
$$;

grant execute on function public.can_review_assessment(uuid) to authenticated;
grant execute on function public.can_manage_assessment(uuid) to authenticated;

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
  )
  select jsonb_build_object(
    'assessments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from visible_assessments a), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g)) from visible_games g), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from visible_assignments a), '[]'::jsonb),
    'officials', coalesce((select jsonb_agg(to_jsonb(o)) from visible_officials o), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from visible_events e), '[]'::jsonb)
  );
$$;

grant execute on function public.authorized_rating_history() to authenticated;

create or replace function public.set_rating_archived(
  target_assessment uuid,
  should_archive boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  select a.id, g.event_id, e.organization_id
  into target
  from public.assessments a
  join public.games g on g.id = a.game_id
  join public.events e on e.id = g.event_id
  where a.id = target_assessment;

  if target.id is null then raise exception 'Rating not found.'; end if;
  if not public.can_manage_assessment(target_assessment) then
    raise exception 'You do not have permission to manage this rating.';
  end if;

  update public.assessments
  set archived_at = case when should_archive then now() else null end,
      archived_by = case when should_archive then auth.uid() else null end,
      updated_at = now()
  where id = target_assessment;

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id
  ) values (
    target.organization_id, target.event_id, auth.uid(),
    case when should_archive then 'rating.archived' else 'rating.restored' end,
    'assessments', target_assessment::text
  );
end;
$$;

grant execute on function public.set_rating_archived(uuid, boolean) to authenticated;

create or replace function public.delete_rating(target_assessment uuid)
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
  where a.id = target_assessment;

  if target.id is null then raise exception 'Rating not found.'; end if;
  if not public.can_manage_assessment(target_assessment) then
    raise exception 'You do not have permission to delete this rating.';
  end if;

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id, details
  ) values (
    target.organization_id, target.event_id, auth.uid(), 'rating.deleted',
    'assessments', target_assessment::text,
    jsonb_build_object(
      'game_id', target.game_id,
      'official_id', target.official_id,
      'coach_id', target.coach_id,
      'evaluation_type', target.evaluation_type,
      'status', target.status
    )
  );

  delete from public.assessments where id = target_assessment;
end;
$$;

grant execute on function public.delete_rating(uuid) to authenticated;

create or replace function public.log_rating_export(rating_count integer, game_count integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, entity_type, details)
  values (
    auth.uid(), 'ratings.exported', 'assessments',
    jsonb_build_object('rating_count', rating_count, 'game_count', game_count)
  );
end;
$$;

grant execute on function public.log_rating_export(integer, integer) to authenticated;
