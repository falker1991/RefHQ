-- Let referee coaches see crew assignments and official names only within their
-- authorized coaching scope. Security-definer helpers avoid recursive RLS checks.

create or replace function public.coach_can_view_game(target_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_site_owner()
    or exists (
      select 1
      from public.games g
      join public.coach_assignments ca on ca.event_id = g.event_id
      where g.id = target_game_id
        and ca.coach_id = auth.uid()
        and (ca.full_schedule or ca.game_id = g.id)
    )
    or exists (
      select 1
      from public.games g
      join public.event_memberships em on em.event_id = g.event_id
      where g.id = target_game_id
        and em.user_id = auth.uid()
        and em.role = 'referee_coach'
        and (
          em.full_schedule_access
          or g.id = any(coalesce(em.assigned_game_ids, '{}'::uuid[]))
        )
    );
$$;

grant execute on function public.coach_can_view_game(uuid) to authenticated;

drop policy if exists "coaches view assigned game crews" on public.assignments;
create policy "coaches view assigned game crews"
  on public.assignments for select to authenticated
  using (public.coach_can_view_game(game_id));

create or replace function public.coach_can_view_official(target_official_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments a
    where a.official_id = target_official_id
      and public.coach_can_view_game(a.game_id)
  );
$$;

grant execute on function public.coach_can_view_official(uuid) to authenticated;

drop policy if exists "coaches view assigned crew officials" on public.officials;
create policy "coaches view assigned crew officials"
  on public.officials for select to authenticated
  using (public.coach_can_view_official(id));
