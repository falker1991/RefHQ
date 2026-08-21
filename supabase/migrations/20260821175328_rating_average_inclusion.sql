alter table public.assessments
  add column if not exists include_in_averages boolean not null default true;

comment on column public.assessments.include_in_averages is
  'When false, the rating remains available to authorized staff and in exports, but is excluded from calculated averages and hidden from the rated referee.';

-- Staff visibility is unchanged. The rated referee may only read shared public
-- ratings that currently count in averages.
drop policy if exists "scoped rating visibility" on public.assessments;
create policy "scoped rating visibility" on public.assessments for select
to authenticated
using (
  exists (
    select 1
    from public.games game
    join public.events event on event.id = game.event_id
    where game.id = assessments.game_id
      and assessments.organization_id = event.organization_id
      and (
        (
          assessments.deleted_at is null
          and (
            public.is_site_owner()
            or assessments.coach_id = (select auth.uid())
            or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
            or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
            or exists (
              select 1 from public.coach_assignments coaching
              where coaching.event_id = event.id
                and coaching.coach_id = (select auth.uid())
                and (coaching.full_schedule or coaching.game_id = game.id)
            )
            or exists (
              select 1
              from public.event_memberships access
              join public.events access_event on access_event.id = access.event_id
              where access.user_id = (select auth.uid())
                and access_event.organization_id = event.organization_id
                and (
                  access.ratings_history_scope = 'all'
                  or (access.ratings_history_scope = 'specific' and event.id = any(access.ratings_event_ids))
                )
            )
          )
        )
        or (
          assessments.include_in_averages
          and assessments.visibility = 'public'
          and assessments.status = 'shared'
          and not event.ratings_admin_only
          and (assessments.deleted_at is null or assessments.retained_for_referee)
          and exists (
            select 1 from public.officials official
            where official.id = assessments.official_id
              and official.organization_id = event.organization_id
              and official.linked_user_id = (select auth.uid())
          )
        )
      )
  )
);

create or replace function public.can_review_assessment(target_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assessments assessment
    join public.games game on game.id = assessment.game_id
    join public.events event on event.id = game.event_id
    where assessment.id = target_assessment
      and assessment.organization_id = event.organization_id
      and (
        (
          assessment.deleted_at is null
          and (
            public.is_site_owner()
            or assessment.coach_id = (select auth.uid())
            or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
            or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
            or exists (
              select 1 from public.coach_assignments coaching
              where coaching.event_id = event.id
                and coaching.coach_id = (select auth.uid())
                and (coaching.full_schedule or coaching.game_id = game.id)
            )
            or exists (
              select 1
              from public.event_memberships access
              join public.events access_event on access_event.id = access.event_id
              where access.user_id = (select auth.uid())
                and access_event.organization_id = event.organization_id
                and (
                  access.ratings_history_scope = 'all'
                  or (access.ratings_history_scope = 'specific' and event.id = any(access.ratings_event_ids))
                )
            )
          )
        )
        or (
          assessment.include_in_averages
          and assessment.visibility = 'public'
          and assessment.status = 'shared'
          and not event.ratings_admin_only
          and (assessment.deleted_at is null or assessment.retained_for_referee)
          and exists (
            select 1 from public.officials official
            where official.id = assessment.official_id
              and official.organization_id = event.organization_id
              and official.linked_user_id = (select auth.uid())
          )
        )
      )
  );
$$;

create or replace function public.mark_event_ratings_seen(target_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required.'; end if;

  update public.assessments assessment
  set referee_seen_at = now()
  from public.games game, public.officials official
  where game.id = assessment.game_id
    and game.event_id = target_event
    and official.id = assessment.official_id
    and official.linked_user_id = (select auth.uid())
    and assessment.include_in_averages
    and assessment.visibility = 'public'
    and assessment.status = 'shared'
    and assessment.referee_seen_at is null
    and (assessment.deleted_at is null or assessment.retained_for_referee);
end;
$$;

create or replace function public.protect_rating_average_inclusion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event uuid;
  target_organization uuid;
begin
  if new.include_in_averages is not distinct from old.include_in_averages then
    return new;
  end if;

  select g.event_id, e.organization_id
  into target_event, target_organization
  from public.games g
  join public.events e on e.id = g.event_id
  where g.id = old.game_id;

  if not (
    public.is_site_owner()
    or public.has_org_role(target_organization, array['organization_director','organization_admin']::public.membership_role[])
    or public.has_event_role(target_event, array['event_admin']::public.membership_role[])
  ) then
    raise exception 'You do not have permission to change whether this rating counts toward averages.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_rating_average_inclusion_change on public.assessments;
create trigger protect_rating_average_inclusion_change
before update of include_in_averages on public.assessments
for each row execute function public.protect_rating_average_inclusion();

create or replace function public.set_rating_average_inclusion(
  target_assessment uuid,
  should_include boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required.'; end if;

  select a.id, a.game_id, a.official_id, a.organization_id, a.include_in_averages, g.event_id
  into target
  from public.assessments a
  join public.games g on g.id = a.game_id
  where a.id = target_assessment and a.deleted_at is null;

  if target.id is null then raise exception 'Rating not found.'; end if;

  if not (
    public.is_site_owner()
    or public.has_org_role(target.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    or public.has_event_role(target.event_id, array['event_admin']::public.membership_role[])
  ) then
    raise exception 'You do not have permission to change whether this rating counts toward averages.' using errcode = '42501';
  end if;

  update public.assessments
  set include_in_averages = should_include,
      referee_seen_at = case
        when should_include and visibility = 'public' and status = 'shared' then null
        else referee_seen_at
      end,
      shared_at = case
        when should_include and visibility = 'public' and status = 'shared' then now()
        else shared_at
      end,
      updated_at = now()
  where id = target_assessment;

  if target.include_in_averages is distinct from should_include then
    insert into public.audit_log (
      organization_id, event_id, actor_id, action, entity_type, entity_id, details
    ) values (
      target.organization_id, target.event_id, (select auth.uid()),
      case when should_include then 'rating.average_included' else 'rating.average_excluded' end,
      'assessments', target_assessment::text,
      jsonb_build_object('game_id', target.game_id, 'official_id', target.official_id, 'include_in_averages', should_include)
    );
  end if;
end;
$$;

revoke all on function public.protect_rating_average_inclusion() from public, anon, authenticated;
revoke all on function public.set_rating_average_inclusion(uuid, boolean) from public, anon;
grant execute on function public.set_rating_average_inclusion(uuid, boolean) to authenticated;
revoke execute on function public.can_review_assessment(uuid) from public, anon;
grant execute on function public.can_review_assessment(uuid) to authenticated;
revoke execute on function public.mark_event_ratings_seen(uuid) from public, anon;
grant execute on function public.mark_event_ratings_seen(uuid) to authenticated;
