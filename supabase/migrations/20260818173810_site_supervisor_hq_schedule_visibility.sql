-- Law18Ref v0.25.0: Site Supervisors may view HQ/operational schedule entries
-- on dates within their event scope. This is view-only and does not broaden
-- their assignment-editing scope.

create or replace function public.site_supervisor_can_view_operational_game(game_uuid uuid, event_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_memberships access
    join public.games target_game on target_game.id = game_uuid and target_game.event_id = access.event_id
    join public.events event on event.id = access.event_id
    where access.event_id = event_uuid
      and access.user_id = (select auth.uid())
      and access.role = 'site_coordinator'
      and (
        target_game.operational
        or lower(coalesce(target_game.field_name, '')) like '%hq%'
        or lower(coalesce(target_game.venue_name, '')) like '%hq%'
      )
      and (
        access.full_schedule_access
        or (target_game.starts_at at time zone event.timezone)::date = any(coalesce(access.assigned_dates, '{}'::date[]))
        or exists (
          select 1
          from public.games scoped_game
          where scoped_game.event_id = event_uuid
            and scoped_game.id = any(coalesce(access.assigned_game_ids, '{}'::uuid[]))
            and (scoped_game.starts_at at time zone event.timezone)::date = (target_game.starts_at at time zone event.timezone)::date
        )
      )
  )
$$;

revoke all on function public.site_supervisor_can_view_operational_game(uuid, uuid) from public, anon;
grant execute on function public.site_supervisor_can_view_operational_game(uuid, uuid) to authenticated;

create or replace function public.can_view_game(game_uuid uuid, event_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_site_owner()
    or exists (
      select 1 from public.events event
      where event.id = event_uuid
        and public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    )
    or exists (
      select 1 from public.event_memberships access
      where access.event_id = event_uuid
        and access.user_id = (select auth.uid())
        and (
          access.role = 'event_admin'
          or (access.role in ('assignor','referee_coach') and (access.full_schedule_access or game_uuid = any(coalesce(access.assigned_game_ids, '{}'::uuid[]))))
        )
    )
    or public.site_supervisor_game_in_scope(game_uuid, event_uuid)
    or public.site_supervisor_can_view_operational_game(game_uuid, event_uuid)
    or exists (
      select 1
      from public.assignments assignment
      join public.officials official on official.id = assignment.official_id
      where assignment.game_id = game_uuid
        and (official.linked_user_id = (select auth.uid()) or lower(official.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
$$;

revoke all on function public.can_view_game(uuid, uuid) from public, anon;
grant execute on function public.can_view_game(uuid, uuid) to authenticated;

drop policy if exists "site supervisors view visible game crews" on public.assignments;
create policy "site supervisors view visible game crews"
  on public.assignments for select to authenticated
  using (
    exists (
      select 1 from public.games game
      where game.id = assignments.game_id
        and (
          public.site_supervisor_game_in_scope(game.id, game.event_id)
          or public.site_supervisor_can_view_operational_game(game.id, game.event_id)
        )
    )
  );

notify pgrst, 'reload schema';
