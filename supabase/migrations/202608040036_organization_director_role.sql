-- Law18Ref v0.12.0: senior organization leadership role.
-- Kept separate because PostgreSQL requires a committed enum value before policies use it.

alter type public.membership_role
  add value if not exists 'organization_director' after 'site_owner';
