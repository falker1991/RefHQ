-- Law18Ref v0.12.3: user-controlled personal contact protection.

alter table public.profiles
  add column if not exists personal_contact_locked boolean not null default false;

alter table public.officials
  add column if not exists personal_contact_locked boolean not null default false;

update public.officials official
set personal_contact_locked = profile.personal_contact_locked
from public.profiles profile
where official.linked_user_id = profile.id;

-- Keep every organization copy aligned with the account owner's canonical
-- contact information and current lock choice.
create or replace function public.sync_personal_contact_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.officials
  set full_name = new.full_name,
      email = coalesce(new.primary_email, new.email),
      secondary_email = new.secondary_email,
      date_of_birth = new.date_of_birth,
      phone = new.phone,
      personal_contact_locked = new.personal_contact_locked,
      updated_at = now()
  where linked_user_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_personal_contact_lock on public.profiles;
create trigger sync_personal_contact_lock
after update of full_name, email, primary_email, secondary_email, date_of_birth, phone, personal_contact_locked on public.profiles
for each row execute function public.sync_personal_contact_lock();

-- Even a direct REST request cannot change a locked linked official's contact
-- fields. Organization and event membership tables are intentionally separate.
create or replace function public.protect_locked_official_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.linked_user_id is not null
     and auth.uid() is distinct from old.linked_user_id
     and new.personal_contact_locked is distinct from old.personal_contact_locked then
    raise exception 'Only the account owner can change the personal contact lock.';
  end if;
  if old.linked_user_id is not null
     and old.personal_contact_locked
     and auth.uid() is distinct from old.linked_user_id
     and (
       new.full_name is distinct from old.full_name
       or new.email is distinct from old.email
       or new.secondary_email is distinct from old.secondary_email
       or new.date_of_birth is distinct from old.date_of_birth
       or new.phone is distinct from old.phone
     ) then
    raise exception 'This user has locked their personal contact information.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_locked_official_contact on public.officials;
create trigger protect_locked_official_contact
before update on public.officials
for each row execute function public.protect_locked_official_contact();

-- Protect the canonical profile as well. The account owner may always update
-- their own information or unlock it; no other authenticated user may change
-- locked contact fields.
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
  if auth.uid() is not null
     and auth.uid() is distinct from old.id
     and new.personal_contact_locked is distinct from old.personal_contact_locked then
    raise exception 'Only the account owner can change the personal contact lock.';
  end if;
  if auth.uid() is not null
     and auth.uid() is distinct from old.id
     and old.personal_contact_locked
     and (
       new.full_name is distinct from old.full_name
       or new.email is distinct from old.email
       or new.primary_email is distinct from old.primary_email
       or new.secondary_email is distinct from old.secondary_email
       or new.date_of_birth is distinct from old.date_of_birth
       or new.phone is distinct from old.phone
       or new.preferred_name is distinct from old.preferred_name
     ) then
    raise exception 'This user has locked their personal contact information.';
  end if;
  return new;
end;
$$;
