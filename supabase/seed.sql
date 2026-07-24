-- Run after creating demo users in Supabase Auth.
insert into public.organizations (id, name, slug)
values ('11111111-1111-4111-8111-111111111111', 'Capital Area Referees', 'capital-area')
on conflict do nothing;

insert into public.events (id, organization_id, name, venue_name, starts_on, ends_on, check_in_slug)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Capital Cup 2026', 'Riverside Sports Complex', '2026-06-28', '2026-06-29', 'capital-cup-2026')
on conflict do nothing;

insert into public.games (event_id, external_id, starts_at, field_name, home_team, away_team, division)
values
('22222222-2222-4222-8222-222222222222','assignr-1001','2026-06-28 08:00:00-04','Field 1','River City FC','Capital United','U16 Boys • Premier'),
('22222222-2222-4222-8222-222222222222','assignr-1002','2026-06-28 08:30:00-04','Field 3','Northside SC','Lakeview FC','U14 Girls • Gold'),
('22222222-2222-4222-8222-222222222222','assignr-1003','2026-06-28 09:00:00-04','Field 2','Metro Stars','Union Athletic','U18 Boys • Showcase')
on conflict do nothing;
