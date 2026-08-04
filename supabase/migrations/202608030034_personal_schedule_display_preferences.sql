-- Law18Ref v0.11.0: personal calendar colors and rating-average display settings.

alter table public.profiles
  add column if not exists personal_schedule_colors jsonb not null default '{}'::jsonb,
  add column if not exists rating_average_preferences jsonb not null default '{"event_scope":"current_event","match_position":false,"from":"","through":""}'::jsonb;

