-- Law18Ref v0.2.3 — reusable site appearance themes

create table if not exists public.site_appearance_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  primary_color text not null,
  accent_color text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 2 and 80)
);

alter table public.site_appearance_themes enable row level security;

create policy "owner views appearance themes"
  on public.site_appearance_themes for select
  using (public.is_site_owner());

create policy "owner manages appearance themes"
  on public.site_appearance_themes for all
  using (public.is_site_owner())
  with check (public.is_site_owner());

grant select, insert, update, delete on public.site_appearance_themes to authenticated;
