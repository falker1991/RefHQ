-- Law18Ref v0.21.4: activate provisional coaching work only after the user's
-- public profile exists. Account linking can occur before profile creation.

create or replace function public.activate_provisional_coach_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.linked_user_id is not null
     and new.linked_user_id is distinct from old.linked_user_id
     and exists (
       select 1 from public.profiles where id = new.linked_user_id
     ) then
    update public.coach_assignments
    set coach_id = new.linked_user_id,
        coach_official_id = null
    where coach_official_id = new.id;
  end if;

  return new;
end;
$$;

create or replace function public.activate_profile_provisional_coach_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_assignments assignment
  set coach_id = new.id,
      coach_official_id = null
  from public.officials official
  where official.linked_user_id = new.id
    and assignment.coach_official_id = official.id;

  return new;
end;
$$;

drop trigger if exists activate_profile_provisional_coach_assignments on public.profiles;
create trigger activate_profile_provisional_coach_assignments
after insert on public.profiles
for each row execute function public.activate_profile_provisional_coach_assignments();

revoke execute on function public.activate_provisional_coach_assignments() from public, anon, authenticated;
revoke execute on function public.activate_profile_provisional_coach_assignments() from public, anon, authenticated;
