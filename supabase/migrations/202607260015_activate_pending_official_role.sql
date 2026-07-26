-- Activate the administrator-selected organization role when a provisional
-- official creates and verifies their account.
create or replace function public.link_current_referee()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if verified_email = '' then return; end if;

  insert into public.profiles (id, organization_id, full_name, email, primary_email, role)
  select auth.uid(), null,
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', split_part(verified_email, '@', 1)),
    verified_email, verified_email, 'referee'::public.app_role
  on conflict (id) do update
    set primary_email = excluded.primary_email, email = excluded.email;

  update public.officials
  set linked_user_id = auth.uid(), identity_status = 'linked', updated_at = now()
  where lower(trim(email)) = verified_email
    and (linked_user_id is null or linked_user_id = auth.uid());

  insert into public.organization_memberships (organization_id, user_id, role, status)
  select distinct organization_id, auth.uid(),
    coalesce(pending_org_role, 'referee'::public.membership_role),
    'active'::public.membership_status
  from public.officials
  where linked_user_id = auth.uid()
  on conflict (organization_id, user_id, role)
  do update set status = 'active', updated_at = now();
end;
$$;

grant execute on function public.link_current_referee() to authenticated;
