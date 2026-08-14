-- Law18Ref v0.21.0: prepare coaching assignments before a coach creates an account.

alter table public.coach_assignments
  add column if not exists coach_official_id uuid references public.officials(id) on delete cascade;

alter table public.coach_assignments alter column coach_id drop not null;

alter table public.coach_assignments
  drop constraint if exists coach_assignments_one_coach_identity;
alter table public.coach_assignments
  add constraint coach_assignments_one_coach_identity
  check (num_nonnulls(coach_id, coach_official_id) = 1);

create index if not exists coach_assignments_provisional_coach_idx
  on public.coach_assignments(coach_official_id)
  where coach_official_id is not null;

create or replace function public.validate_provisional_coach_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  event_org uuid;
  coach_org uuid;
  coach_linked_user uuid;
  coach_roles public.membership_role[];
begin
  if new.coach_official_id is null then return new; end if;

  select organization_id into event_org from public.events where id = new.event_id;
  select organization_id, linked_user_id,
    case when cardinality(pending_org_roles) > 0 then pending_org_roles
      else array[coalesce(pending_org_role, 'referee'::public.membership_role)] end
  into coach_org, coach_linked_user, coach_roles
  from public.officials where id = new.coach_official_id;

  if coach_org is null or event_org is null or coach_org <> event_org then
    raise exception 'The provisional referee coach must belong to the event group.';
  end if;
  if coach_linked_user is not null then
    raise exception 'Linked referee coaches must be assigned using their user account.';
  end if;
  if not ('referee_coach'::public.membership_role = any(coach_roles))
     and not exists (
       select 1 from public.provisional_event_access access
       where access.official_id = new.coach_official_id
         and access.event_id = new.event_id
         and 'referee_coach'::public.membership_role = any(access.roles)
     ) then
    raise exception 'Give this provisional official Referee Coach permission before assigning coaching work.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_provisional_coach_assignment on public.coach_assignments;
create trigger validate_provisional_coach_assignment
before insert or update of event_id, coach_id, coach_official_id
on public.coach_assignments
for each row execute function public.validate_provisional_coach_assignment();

create or replace function public.activate_provisional_coach_assignments()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.linked_user_id is not null
     and new.linked_user_id is distinct from old.linked_user_id then
    update public.coach_assignments
    set coach_id = new.linked_user_id, coach_official_id = null
    where coach_official_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists activate_provisional_coach_assignments on public.officials;
create trigger activate_provisional_coach_assignments
after update of linked_user_id on public.officials
for each row execute function public.activate_provisional_coach_assignments();

revoke execute on function public.validate_provisional_coach_assignment() from public, anon, authenticated;
revoke execute on function public.activate_provisional_coach_assignments() from public, anon, authenticated;
