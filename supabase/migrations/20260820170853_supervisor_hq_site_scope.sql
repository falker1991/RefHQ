-- Law18Ref v0.30.3: Site Supervisors can read crews for every game in their
-- assigned date/site scope, including operational REF HQ records. This is
-- independent of whether assignment editing is enabled for the supervisor.

drop policy if exists "site supervisors view scoped game crews" on public.assignments;
create policy "site supervisors view scoped game crews"
  on public.assignments for select to authenticated
  using (
    exists (
      select 1
      from public.games game
      where game.id = assignments.game_id
        and public.site_supervisor_game_in_scope(game.id, game.event_id)
    )
  );

notify pgrst, 'reload schema';
