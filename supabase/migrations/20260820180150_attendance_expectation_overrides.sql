-- Law18Ref v0.31.1: date-specific attendance expectation overrides.

create table public.attendance_expectation_overrides (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_date date not null,
  official_id uuid not null references public.officials(id) on delete cascade,
  expected boolean not null default false,
  reason text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_expectation_override_unique unique (event_id, event_date, official_id),
  constraint attendance_expectation_override_is_exclusion check (expected = false)
);

create index attendance_expectation_overrides_event_date_idx
  on public.attendance_expectation_overrides(event_id, event_date);

alter table public.attendance_expectation_overrides enable row level security;

create policy "scoped staff view attendance overrides"
  on public.attendance_expectation_overrides for select to authenticated
  using (public.can_view_scoped_check_in(event_id, official_id, event_date));

create policy "scoped staff create attendance overrides"
  on public.attendance_expectation_overrides for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_view_scoped_check_in(event_id, official_id, event_date)
  );

create policy "scoped staff update attendance overrides"
  on public.attendance_expectation_overrides for update to authenticated
  using (public.can_view_scoped_check_in(event_id, official_id, event_date))
  with check (
    created_by = (select auth.uid())
    and public.can_view_scoped_check_in(event_id, official_id, event_date)
  );

create policy "scoped staff delete attendance overrides"
  on public.attendance_expectation_overrides for delete to authenticated
  using (public.can_view_scoped_check_in(event_id, official_id, event_date));

grant select, insert, update, delete on public.attendance_expectation_overrides to authenticated;

drop trigger if exists audit_attendance_expectation_overrides_mutation on public.attendance_expectation_overrides;
create trigger audit_attendance_expectation_overrides_mutation
after insert or update or delete on public.attendance_expectation_overrides
for each row execute function public.audit_organization_mutation();
