-- PostgREST cannot infer the partial check-in index for ON CONFLICT.
-- A regular unique constraint still permits legacy rows with null official_id
-- while allowing event/date/official check-ins to upsert reliably.
drop index if exists public.check_ins_event_date_official_unique;

alter table public.check_ins
  drop constraint if exists check_ins_event_date_official_key;

alter table public.check_ins
  add constraint check_ins_event_date_official_key
  unique (event_id, event_date, official_id);
