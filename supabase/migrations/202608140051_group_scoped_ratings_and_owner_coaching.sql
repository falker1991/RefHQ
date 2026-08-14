-- Law18Ref v0.21.1: group-owned rating history and explicit Site Owner operations.

create or replace function public.enforce_assessment_group_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  game_organization uuid;
begin
  select event.organization_id into game_organization
  from public.games game
  join public.events event on event.id = game.event_id
  where game.id = new.game_id;

  if game_organization is null then
    raise exception 'The selected game is not available for ratings.';
  end if;
  new.organization_id := game_organization;
  return new;
end;
$$;

drop trigger if exists enforce_assessment_group_ownership on public.assessments;
create trigger enforce_assessment_group_ownership
before insert or update of game_id, organization_id on public.assessments
for each row execute function public.enforce_assessment_group_ownership();

revoke execute on function public.enforce_assessment_group_ownership() from public, anon, authenticated;

drop policy if exists "scoped rating visibility" on public.assessments;
drop policy if exists "scoped coaches submit assessments" on public.assessments;
drop policy if exists "scoped coaches update assessments" on public.assessments;

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
            or public.has_org_role(event.organization_id, array['organization_admin']::public.membership_role[])
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
          assessments.visibility = 'public'
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

create policy "scoped coaches submit assessments" on public.assessments for insert
to authenticated
with check (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.games game
    join public.events event on event.id = game.event_id
    where game.id = assessments.game_id
      and assessments.organization_id = event.organization_id
      and (
        public.is_site_owner()
        or public.has_org_role(event.organization_id, array['organization_admin']::public.membership_role[])
        or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
        or exists (
          select 1 from public.coach_assignments coaching
          where coaching.event_id = event.id
            and coaching.coach_id = (select auth.uid())
            and (coaching.full_schedule or coaching.game_id = game.id)
        )
        or exists (
          select 1 from public.event_memberships membership
          where membership.event_id = event.id
            and membership.user_id = (select auth.uid())
            and membership.coaching_tools_enabled
        )
      )
  )
);

create policy "scoped coaches update assessments" on public.assessments for update
to authenticated
using (
  coach_id = (select auth.uid())
  or public.is_site_owner()
  or exists (
    select 1 from public.games game
    join public.events event on event.id = game.event_id
    where game.id = assessments.game_id
      and assessments.organization_id = event.organization_id
      and (
        public.has_org_role(event.organization_id, array['organization_admin']::public.membership_role[])
        or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
      )
  )
)
with check (
  coach_id = (select auth.uid())
  or public.is_site_owner()
  or exists (
    select 1 from public.games game
    join public.events event on event.id = game.event_id
    where game.id = assessments.game_id
      and assessments.organization_id = event.organization_id
      and (
        public.has_org_role(event.organization_id, array['organization_admin']::public.membership_role[])
        or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
      )
  )
);

drop policy if exists "scoped coaches view coach assignments" on public.coach_assignments;
drop policy if exists "scoped staff manage coach assignments" on public.coach_assignments;

create policy "scoped coaches view coach assignments" on public.coach_assignments for select
to authenticated
using (
  public.is_site_owner()
  or coach_id = (select auth.uid())
  or public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[])
);

create policy "scoped staff manage coach assignments" on public.coach_assignments for all
to authenticated
using (
  public.is_site_owner()
  or public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[])
)
with check (
  public.is_site_owner()
  or public.has_event_role(event_id, array['event_admin','assignor']::public.membership_role[])
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
            or assessment.coach_id = auth.uid()
            or public.has_org_role(event.organization_id, array['organization_admin']::public.membership_role[])
            or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
            or exists (
              select 1 from public.coach_assignments coaching
              where coaching.event_id = event.id
                and coaching.coach_id = auth.uid()
                and (coaching.full_schedule or coaching.game_id = game.id)
            )
            or exists (
              select 1
              from public.event_memberships access
              join public.events access_event on access_event.id = access.event_id
              where access.user_id = auth.uid()
                and access_event.organization_id = event.organization_id
                and (
                  access.ratings_history_scope = 'all'
                  or (access.ratings_history_scope = 'specific' and event.id = any(access.ratings_event_ids))
                )
            )
          )
        )
        or (
          assessment.visibility = 'public'
          and assessment.status = 'shared'
          and not event.ratings_admin_only
          and (assessment.deleted_at is null or assessment.retained_for_referee)
          and exists (
            select 1 from public.officials official
            where official.id = assessment.official_id
              and official.organization_id = event.organization_id
              and official.linked_user_id = auth.uid()
          )
        )
      )
  );
$$;

revoke execute on function public.can_review_assessment(uuid) from public, anon;
grant execute on function public.can_review_assessment(uuid) to authenticated;

drop function if exists public.authorized_rating_history();
drop function if exists public.authorized_rating_history(uuid);
create function public.authorized_rating_history(target_organization uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with visible_assessments as (
    select assessment.*
    from public.assessments assessment
    join public.games game on game.id = assessment.game_id
    join public.events event on event.id = game.event_id
    where event.organization_id = target_organization
      and assessment.organization_id = target_organization
      and public.can_review_assessment(assessment.id)
  ),
  visible_games as (
    select distinct game.*
    from public.games game
    join public.events event on event.id = game.event_id
    join visible_assessments assessment on assessment.game_id = game.id
    where event.organization_id = target_organization
  ),
  visible_assignments as (
    select distinct assignment.*
    from public.assignments assignment
    join visible_games game on game.id = assignment.game_id
  ),
  visible_officials as (
    select distinct official.*
    from public.officials official
    where official.organization_id = target_organization
      and (
        official.id in (select official_id from visible_assessments)
        or official.id in (select official_id from visible_assignments)
      )
  ),
  visible_events as (
    select distinct event.*
    from public.events event
    join visible_games game on game.event_id = event.id
    where event.organization_id = target_organization
  ),
  visible_submitters as (
    select distinct profile.id, profile.full_name
    from public.profiles profile
    join visible_assessments assessment on assessment.coach_id = profile.id
  )
  select jsonb_build_object(
    'assessments', coalesce((select jsonb_agg(to_jsonb(assessment) order by assessment.created_at desc) from visible_assessments assessment), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(game)) from visible_games game), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(assignment)) from visible_assignments assignment), '[]'::jsonb),
    'officials', coalesce((select jsonb_agg(to_jsonb(official)) from visible_officials official), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(event)) from visible_events event), '[]'::jsonb),
    'submitters', coalesce((select jsonb_agg(to_jsonb(submitter)) from visible_submitters submitter), '[]'::jsonb)
  );
$$;

revoke execute on function public.authorized_rating_history(uuid) from public, anon;
grant execute on function public.authorized_rating_history(uuid) to authenticated;
