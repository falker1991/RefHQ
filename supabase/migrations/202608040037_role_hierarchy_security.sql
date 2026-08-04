-- Law18Ref v0.12.0: close profile self-escalation and enforce the role hierarchy in PostgreSQL.

-- A user may edit personal profile fields, but only the existing site owner may
-- change security-bearing profile columns. The OLD value is checked so a user
-- cannot make themselves owner in the same request that attempts the bypass.
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.is_site_owner is distinct from old.is_site_owner then
    raise exception 'The site-owner designation cannot be changed through an authenticated profile request.';
  end if;
  if auth.uid() is not null
     and not coalesce((select p.is_site_owner from public.profiles p where p.id = auth.uid()), false)
     and (new.role is distinct from old.role or new.organization_id is distinct from old.organization_id) then
    raise exception 'Security-bearing profile fields may only be changed by the site owner.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_security_fields on public.profiles;
create trigger protect_profile_security_fields
before update on public.profiles
for each row execute function public.protect_profile_security_fields();

-- Imported/provisional roles are also security-bearing because account linking
-- later materializes them as memberships. Enforce the same hierarchy here.
create or replace function public.protect_official_pending_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.membership_role[] := coalesce(new.pending_org_roles, array['referee']::public.membership_role[]);
begin
  if tg_op = 'UPDATE' and requested is not distinct from old.pending_org_roles then
    return new;
  end if;
  if public.is_site_owner() then
    if not requested <@ array['organization_director','organization_admin','assignor','referee_coach','referee']::public.membership_role[] then
      raise exception 'Unsupported organization role.';
    end if;
  elsif public.has_org_role(new.organization_id, array['organization_director']::public.membership_role[]) then
    if not requested <@ array['organization_admin','assignor','referee_coach','referee']::public.membership_role[] then
      raise exception 'Organization Directors may assign Organization Admin and lower roles.';
    end if;
  elsif public.has_org_role(new.organization_id, array['organization_admin']::public.membership_role[]) then
    if not requested <@ array['assignor','referee_coach','referee']::public.membership_role[] then
      raise exception 'Organization Admins may assign roles beneath Organization Admin.';
    end if;
  elsif requested <> array['referee']::public.membership_role[] then
    raise exception 'This account may create referee-only official records.';
  end if;
  new.pending_org_role := requested[1];
  return new;
end;
$$;

drop trigger if exists protect_official_pending_roles on public.officials;
create trigger protect_official_pending_roles
before insert or update of pending_org_roles on public.officials
for each row execute function public.protect_official_pending_roles();

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile and owner manages profiles"
  on public.profiles for update
  using (id = auth.uid() or public.is_site_owner())
  with check (id = auth.uid() or public.is_site_owner());

-- Remove the original MVP policies that trusted the user-editable legacy role
-- and organization_id columns. Scoped membership policies remain in force.
drop policy if exists "staff manage events" on public.events;
drop policy if exists "members view games" on public.games;
drop policy if exists "staff manage games" on public.games;
drop policy if exists "members view relevant assignments" on public.assignments;
drop policy if exists "staff manage assignments" on public.assignments;
drop policy if exists "coaches view coaching scope" on public.coach_assignments;
drop policy if exists "staff manage coaching" on public.coach_assignments;
drop policy if exists "members view relevant checkins" on public.check_ins;
drop policy if exists "referees check themselves in" on public.check_ins;
drop policy if exists "staff manage checkins" on public.check_ins;
drop policy if exists "assessment participants view" on public.assessments;
drop policy if exists "coaches create assessments" on public.assessments;
drop policy if exists "coaches update own drafts" on public.assessments;
drop policy if exists "staff manage assessments" on public.assessments;
drop policy if exists "staff manage imports" on public.import_jobs;

revoke execute on function public.current_org_id() from authenticated;
revoke execute on function public.current_role() from authenticated;

-- Directors inherit every policy that currently permits an organization admin.
create or replace function public.has_org_role(org_id uuid, allowed public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_site_owner() or exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = org_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and (
        membership.role = any(allowed)
        or (
          membership.role = 'organization_director'
          and 'organization_admin'::public.membership_role = any(allowed)
        )
      )
  )
$$;

-- Everyone entering through a general organization join link starts as a referee.
update public.organization_join_links set default_role = 'referee'
where default_role <> 'referee';
alter table public.organization_join_links
  drop constraint if exists organization_join_links_referee_only;
alter table public.organization_join_links
  add constraint organization_join_links_referee_only check (default_role = 'referee');

-- Organization roles:
-- owner -> director -> administrator -> assignor/coach/referee.
drop policy if exists "organization admins insert memberships" on public.organization_memberships;
drop policy if exists "organization admins update permitted memberships" on public.organization_memberships;
drop policy if exists "organization admins delete permitted memberships" on public.organization_memberships;

create policy "cleared leaders insert organization memberships"
on public.organization_memberships for insert
with check (
  (public.is_site_owner() and role in ('organization_director','organization_admin','assignor','referee_coach','referee'))
  or (
    public.has_org_role(organization_id, array['organization_director']::public.membership_role[])
    and role in ('organization_admin','assignor','referee_coach','referee')
  )
  or (
    public.has_org_role(organization_id, array['organization_admin']::public.membership_role[])
    and role in ('assignor','referee_coach','referee')
  )
);

create policy "cleared leaders update organization memberships"
on public.organization_memberships for update
using (
  public.is_site_owner()
  or (
    public.has_org_role(organization_id, array['organization_director']::public.membership_role[])
    and role not in ('site_owner','organization_director')
  )
  or (
    public.has_org_role(organization_id, array['organization_admin']::public.membership_role[])
    and role in ('assignor','referee_coach','referee')
  )
)
with check (
  (public.is_site_owner() and role in ('organization_director','organization_admin','assignor','referee_coach','referee'))
  or (
    public.has_org_role(organization_id, array['organization_director']::public.membership_role[])
    and role in ('organization_admin','assignor','referee_coach','referee')
  )
  or (
    public.has_org_role(organization_id, array['organization_admin']::public.membership_role[])
    and role in ('assignor','referee_coach','referee')
  )
);

create policy "cleared leaders delete organization memberships"
on public.organization_memberships for delete
using (
  public.is_site_owner()
  or (
    public.has_org_role(organization_id, array['organization_director']::public.membership_role[])
    and role not in ('site_owner','organization_director')
  )
  or (
    public.has_org_role(organization_id, array['organization_admin']::public.membership_role[])
    and role in ('assignor','referee_coach','referee')
  )
);

-- Event roles:
-- organization leaders may appoint event admins and below; event admins may
-- appoint lower event roles; assignors may appoint coaches and site supervisors.
drop policy if exists "event admins insert memberships" on public.event_memberships;
drop policy if exists "event admins update permitted memberships" on public.event_memberships;
drop policy if exists "event admins delete permitted memberships" on public.event_memberships;

create policy "cleared staff insert event memberships"
on public.event_memberships for insert
with check (
  (role in ('event_admin','assignor','site_coordinator','referee_coach','referee') and exists (
    select 1 from public.events e where e.id = event_id and (
      public.is_site_owner()
      or public.has_org_role(e.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    )
  ))
  or (
    public.has_event_role(event_id, array['event_admin']::public.membership_role[])
    and role in ('assignor','site_coordinator','referee_coach','referee')
  )
  or (
    public.has_event_role(event_id, array['assignor']::public.membership_role[])
    and role in ('site_coordinator','referee_coach')
  )
);

create policy "cleared staff update event memberships"
on public.event_memberships for update
using (
  exists (
    select 1 from public.events e where e.id = event_id and (
      public.is_site_owner()
      or public.has_org_role(e.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    )
  )
  or (
    public.has_event_role(event_id, array['event_admin']::public.membership_role[])
    and role in ('assignor','site_coordinator','referee_coach','referee')
  )
  or (
    public.has_event_role(event_id, array['assignor']::public.membership_role[])
    and role in ('site_coordinator','referee_coach')
  )
)
with check (
  (role in ('event_admin','assignor','site_coordinator','referee_coach','referee') and exists (
    select 1 from public.events e where e.id = event_id and (
      public.is_site_owner()
      or public.has_org_role(e.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    )
  ))
  or (
    public.has_event_role(event_id, array['event_admin']::public.membership_role[])
    and role in ('assignor','site_coordinator','referee_coach','referee')
  )
  or (
    public.has_event_role(event_id, array['assignor']::public.membership_role[])
    and role in ('site_coordinator','referee_coach')
  )
);

create policy "cleared staff delete event memberships"
on public.event_memberships for delete
using (
  exists (
    select 1 from public.events e where e.id = event_id and (
      public.is_site_owner()
      or public.has_org_role(e.organization_id, array['organization_director','organization_admin']::public.membership_role[])
    )
  )
  or (
    public.has_event_role(event_id, array['event_admin']::public.membership_role[])
    and role in ('assignor','site_coordinator','referee_coach','referee')
  )
  or (
    public.has_event_role(event_id, array['assignor']::public.membership_role[])
    and role in ('site_coordinator','referee_coach')
  )
);

-- Security-definer member removal must repeat the hierarchy checks because it
-- intentionally operates beyond the caller's ordinary row policies.
create or replace function public.remove_organization_member(
  target_organization uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_owner boolean := public.is_site_owner();
  actor_is_director boolean := public.has_org_role(target_organization, array['organization_director']::public.membership_role[]);
  actor_is_admin boolean := public.has_org_role(target_organization, array['organization_admin']::public.membership_role[]);
  target_is_director boolean;
  target_is_admin boolean;
begin
  if not (actor_is_owner or actor_is_director or actor_is_admin) then
    raise exception 'Only cleared organization leadership can remove a member.';
  end if;
  if coalesce((select is_site_owner from public.profiles where id = target_user), false) then
    raise exception 'The site owner cannot be removed.';
  end if;
  select exists (
    select 1 from public.organization_memberships where organization_id = target_organization
      and user_id = target_user and role = 'organization_director' and status = 'active'
  ) into target_is_director;
  select exists (
    select 1 from public.organization_memberships where organization_id = target_organization
      and user_id = target_user and role = 'organization_admin' and status = 'active'
  ) into target_is_admin;
  if target_is_director and not actor_is_owner then
    raise exception 'Only the site owner can remove an Organization Director.';
  end if;
  if target_is_admin and not (actor_is_owner or actor_is_director) then
    raise exception 'Only the site owner or Organization Director can remove an Organization Admin.';
  end if;

  update public.organization_memberships set status = 'archived'
  where organization_id = target_organization and user_id = target_user;
  delete from public.event_memberships em using public.events e
  where em.event_id = e.id and e.organization_id = target_organization and em.user_id = target_user;
  update public.officials set identity_status = 'removed', updated_at = now()
  where organization_id = target_organization and linked_user_id = target_user;
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (target_organization, auth.uid(), 'membership.removed', 'organization_membership', target_user::text);
end;
$$;

-- The original merge routine predates protected leadership. Route browser calls
-- through a hierarchy-aware wrapper and remove direct execution permission.
create or replace function public.secure_merge_organization_accounts(
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
  primary_user uuid;
  secondary_user uuid;
  contains_director boolean;
  contains_admin boolean;
begin
  if not (
    public.is_site_owner()
    or public.has_org_role(organization_uuid, array['organization_director','organization_admin']::public.membership_role[])
  ) then
    raise exception 'Only cleared organization leadership can merge accounts.';
  end if;
  select linked_user_id into primary_user from public.officials
  where id = primary_official_uuid and organization_id = organization_uuid;
  select linked_user_id into secondary_user from public.officials
  where id = secondary_official_uuid and organization_id = organization_uuid;
  select exists (
    select 1 from public.organization_memberships where organization_id = organization_uuid
      and user_id in (primary_user, secondary_user) and role = 'organization_director' and status = 'active'
  ) into contains_director;
  select exists (
    select 1 from public.organization_memberships where organization_id = organization_uuid
      and user_id in (primary_user, secondary_user) and role = 'organization_admin' and status = 'active'
  ) into contains_admin;
  if contains_director and not public.is_site_owner() then
    raise exception 'Only the site owner can merge an Organization Director account.';
  end if;
  if contains_admin and not (
    public.is_site_owner()
    or public.has_org_role(organization_uuid, array['organization_director']::public.membership_role[])
  ) then
    raise exception 'Only the site owner or Organization Director can merge an Organization Admin account.';
  end if;
  return public.merge_organization_accounts(organization_uuid, primary_official_uuid, secondary_official_uuid);
end;
$$;

revoke execute on function public.merge_organization_accounts(uuid, uuid, uuid) from authenticated;
grant execute on function public.secure_merge_organization_accounts(uuid, uuid, uuid) to authenticated;
