-- Law18Ref v0.11.2: selectable calendar color presentation modes.

alter table public.profiles
  add column if not exists personal_schedule_color_modes jsonb not null default '{}'::jsonb;
