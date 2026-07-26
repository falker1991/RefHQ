-- Rich game metadata, provisional official roles, and historical-ratings access.
alter table public.games
  add column if not exists venue_name text,
  add column if not exists age_group text,
  add column if not exists gender text,
  add column if not exists game_type text,
  add column if not exists operational boolean not null default false;

alter table public.officials
  add column if not exists pending_org_role public.membership_role not null default 'referee';

alter table public.event_memberships
  add column if not exists ratings_history_scope text not null default 'none'
    check (ratings_history_scope in ('none', 'specific', 'all')),
  add column if not exists ratings_event_ids uuid[] not null default '{}'::uuid[];

update public.games
set operational = true
where lower(coalesce(field_name, '')) like '%hq%'
   or lower(coalesce(home_team, '')) in (
     'standby', 'ref coordinator', 'ref coord', 'ref coach',
     'referee coach', 'site coordinator', 'site supervisor'
   )
   or lower(coalesce(away_team, '')) in (
     'standby', 'ref coordinator', 'ref coord', 'ref coach',
     'referee coach', 'site coordinator', 'site supervisor'
   );

create policy "granted users view historical rating games"
  on public.games for select to authenticated
  using (
    exists (
      select 1
      from public.event_memberships access
      join public.events access_event on access_event.id = access.event_id
      join public.events target_event on target_event.id = games.event_id
      where access.user_id = auth.uid()
        and access_event.organization_id = target_event.organization_id
        and (
          access.ratings_history_scope = 'all'
          or (
            access.ratings_history_scope = 'specific'
            and games.event_id = any(access.ratings_event_ids)
          )
        )
    )
  );

create policy "granted users view historical ratings"
  on public.assessments for select to authenticated
  using (
    exists (
      select 1
      from public.games target_game
      join public.events target_event on target_event.id = target_game.event_id
      join public.event_memberships access on access.user_id = auth.uid()
      join public.events access_event on access_event.id = access.event_id
      where target_game.id = assessments.game_id
        and access_event.organization_id = target_event.organization_id
        and (
          access.ratings_history_scope = 'all'
          or (
            access.ratings_history_scope = 'specific'
            and target_event.id = any(access.ratings_event_ids)
          )
        )
    )
  );

create policy "granted users view historical rating assignments"
  on public.assignments for select to authenticated
  using (
    exists (
      select 1
      from public.games target_game
      join public.events target_event on target_event.id = target_game.event_id
      join public.event_memberships access on access.user_id = auth.uid()
      join public.events access_event on access_event.id = access.event_id
      where target_game.id = assignments.game_id
        and access_event.organization_id = target_event.organization_id
        and (
          access.ratings_history_scope = 'all'
          or (
            access.ratings_history_scope = 'specific'
            and target_event.id = any(access.ratings_event_ids)
          )
        )
    )
  );
