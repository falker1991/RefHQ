-- Law18Ref v0.10.1: allow the server-only Worker connection to manage calendar feeds.

grant select, insert, update, delete on table public.personal_calendar_feeds to service_role;
grant select, insert, update, delete on table public.external_calendar_assignments to service_role;

