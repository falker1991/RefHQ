-- Law18Ref v0.2.1 hotfix
-- Avoid cross-table RLS recursion between events and games by resolving event
-- access inside one security-definer helper.

create or replace function public.can_view_event(event_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_site_owner()
    or exists (
      select 1
      from public.events e
      join public.organization_memberships om
        on om.organization_id = e.organization_id
      where e.id = event_uuid
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
    or exists (
      select 1
      from public.event_memberships em
      where em.event_id = event_uuid
        and em.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.games g
      join public.assignments a on a.game_id = g.id
      join public.officials o on o.id = a.official_id
      where g.event_id = event_uuid
        and o.linked_user_id = auth.uid()
    )
$$;

grant execute on function public.can_view_event(uuid) to authenticated;

drop policy if exists "members view events" on public.events;
drop policy if exists "scoped members view events" on public.events;
create policy "members view accessible events"
  on public.events for select
  using (archived_at is null and public.can_view_event(events.id));

drop policy if exists "members view games" on public.games;
drop policy if exists "scoped users view games" on public.games;
create policy "members view accessible games"
  on public.games for select
  using (public.can_view_event(games.event_id));

