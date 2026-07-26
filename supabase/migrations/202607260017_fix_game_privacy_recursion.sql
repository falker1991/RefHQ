-- Resolve game access outside RLS evaluation so games and assignments do not
-- recursively invoke one another's policies.
create or replace function public.can_view_game(game_uuid uuid, event_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_event_role(
      event_uuid,
      array['event_admin','assignor','referee_coach']::public.membership_role[]
    )
    or exists (
      select 1
      from public.assignments a
      join public.officials o on o.id = a.official_id
      where a.game_id = game_uuid
        and (
          o.linked_user_id = auth.uid()
          or lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
$$;

grant execute on function public.can_view_game(uuid, uuid) to authenticated;

drop policy if exists "scoped users view games" on public.games;
drop policy if exists "members view accessible games" on public.games;
drop policy if exists "members view assigned or staffed games" on public.games;

create policy "members view assigned or staffed games"
  on public.games for select to authenticated
  using (public.can_view_game(games.id, games.event_id));
