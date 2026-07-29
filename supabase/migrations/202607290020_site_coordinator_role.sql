-- Phase 1 role hierarchy: site coordinators are event-scoped operational staff.
alter type public.membership_role add value if not exists 'site_coordinator' after 'assignor';
