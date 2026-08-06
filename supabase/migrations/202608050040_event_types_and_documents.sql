-- Law18Ref v0.14.0: typed events, league-linked tournaments, and private event documents.

alter table public.events
  add column if not exists event_type text not null default 'tournament'
    check (event_type in ('tournament', 'league')),
  add column if not exists parent_league_id uuid references public.events(id) on delete set null,
  add column if not exists check_in_enabled boolean not null default true;

alter table public.events
  drop constraint if exists events_parent_league_type_check;
alter table public.events
  add constraint events_parent_league_type_check
  check (parent_league_id is null or event_type = 'tournament');

create index if not exists events_parent_league_id_idx on public.events(parent_league_id);

create table if not exists public.event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  document_type text not null default 'other' check (document_type in ('rules_of_competition', 'other')),
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 26214400),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists one_rules_document_per_event
  on public.event_documents(event_id)
  where document_type = 'rules_of_competition';
create index if not exists event_documents_event_idx on public.event_documents(event_id, created_at desc);

alter table public.event_documents enable row level security;

create or replace function public.can_access_event_document(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events event
    where event.id = target_event and (
      public.is_site_owner()
      or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
      or public.has_event_role(event.id, array['event_admin','assignor','site_coordinator','referee_coach','referee']::public.membership_role[])
      or exists (
        select 1 from public.games game
        join public.assignments assignment on assignment.game_id = game.id
        join public.officials official on official.id = assignment.official_id
        where game.event_id = event.id and official.linked_user_id = auth.uid()
      )
      or exists (select 1 from public.coach_assignments coach where coach.event_id = event.id and coach.coach_id = auth.uid())
    )
  );
$$;

create or replace function public.can_manage_event_document(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events event
    where event.id = target_event and (
      public.is_site_owner()
      or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
      or public.has_event_role(event.id, array['event_admin','assignor']::public.membership_role[])
    )
  );
$$;

drop policy if exists "event participants view documents" on public.event_documents;
create policy "event participants view documents" on public.event_documents for select to authenticated
using (public.can_access_event_document(event_id));
drop policy if exists "event staff add documents" on public.event_documents;
create policy "event staff add documents" on public.event_documents for insert to authenticated
with check (created_by = auth.uid() and public.can_manage_event_document(event_id));
drop policy if exists "event staff update documents" on public.event_documents;
create policy "event staff update documents" on public.event_documents for update to authenticated
using (public.can_manage_event_document(event_id)) with check (public.can_manage_event_document(event_id));
drop policy if exists "event staff delete documents" on public.event_documents;
create policy "event staff delete documents" on public.event_documents for delete to authenticated
using (public.can_manage_event_document(event_id));

grant select, insert, update, delete on public.event_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-documents', 'event-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event participants read document objects" on storage.objects;
create policy "event participants read document objects" on storage.objects for select to authenticated
using (bucket_id = 'event-documents' and public.can_access_event_document((storage.foldername(name))[1]::uuid));
drop policy if exists "event staff upload document objects" on storage.objects;
create policy "event staff upload document objects" on storage.objects for insert to authenticated
with check (bucket_id = 'event-documents' and public.can_manage_event_document((storage.foldername(name))[1]::uuid));
drop policy if exists "event staff replace document objects" on storage.objects;
create policy "event staff replace document objects" on storage.objects for update to authenticated
using (bucket_id = 'event-documents' and public.can_manage_event_document((storage.foldername(name))[1]::uuid));
drop policy if exists "event staff delete document objects" on storage.objects;
create policy "event staff delete document objects" on storage.objects for delete to authenticated
using (bucket_id = 'event-documents' and public.can_manage_event_document((storage.foldername(name))[1]::uuid));

grant execute on function public.can_access_event_document(uuid) to authenticated;
grant execute on function public.can_manage_event_document(uuid) to authenticated;
