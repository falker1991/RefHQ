-- Law18Ref v0.31.3: allow Site Supervisors to resolve official names for
-- crews on games visible within their event scope. This does not grant access
-- to the full group officials directory or any assignment outside that scope.

create or replace function public.site_supervisor_can_view_crew_official(target_official uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments assignment
    join public.games game on game.id = assignment.game_id
    where assignment.official_id = target_official
      and (
        public.site_supervisor_game_in_scope(game.id, game.event_id)
        or public.site_supervisor_can_view_operational_game(game.id, game.event_id)
      )
  )
$$;

revoke all on function public.site_supervisor_can_view_crew_official(uuid) from public, anon;
grant execute on function public.site_supervisor_can_view_crew_official(uuid) to authenticated;

drop policy if exists "site supervisors view scoped crew officials" on public.officials;
create policy "site supervisors view scoped crew officials"
  on public.officials for select to authenticated
  using (public.site_supervisor_can_view_crew_official(id));

notify pgrst, 'reload schema';
