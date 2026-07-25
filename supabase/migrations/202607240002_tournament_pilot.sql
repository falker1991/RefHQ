-- RefHQ small-tournament pilot
-- Adds importable officials, account linking, and official-based check-in.

create table if not exists public.officials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  linked_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

alter table public.assignments alter column referee_id drop not null;
alter table public.assignments add column if not exists official_id uuid references public.officials(id) on delete cascade;
alter table public.check_ins alter column referee_id drop not null;
alter table public.check_ins add column if not exists official_id uuid references public.officials(id) on delete cascade;

create unique index if not exists assignments_game_official_position_idx
  on public.assignments(game_id, official_id, position)
  where official_id is not null;
create unique index if not exists check_ins_event_official_idx
  on public.check_ins(event_id, official_id)
  where official_id is not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_game_official_position_key') then
    alter table public.assignments
      add constraint assignments_game_official_position_key unique (game_id, official_id, position);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'check_ins_event_official_key') then
    alter table public.check_ins
      add constraint check_ins_event_official_key unique (event_id, official_id);
  end if;
end $$;
create index if not exists officials_linked_user_idx on public.officials(linked_user_id);
create index if not exists officials_email_idx on public.officials(lower(email));

alter table public.officials enable row level security;

create policy "staff manage imported officials"
  on public.officials for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'assignor')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'assignor')
  );

create policy "referees view own imported official"
  on public.officials for select
  using (
    linked_user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "members view relevant assignments" on public.assignments;
drop policy if exists "staff manage assignments" on public.assignments;
create policy "members view relevant assignments"
  on public.assignments for select
  using (
    referee_id = auth.uid()
    or official_id in (
      select id from public.officials
      where linked_user_id = auth.uid()
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or public.current_role() in ('admin', 'assignor', 'coach')
  );
create policy "staff manage assignments"
  on public.assignments for all
  using (public.current_role() in ('admin', 'assignor'))
  with check (public.current_role() in ('admin', 'assignor'));

drop policy if exists "members view relevant checkins" on public.check_ins;
drop policy if exists "referees check themselves in" on public.check_ins;
drop policy if exists "staff manage checkins" on public.check_ins;
create policy "members view relevant checkins"
  on public.check_ins for select
  using (
    referee_id = auth.uid()
    or official_id in (
      select id from public.officials
      where linked_user_id = auth.uid()
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or public.current_role() in ('admin', 'assignor', 'coach')
  );
create policy "referees check themselves in"
  on public.check_ins for insert
  with check (
    referee_id = auth.uid()
    or official_id in (
      select id from public.officials
      where linked_user_id = auth.uid()
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
create policy "referees update own checkin"
  on public.check_ins for update
  using (
    official_id in (
      select id from public.officials
      where linked_user_id = auth.uid()
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    official_id in (
      select id from public.officials
      where linked_user_id = auth.uid()
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
create policy "staff manage checkins"
  on public.check_ins for all
  using (public.current_role() in ('admin', 'assignor'))
  with check (public.current_role() in ('admin', 'assignor'));

create or replace function public.link_imported_referee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_official public.officials%rowtype;
begin
  select * into matched_official
  from public.officials
  where lower(email) = lower(new.email)
  order by created_at
  limit 1;

  if matched_official.id is not null then
    update public.officials
      set linked_user_id = new.id
      where lower(email) = lower(new.email)
        and organization_id = matched_official.organization_id;

    insert into public.profiles (id, organization_id, full_name, email, role)
    values (
      new.id,
      matched_official.organization_id,
      coalesce(new.raw_user_meta_data ->> 'full_name', matched_official.full_name),
      new.email,
      'referee'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_link_refhq on auth.users;
create trigger on_auth_user_link_refhq
  after insert or update of email on auth.users
  for each row execute procedure public.link_imported_referee();

-- Link any already-created account whose email now appears in an import.
create or replace function public.link_current_referee()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.officials
  set linked_user_id = auth.uid()
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and linked_user_id is null;

  insert into public.profiles (id, organization_id, full_name, email, role)
  select auth.uid(), organization_id, full_name, email, 'referee'::public.app_role
  from public.officials
  where linked_user_id = auth.uid()
  order by created_at
  limit 1
  on conflict (id) do nothing;
end;
$$;
grant execute on function public.link_current_referee() to authenticated;
