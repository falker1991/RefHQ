alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.officials
  add column if not exists first_name text,
  add column if not exists last_name text;

create or replace function public.name_first_part(name_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(name_value, '')) = '' then ''
    when btrim(name_value) !~ '\s' then btrim(name_value)
    when lower(regexp_replace(btrim(name_value), '^.*\s+', '')) in ('jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v')
      then btrim(regexp_replace(btrim(name_value), '\s+\S+\s+\S+$', ''))
    else btrim(regexp_replace(btrim(name_value), '\s+\S+$', ''))
  end
$$;

create or replace function public.name_last_part(name_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(name_value, '')) = '' or btrim(name_value) !~ '\s' then ''
    when lower(regexp_replace(btrim(name_value), '^.*\s+', '')) in ('jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v')
      then btrim(substring(btrim(name_value) from '(\S+\s+\S+)$'))
    else btrim(regexp_replace(btrim(name_value), '^.*\s+', ''))
  end
$$;

update public.profiles
set first_name = public.name_first_part(full_name),
    last_name = public.name_last_part(full_name)
where first_name is null or last_name is null;

update public.officials
set first_name = public.name_first_part(full_name),
    last_name = public.name_last_part(full_name)
where first_name is null or last_name is null;

create or replace function public.sync_person_name_parts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if nullif(btrim(new.first_name), '') is not null or nullif(btrim(new.last_name), '') is not null then
      new.first_name := btrim(coalesce(new.first_name, ''));
      new.last_name := btrim(coalesce(new.last_name, ''));
      new.full_name := btrim(concat_ws(' ', nullif(new.first_name, ''), nullif(new.last_name, '')));
    else
      new.first_name := public.name_first_part(new.full_name);
      new.last_name := public.name_last_part(new.full_name);
    end if;
  elsif new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    new.first_name := btrim(coalesce(new.first_name, ''));
    new.last_name := btrim(coalesce(new.last_name, ''));
    new.full_name := btrim(concat_ws(' ', nullif(new.first_name, ''), nullif(new.last_name, '')));
  elsif new.full_name is distinct from old.full_name then
    new.first_name := public.name_first_part(new.full_name);
    new.last_name := public.name_last_part(new.full_name);
  end if;
  return new;
end
$$;

drop trigger if exists profiles_sync_person_name_parts on public.profiles;
create trigger profiles_sync_person_name_parts
before insert or update of first_name, last_name, full_name on public.profiles
for each row execute function public.sync_person_name_parts();

drop trigger if exists officials_sync_person_name_parts on public.officials;
create trigger officials_sync_person_name_parts
before insert or update of first_name, last_name, full_name on public.officials
for each row execute function public.sync_person_name_parts();

create index if not exists officials_group_last_first_name_idx
  on public.officials (organization_id, lower(last_name), lower(first_name));
