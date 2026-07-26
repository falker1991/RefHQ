-- Allow imports through the scoped membership model introduced in v0.2.0.
-- The legacy policy only recognized profiles.organization_id/current_role(),
-- which rejects site owners and users operating through organization/event
-- memberships.

drop policy if exists "staff manage imports" on public.import_jobs;
drop policy if exists "scoped staff view imports" on public.import_jobs;
drop policy if exists "scoped staff create imports" on public.import_jobs;
drop policy if exists "scoped staff update own imports" on public.import_jobs;
drop policy if exists "scoped staff delete own imports" on public.import_jobs;

create or replace function public.can_manage_import(
  org_id uuid,
  event_uuid uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_org_role(
      org_id,
      array['organization_admin','assignor']::public.membership_role[]
    )
    or (
      event_uuid is not null
      and exists (
        select 1
        from public.events
        where events.id = event_uuid
          and events.organization_id = org_id
      )
      and public.has_event_role(
        event_uuid,
        array['event_admin','assignor']::public.membership_role[]
      )
    )
$$;

grant execute on function public.can_manage_import(uuid, uuid) to authenticated;

create policy "scoped staff view imports"
  on public.import_jobs
  for select
  to authenticated
  using (public.can_manage_import(organization_id, event_id));

create policy "scoped staff create imports"
  on public.import_jobs
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_manage_import(organization_id, event_id)
  );

create policy "scoped staff update own imports"
  on public.import_jobs
  for update
  to authenticated
  using (
    uploaded_by = auth.uid()
    and public.can_manage_import(organization_id, event_id)
  )
  with check (
    uploaded_by = auth.uid()
    and public.can_manage_import(organization_id, event_id)
  );

create policy "scoped staff delete own imports"
  on public.import_jobs
  for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    and public.can_manage_import(organization_id, event_id)
  );
