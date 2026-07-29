-- Law18Referee Management v0.5.0
-- Safe organization account merging and game-scoped event access.

alter table public.profiles
  add column if not exists merged_into_user_id uuid references auth.users(id) on delete set null,
  add column if not exists merged_at timestamptz;

alter table public.officials
  add column if not exists merged_into_official_id uuid references public.officials(id) on delete set null;

alter table public.event_memberships
  add column if not exists assigned_game_ids uuid[] not null default '{}'::uuid[];

create index if not exists officials_merged_into_idx
  on public.officials(merged_into_official_id)
  where merged_into_official_id is not null;

create or replace function public.merge_organization_accounts(
  organization_uuid uuid,
  primary_official_uuid uuid,
  secondary_official_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_official public.officials%rowtype;
  secondary_official public.officials%rowtype;
  primary_user uuid;
  secondary_user uuid;
  primary_email text;
begin
  if primary_official_uuid = secondary_official_uuid then
    raise exception 'Choose two different accounts.';
  end if;

  if not public.has_org_role(
    organization_uuid,
    array['organization_admin']::public.membership_role[]
  ) then
    raise exception 'Only an organization administrator can merge accounts.';
  end if;

  select * into primary_official
  from public.officials
  where id = primary_official_uuid
    and organization_id = organization_uuid
    and merged_into_official_id is null
  for update;

  select * into secondary_official
  from public.officials
  where id = secondary_official_uuid
    and organization_id = organization_uuid
    and merged_into_official_id is null
  for update;

  if primary_official.id is null or secondary_official.id is null then
    raise exception 'Both officials must be active members of this organization.';
  end if;
  if primary_official.linked_user_id is null or secondary_official.linked_user_id is null then
    raise exception 'Both records must be linked to existing login accounts.';
  end if;
  if primary_official.linked_user_id = secondary_official.linked_user_id then
    raise exception 'These official records already use the same account.';
  end if;

  primary_user := primary_official.linked_user_id;
  secondary_user := secondary_official.linked_user_id;
  select lower(coalesce(p.primary_email, p.email)) into primary_email
  from public.profiles p where p.id = primary_user;

  -- Remove collisions before transferring the secondary official's records.
  delete from public.assignments secondary_assignment
  where secondary_assignment.official_id = secondary_official_uuid
    and exists (
      select 1 from public.assignments primary_assignment
      where primary_assignment.official_id = primary_official_uuid
        and primary_assignment.game_id = secondary_assignment.game_id
        and primary_assignment.position = secondary_assignment.position
    );
  update public.assignments
    set official_id = primary_official_uuid
    where official_id = secondary_official_uuid;
  delete from public.assignments secondary_assignment
  where secondary_assignment.referee_id = secondary_user
    and exists (
      select 1 from public.assignments primary_assignment
      where primary_assignment.referee_id = primary_user
        and primary_assignment.game_id = secondary_assignment.game_id
        and primary_assignment.position = secondary_assignment.position
    );
  update public.assignments set referee_id = primary_user
  where referee_id = secondary_user;

  delete from public.check_ins secondary_checkin
  where secondary_checkin.official_id = secondary_official_uuid
    and exists (
      select 1 from public.check_ins primary_checkin
      where primary_checkin.official_id = primary_official_uuid
        and primary_checkin.event_id = secondary_checkin.event_id
        and primary_checkin.event_date = secondary_checkin.event_date
    );
  update public.check_ins
    set official_id = primary_official_uuid
    where official_id = secondary_official_uuid;
  delete from public.check_ins secondary_checkin
  where secondary_checkin.referee_id = secondary_user
    and exists (
      select 1 from public.check_ins primary_checkin
      where primary_checkin.referee_id = primary_user
        and primary_checkin.event_id = secondary_checkin.event_id
        and primary_checkin.event_date = secondary_checkin.event_date
    );
  update public.check_ins set referee_id = primary_user
  where referee_id = secondary_user;

  delete from public.assessments secondary_assessment
  where secondary_assessment.official_id = secondary_official_uuid
    and exists (
      select 1 from public.assessments primary_assessment
      where primary_assessment.official_id = primary_official_uuid
        and primary_assessment.game_id = secondary_assessment.game_id
        and primary_assessment.coach_id = secondary_assessment.coach_id
    );
  update public.assessments
    set official_id = primary_official_uuid
    where official_id = secondary_official_uuid;
  delete from public.assessments secondary_assessment
  where secondary_assessment.referee_id = secondary_user
    and exists (
      select 1 from public.assessments primary_assessment
      where primary_assessment.referee_id = primary_user
        and primary_assessment.game_id = secondary_assessment.game_id
        and primary_assessment.coach_id = secondary_assessment.coach_id
    );
  update public.assessments set referee_id = primary_user
  where referee_id = secondary_user;

  update public.coach_assignments
    set official_id = primary_official_uuid
    where official_id = secondary_official_uuid;
  update public.coach_assignments set coach_id = primary_user
  where coach_id = secondary_user;
  update public.coach_assignments set referee_id = primary_user
  where referee_id = secondary_user;

  -- Preserve organization and event permissions on the surviving login.
  insert into public.organization_memberships
    (organization_id, user_id, role, status, created_by)
  select organization_id, primary_user, role, status, auth.uid()
  from public.organization_memberships
  where organization_id = organization_uuid and user_id = secondary_user
  on conflict (organization_id, user_id, role)
  do update set
    status = case
      when excluded.status = 'active' then 'active'::public.membership_status
      else public.organization_memberships.status
    end,
    updated_at = now();

  insert into public.event_memberships
    (event_id, user_id, role, full_schedule_access, coaching_tools_enabled,
     ratings_history_scope, ratings_event_ids, assigned_game_ids, created_by)
  select em.event_id, primary_user, em.role, em.full_schedule_access,
    em.coaching_tools_enabled, em.ratings_history_scope, em.ratings_event_ids,
    em.assigned_game_ids, auth.uid()
  from public.event_memberships em
  join public.events e on e.id = em.event_id
  where e.organization_id = organization_uuid and em.user_id = secondary_user
  on conflict (event_id, user_id, role)
  do update set
    full_schedule_access = public.event_memberships.full_schedule_access or excluded.full_schedule_access,
    coaching_tools_enabled = public.event_memberships.coaching_tools_enabled or excluded.coaching_tools_enabled,
    ratings_history_scope = case
      when public.event_memberships.ratings_history_scope = 'all' or excluded.ratings_history_scope = 'all' then 'all'
      when public.event_memberships.ratings_history_scope = 'specific' or excluded.ratings_history_scope = 'specific' then 'specific'
      else 'none'
    end,
    ratings_event_ids = (
      select coalesce(array_agg(distinct value), '{}'::uuid[])
      from unnest(public.event_memberships.ratings_event_ids || excluded.ratings_event_ids) value
    ),
    assigned_game_ids = (
      select coalesce(array_agg(distinct value), '{}'::uuid[])
      from unnest(public.event_memberships.assigned_game_ids || excluded.assigned_game_ids) value
    );

  delete from public.event_memberships em
  using public.events e
  where em.event_id = e.id
    and e.organization_id = organization_uuid
    and em.user_id = secondary_user;
  delete from public.organization_memberships
  where organization_id = organization_uuid and user_id = secondary_user;

  -- Retain the source identity as an alias for subsequent Assignr imports.
  update public.officials
  set linked_user_id = primary_user,
      identity_status = 'merged',
      merged_into_official_id = primary_official_uuid,
      updated_at = now()
  where id = secondary_official_uuid;

  update public.officials
  set email = primary_email,
      linked_user_id = primary_user,
      identity_status = 'linked',
      pending_org_roles = (
        select coalesce(array_agg(distinct role), array['referee']::public.membership_role[])
        from public.organization_memberships
        where organization_id = organization_uuid
          and user_id = primary_user
          and status = 'active'
      ),
      updated_at = now()
  where id = primary_official_uuid;

  update public.profiles
  set merged_into_user_id = primary_user, merged_at = now(), updated_at = now()
  where id = secondary_user;

  insert into public.audit_log
    (organization_id, actor_id, action, entity_type, entity_id, details)
  values (
    organization_uuid, auth.uid(), 'accounts_merged', 'official',
    primary_official_uuid::text,
    jsonb_build_object(
      'primary_official_id', primary_official_uuid,
      'secondary_official_id', secondary_official_uuid,
      'primary_user_id', primary_user,
      'secondary_user_id', secondary_user,
      'primary_email', primary_email
    )
  );

  return jsonb_build_object(
    'primary_official_id', primary_official_uuid,
    'primary_user_id', primary_user,
    'primary_email', primary_email
  );
end;
$$;

grant execute on function public.merge_organization_accounts(uuid, uuid, uuid)
  to authenticated;

-- Enforce full-event versus selected-game access in the database.
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
      select 1
      from public.events e
      where e.id = event_uuid
        and public.has_org_role(
          e.organization_id,
          array['organization_admin']::public.membership_role[]
        )
    )
    or exists (
      select 1
      from public.event_memberships em
      where em.event_id = event_uuid
        and em.user_id = auth.uid()
        and (
          em.role = 'event_admin'
          or (
            em.role in ('assignor', 'site_coordinator', 'referee_coach')
            and (em.full_schedule_access or game_uuid = any(em.assigned_game_ids))
          )
        )
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
      select 1
      from public.events e
      where e.id = event_uuid
        and public.has_org_role(
          e.organization_id,
          array['organization_admin']::public.membership_role[]
        )
    )
    or exists (
      select 1
      from public.event_memberships em
      where em.event_id = event_uuid
        and em.user_id = auth.uid()
        and (
          em.role = 'event_admin'
          or (
            em.role = 'assignor'
            and (em.full_schedule_access or game_uuid = any(em.assigned_game_ids))
          )
        )
    )
$$;

grant execute on function public.can_view_game(uuid, uuid) to authenticated;
grant execute on function public.can_manage_game(uuid, uuid) to authenticated;

create or replace function public.can_manage_assignment(game_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.can_manage_game(g.id, g.event_id)
    from public.games g
    where g.id = game_uuid
  ), false)
$$;

grant execute on function public.can_manage_assignment(uuid) to authenticated;

drop policy if exists "scoped staff manage games" on public.games;
create policy "scoped staff manage games" on public.games for all
  using (public.can_manage_game(games.id, games.event_id))
  with check (public.can_manage_game(games.id, games.event_id));

drop policy if exists "scoped staff manage assignments" on public.assignments;
create policy "scoped staff manage assignments" on public.assignments for all
  using (public.can_manage_assignment(assignments.game_id))
  with check (public.can_manage_assignment(assignments.game_id));

drop policy if exists "scoped staff view checkins" on public.check_ins;
create policy "scoped staff view checkins" on public.check_ins for select
  using (
    public.has_event_role(
      event_id,
      array['event_admin','assignor','site_coordinator','referee_coach']::public.membership_role[]
    )
  );

drop policy if exists "scoped staff manage checkins" on public.check_ins;
create policy "scoped staff manage checkins" on public.check_ins for all
  using (
    public.has_event_role(
      event_id,
      array['event_admin','assignor','site_coordinator']::public.membership_role[]
    )
  )
  with check (
    public.has_event_role(
      event_id,
      array['event_admin','assignor','site_coordinator']::public.membership_role[]
    )
  );
