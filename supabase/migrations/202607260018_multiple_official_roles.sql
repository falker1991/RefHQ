-- Preserve every intended organization role for provisional officials and
-- activate each role when the official claims their account.
alter table public.officials
  add column if not exists pending_org_roles public.membership_role[]
  not null default array['referee']::public.membership_role[];

update public.officials
set pending_org_roles = array[coalesce(pending_org_role, 'referee'::public.membership_role)]
where pending_org_roles = array['referee']::public.membership_role[]
  and pending_org_role is distinct from 'referee'::public.membership_role;

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
  select auth.uid(), null,
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', split_part(verified_email, '@', 1)),
    verified_email, verified_email, 'referee'::public.app_role
  on conflict (id) do update
    set primary_email = excluded.primary_email, email = excluded.email;

  update public.officials
  set linked_user_id = auth.uid(), identity_status = 'linked', updated_at = now()
  where lower(trim(email)) = verified_email
    and (linked_user_id is null or linked_user_id = auth.uid());

  insert into public.organization_memberships (organization_id, user_id, role, status)
  select distinct o.organization_id, auth.uid(), intended.role, 'active'::public.membership_status
  from public.officials o
  cross join lateral unnest(
    case
      when cardinality(o.pending_org_roles) > 0 then o.pending_org_roles
      else array[coalesce(o.pending_org_role, 'referee'::public.membership_role)]
    end
  ) as intended(role)
  where o.linked_user_id = auth.uid()
    and intended.role <> 'site_owner'::public.membership_role
    and intended.role <> 'event_admin'::public.membership_role
  on conflict (organization_id, user_id, role)
  do update set status = 'active', updated_at = now();
end;
$$;

grant execute on function public.link_current_referee() to authenticated;

-- A site owner's linked official record is private to that owner unless the
-- owner also holds an organization or event role for the organization.
create or replace function public.official_visible_to_staff(
  official_user_id uuid,
  official_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    official_user_id is null
    or official_user_id = auth.uid()
    or not coalesce((select p.is_site_owner from public.profiles p where p.id = official_user_id), false)
    or exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = official_organization_id
        and om.user_id = official_user_id
        and om.status = 'active'
        and om.role <> 'site_owner'
    )
    or exists (
      select 1
      from public.event_memberships em
      join public.events e on e.id = em.event_id
      where e.organization_id = official_organization_id
        and em.user_id = official_user_id
        and em.role <> 'site_owner'
    )
$$;

grant execute on function public.official_visible_to_staff(uuid, uuid) to authenticated;

drop policy if exists "organization staff manage officials" on public.officials;
create policy "organization staff manage officials" on public.officials for all
  using (
    public.official_visible_to_staff(linked_user_id, organization_id)
    and (
      public.has_org_role(organization_id, array['organization_admin','assignor']::public.membership_role[])
      or exists (
        select 1 from public.event_memberships em
        join public.events e on e.id = em.event_id
        where e.organization_id = officials.organization_id
          and em.user_id = auth.uid() and em.role in ('event_admin','assignor')
      )
    )
  )
  with check (
    public.official_visible_to_staff(linked_user_id, organization_id)
    and (
      public.has_org_role(organization_id, array['organization_admin','assignor']::public.membership_role[])
      or exists (
        select 1 from public.event_memberships em
        join public.events e on e.id = em.event_id
        where e.organization_id = officials.organization_id
          and em.user_id = auth.uid() and em.role in ('event_admin','assignor')
      )
    )
  );
