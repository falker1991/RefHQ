-- Organization aliases apply by default; event aliases override them.
alter table public.organizations
  add column if not exists position_title_aliases jsonb not null default '{}'::jsonb;

alter table public.events
  add column if not exists position_title_aliases jsonb not null default '{}'::jsonb;

alter table public.assignments
  add column if not exists source_position_title text;

update public.assignments
set source_position_title = position_title
where source_position_title is null;
