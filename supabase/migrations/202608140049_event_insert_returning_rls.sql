-- Law18Ref v0.20.1: allow authorized event creators to read a row from
-- INSERT ... RETURNING in the same statement.
--
-- can_view_event(uuid) is STABLE and queries public.events. During an INSERT
-- statement it cannot see the row that was just created, so a PostgREST
-- request using return=representation failed the SELECT policy even after the
-- INSERT policy passed. Authorize Site Owners and active group members from
-- the candidate row's organization_id before using the existing helper.

drop policy if exists "members view accessible events" on public.events;

create policy "members view accessible events"
on public.events for select
to authenticated
using (
  archived_at is null
  and (auto_archive_at is null or auto_archive_at > now())
  and (
    public.is_site_owner()
    or exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = events.organization_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
    or public.can_view_event(events.id)
  )
);
