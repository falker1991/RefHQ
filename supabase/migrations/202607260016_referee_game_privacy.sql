-- Referees may retrieve only games to which their linked official identity is
-- assigned. Event staff and referee coaches retain their scoped schedule view.
drop policy if exists "scoped users view games" on public.games;
drop policy if exists "members view accessible games" on public.games;

create policy "members view assigned or staffed games"
  on public.games for select to authenticated
  using (
    public.has_event_role(
      event_id,
      array['event_admin','assignor','referee_coach']::public.membership_role[]
    )
    or exists (
      select 1
      from public.assignments a
      join public.officials o on o.id = a.official_id
      where a.game_id = games.id
        and (
          o.linked_user_id = auth.uid()
          or lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );
