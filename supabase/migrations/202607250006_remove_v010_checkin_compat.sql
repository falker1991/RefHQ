-- Run after the v0.2.0 frontend is deployed.
-- Removes the temporary event-level uniqueness rule used to keep v0.1.0
-- check-in requests compatible during the deployment window.
drop index if exists public.check_ins_v010_compat_event_official_unique;
