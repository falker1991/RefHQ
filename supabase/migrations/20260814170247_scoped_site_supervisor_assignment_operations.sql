-- Law18Ref v0.23.0: scoped Site Supervisor operations and confirmed schedule changes.

alter table public.events
  add column if not exists site_supervisor_assignment_editing_enabled boolean not null default false;

alter table public.event_memberships
  add column if not exists assigned_dates date[] not null default '{}',
  add column if not exists assigned_sites text[] not null default '{}',
  add column if not exists assignment_editing_override boolean;

alter table public.provisional_event_access
  add column if not exists assigned_dates date[] not null default '{}',
  add column if not exists assigned_sites text[] not null default '{}',
  add column if not exists assignment_editing_override boolean;

alter table public.games
  add column if not exists schedule_changed_at timestamptz,
  add column if not exists schedule_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists schedule_change_summary text;

create index if not exists event_memberships_supervisor_scope_idx
  on public.event_memberships(event_id, user_id, role);
create index if not exists games_event_schedule_changed_idx
  on public.games(event_id, schedule_changed_at)
  where schedule_changed_at is not null;

create or replace function public.site_supervisor_game_in_scope(game_uuid uuid, event_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_memberships access
    join public.games game on game.id = game_uuid and game.event_id = access.event_id
    join public.events event on event.id = access.event_id
    where access.event_id = event_uuid
      and access.user_id = (select auth.uid())
      and access.role = 'site_coordinator'
      and (
        access.full_schedule_access
        or game.id = any(coalesce(access.assigned_game_ids, '{}'::uuid[]))
        or (
          cardinality(coalesce(access.assigned_dates, '{}'::date[])) > 0
          and (game.starts_at at time zone event.timezone)::date = any(access.assigned_dates)
          and (
            cardinality(coalesce(access.assigned_sites, '{}'::text[])) = 0
            or coalesce(nullif(game.venue_name, ''), 'Unspecified site') = any(access.assigned_sites)
          )
        )
      )
  )
$$;

revoke execute on function public.site_supervisor_game_in_scope(uuid, uuid) from public, anon;
grant execute on function public.site_supervisor_game_in_scope(uuid, uuid) to authenticated;

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
    or exists (
      select 1
      from public.assignments assignment
      join public.officials official on official.id = assignment.official_id
      where assignment.game_id = game_uuid
        and (official.linked_user_id = (select auth.uid()) or lower(official.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
$$;

create or replace function public.site_supervisor_can_edit_game(game_uuid uuid, event_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.site_supervisor_game_in_scope(game_uuid, event_uuid)
    and exists (
      select 1
      from public.event_memberships access
      join public.events event on event.id = access.event_id
      where access.event_id = event_uuid
        and access.user_id = (select auth.uid())
        and access.role = 'site_coordinator'
        and coalesce(access.assignment_editing_override, event.site_supervisor_assignment_editing_enabled, false)
    )
$$;

revoke execute on function public.site_supervisor_can_edit_game(uuid, uuid) from public, anon;
grant execute on function public.site_supervisor_can_edit_game(uuid, uuid) to authenticated;

create or replace function public.can_manage_game(game_uuid uuid, event_uuid uuid)
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
          or (access.role = 'assignor' and (access.full_schedule_access or game_uuid = any(coalesce(access.assigned_game_ids, '{}'::uuid[]))))
        )
    )
    or public.site_supervisor_can_edit_game(game_uuid, event_uuid)
$$;

create or replace function public.can_manage_assignment(game_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select public.can_manage_game(game.id, game.event_id) from public.games game where game.id = game_uuid), false)
$$;

revoke execute on function public.can_view_game(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_game(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_assignment(uuid) from public, anon;
grant execute on function public.can_view_game(uuid, uuid) to authenticated;
grant execute on function public.can_manage_game(uuid, uuid) to authenticated;
grant execute on function public.can_manage_assignment(uuid) to authenticated;

create or replace function public.can_view_scoped_check_in(target_event uuid, target_official uuid, target_date date)
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
      where event.id = target_event
        and public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    )
    or public.has_event_role(target_event, array['event_admin','assignor']::public.membership_role[])
    or exists (
      select 1
      from public.assignments assignment
      join public.games game on game.id = assignment.game_id
      join public.events event on event.id = game.event_id
      where assignment.official_id = target_official
        and game.event_id = target_event
        and (game.starts_at at time zone event.timezone)::date = target_date
        and public.site_supervisor_game_in_scope(game.id, game.event_id)
    )
$$;

revoke execute on function public.can_view_scoped_check_in(uuid, uuid, date) from public, anon;
grant execute on function public.can_view_scoped_check_in(uuid, uuid, date) to authenticated;

drop policy if exists "scoped staff view checkins" on public.check_ins;
create policy "scoped staff view checkins" on public.check_ins for select to authenticated
using (public.can_view_scoped_check_in(event_id, official_id, event_date));

drop policy if exists "scoped staff manage checkins" on public.check_ins;
create policy "scoped staff manage checkins" on public.check_ins for all to authenticated
using (public.can_view_scoped_check_in(event_id, official_id, event_date))
with check (public.can_view_scoped_check_in(event_id, official_id, event_date));

create or replace function public.replace_game_assignments(game_uuid uuid, requested_assignments jsonb)
returns setof public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.games;
  old_crew jsonb;
  new_crew jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required.'; end if;
  select * into target_game from public.games where id = game_uuid for update;
  if target_game.id is null or not public.can_manage_game(target_game.id, target_game.event_id) then
    raise exception 'You do not have permission to edit assignments for this game.';
  end if;
  if jsonb_typeof(coalesce(requested_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Assignments must be provided as a list.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(requested_assignments, '[]'::jsonb)) item
    left join public.officials official on official.id = (item ->> 'official_id')::uuid
    join public.events event on event.id = target_game.event_id
    where official.id is null or official.organization_id <> event.organization_id or official.archived_at is not null
  ) then
    raise exception 'Every assigned official must be an active member of this group.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('official_id', assignment.official_id, 'position', assignment.position, 'position_title', assignment.position_title) order by assignment.id), '[]'::jsonb)
  into old_crew from public.assignments assignment where assignment.game_id = game_uuid;

  delete from public.assignments where game_id = game_uuid;
  insert into public.assignments (game_id, referee_id, official_id, position, position_title, source_position_title, accepted)
  select game_uuid, null, (item ->> 'official_id')::uuid,
    coalesce(nullif(item ->> 'position', ''), 'other')::public.assignment_position,
    nullif(item ->> 'position_title', ''), nullif(item ->> 'source_position_title', ''), true
  from jsonb_array_elements(coalesce(requested_assignments, '[]'::jsonb)) item;

  select coalesce(jsonb_agg(jsonb_build_object('official_id', assignment.official_id, 'position', assignment.position, 'position_title', assignment.position_title) order by assignment.id), '[]'::jsonb)
  into new_crew from public.assignments assignment where assignment.game_id = game_uuid;

  update public.games set schedule_changed_at = now(), schedule_changed_by = (select auth.uid()),
    schedule_change_summary = 'Crew assignment updated' where id = game_uuid;
  insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id, details)
  select event.organization_id, target_game.event_id, (select auth.uid()), 'assignment.updated', 'game', game_uuid::text,
    jsonb_build_object('previous_crew', old_crew, 'updated_crew', new_crew, 'notifications_sent', false)
  from public.events event where event.id = target_game.event_id;
  return query select * from public.assignments where game_id = game_uuid order by id;
end;
$$;

revoke execute on function public.replace_game_assignments(uuid, jsonb) from public, anon;
grant execute on function public.replace_game_assignments(uuid, jsonb) to authenticated;

create or replace function public.confirm_game_schedule_change(game_uuid uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.games;
  confirmed public.games;
begin
  select * into target_game from public.games where id = game_uuid for update;
  if target_game.id is null or not (
    public.is_site_owner()
    or exists (
      select 1 from public.events event
      where event.id = target_game.event_id and (
        public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
        or public.has_event_role(event.id, array['event_admin']::public.membership_role[])
      )
    )
  ) then raise exception 'Only an Event Admin or higher role can confirm schedule changes.'; end if;
  update public.games set schedule_changed_at = null, schedule_changed_by = null, schedule_change_summary = null
  where id = game_uuid returning * into confirmed;
  insert into public.audit_log (organization_id, event_id, actor_id, action, entity_type, entity_id, details)
  select event.organization_id, target_game.event_id, (select auth.uid()), 'assignment.change_confirmed', 'game', game_uuid::text,
    jsonb_build_object('changed_at', target_game.schedule_changed_at, 'changed_by', target_game.schedule_changed_by)
  from public.events event where event.id = target_game.event_id;
  return confirmed;
end;
$$;

revoke execute on function public.confirm_game_schedule_change(uuid) from public, anon;
grant execute on function public.confirm_game_schedule_change(uuid) to authenticated;

create or replace function public.official_event_day_context(target_event uuid, target_official uuid, target_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean;
  result jsonb;
begin
  select (
    public.is_site_owner()
    or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    or public.has_event_role(target_event, array['event_admin','assignor']::public.membership_role[])
    or public.can_view_scoped_check_in(target_event, target_official, target_date)
  ) into allowed from public.events event where event.id = target_event;
  if not coalesce(allowed, false) then raise exception 'You do not have permission to view this official.'; end if;

  select jsonb_build_object(
    'official', jsonb_build_object(
      'id', official.id, 'full_name', official.full_name, 'email', official.email,
      'secondary_email', official.secondary_email, 'phone', official.phone, 'date_of_birth', official.date_of_birth
    ),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game', to_jsonb(game),
        'selected_position', selected_assignment.position,
        'selected_position_title', selected_assignment.position_title,
        'within_management_scope', public.can_view_game(game.id, game.event_id),
        'crew', coalesce((select jsonb_agg(jsonb_build_object(
          'assignment', to_jsonb(crew_assignment),
          'official_name', crew_official.full_name
        ) order by crew_assignment.id) from public.assignments crew_assignment
          left join public.officials crew_official on crew_official.id = crew_assignment.official_id
          where crew_assignment.game_id = game.id), '[]'::jsonb)
      ) order by game.starts_at, game.field_name)
      from public.assignments selected_assignment
      join public.games game on game.id = selected_assignment.game_id
      join public.events event on event.id = game.event_id
      where selected_assignment.official_id = target_official
        and game.event_id = target_event
        and (game.starts_at at time zone event.timezone)::date = target_date
    ), '[]'::jsonb)
  ) into result
  from public.officials official
  join public.events event on event.organization_id = official.organization_id
  where official.id = target_official and event.id = target_event;
  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke execute on function public.official_event_day_context(uuid, uuid, date) from public, anon;
grant execute on function public.official_event_day_context(uuid, uuid, date) to authenticated;

create or replace function public.save_provisional_event_access_v2(
  official_uuid uuid, event_uuid uuid, requested_roles public.membership_role[],
  requested_full_schedule boolean, requested_coaching_tools boolean,
  requested_ratings_scope text, requested_ratings_events uuid[], requested_game_ids uuid[],
  requested_dates date[], requested_sites text[], requested_assignment_editing_override boolean
)
returns public.provisional_event_access
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.provisional_event_access;
begin
  saved := public.save_provisional_event_access(official_uuid, event_uuid, requested_roles, requested_full_schedule,
    requested_coaching_tools, requested_ratings_scope, requested_ratings_events, requested_game_ids);
  update public.provisional_event_access set assigned_dates = coalesce(requested_dates, '{}'),
    assigned_sites = coalesce(requested_sites, '{}'), assignment_editing_override = requested_assignment_editing_override,
    updated_at = now() where id = saved.id returning * into saved;
  return saved;
end;
$$;

revoke execute on function public.save_provisional_event_access_v2(uuid, uuid, public.membership_role[], boolean, boolean, text, uuid[], uuid[], date[], text[], boolean) from public, anon;
grant execute on function public.save_provisional_event_access_v2(uuid, uuid, public.membership_role[], boolean, boolean, text, uuid[], uuid[], date[], text[], boolean) to authenticated;

-- Future account linking materializes the new supervisor scope fields together
-- with the existing provisional event permissions.
create or replace function public.link_current_referee()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if verified_email = '' then return; end if;
  insert into public.profiles (id, organization_id, full_name, email, primary_email, role)
  select (select auth.uid()), null,
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', split_part(verified_email, '@', 1)),
    verified_email, verified_email, 'referee'::public.app_role
  on conflict (id) do update set primary_email = excluded.primary_email, email = excluded.email;

  update public.officials set linked_user_id = (select auth.uid()), identity_status = 'linked', updated_at = now()
  where lower(trim(email)) = verified_email and (linked_user_id is null or linked_user_id = (select auth.uid()));

  insert into public.organization_memberships (organization_id, user_id, role, status)
  select distinct official.organization_id, (select auth.uid()), intended.role, 'active'::public.membership_status
  from public.officials official
  cross join lateral unnest(case when cardinality(official.pending_org_roles) > 0 then official.pending_org_roles else array[coalesce(official.pending_org_role, 'referee'::public.membership_role)] end) intended(role)
  where official.linked_user_id = (select auth.uid()) and intended.role not in ('site_owner','event_admin')
  on conflict (organization_id, user_id, role) do update set status = 'active', updated_at = now();

  insert into public.event_memberships (
    event_id, user_id, role, full_schedule_access, coaching_tools_enabled,
    ratings_history_scope, ratings_event_ids, assigned_game_ids, assigned_dates,
    assigned_sites, assignment_editing_override, created_by
  )
  select staged.event_id, (select auth.uid()), intended.role, staged.full_schedule_access,
    staged.coaching_tools_enabled, staged.ratings_history_scope, staged.ratings_event_ids,
    staged.assigned_game_ids, staged.assigned_dates, staged.assigned_sites,
    staged.assignment_editing_override, staged.created_by
  from public.provisional_event_access staged
  join public.officials official on official.id = staged.official_id
  cross join lateral unnest(staged.roles) intended(role)
  where official.linked_user_id = (select auth.uid())
  on conflict (event_id, user_id, role) do update set
    full_schedule_access = excluded.full_schedule_access,
    coaching_tools_enabled = excluded.coaching_tools_enabled,
    ratings_history_scope = excluded.ratings_history_scope,
    ratings_event_ids = excluded.ratings_event_ids,
    assigned_game_ids = excluded.assigned_game_ids,
    assigned_dates = excluded.assigned_dates,
    assigned_sites = excluded.assigned_sites,
    assignment_editing_override = excluded.assignment_editing_override;

  delete from public.provisional_event_access staged using public.officials official
  where staged.official_id = official.id and official.linked_user_id = (select auth.uid());
end;
$$;
revoke execute on function public.link_current_referee() from public, anon;
grant execute on function public.link_current_referee() to authenticated;

grant select, update on public.events to authenticated;
grant select, insert, update, delete on public.event_memberships to authenticated;
grant select on public.games to authenticated;
grant select on public.provisional_event_access to authenticated;
