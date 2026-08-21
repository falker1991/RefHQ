-- Law18Ref v0.31.4: make linked coach assignments authoritative for game
-- visibility. A coach may see only games assigned directly to their user, or
-- every rateable game in an event when they hold a full-schedule assignment.

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
    or exists (
      select 1
      from public.coach_assignments coaching
      where coaching.event_id = event_uuid
        and coaching.coach_id = (select auth.uid())
        and (coaching.full_schedule or coaching.game_id = game_uuid)
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

notify pgrst, 'reload schema';
