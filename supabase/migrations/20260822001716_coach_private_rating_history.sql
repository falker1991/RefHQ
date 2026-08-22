-- Law18Ref v0.34.0 — referee coaches can review only ratings they authored.
-- Administrative roles retain group/event history access, and referees retain
-- access to their own eligible shared public ratings.

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
              select 1
              from public.event_memberships access
              join public.events access_event on access_event.id = access.event_id
              where access.user_id = (select auth.uid())
                and access.role in ('event_admin','assignor')
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
              select 1
              from public.event_memberships access
              join public.events access_event on access_event.id = access.event_id
              where access.user_id = (select auth.uid())
                and access.role in ('event_admin','assignor')
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

revoke execute on function public.can_review_assessment(uuid) from public, anon;
grant execute on function public.can_review_assessment(uuid) to authenticated;
