-- Replace the legacy profile-deleting endpoint with scoped self-service departure.
create or replace function public.leave_current_organization()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Reload Law18Ref and use Membership Options to confirm your password before leaving a group.';
end;
$$;
revoke all on function public.leave_current_organization() from public, anon, authenticated;

create or replace function public.leave_group_membership(target_organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in before leaving a group.'; end if;
  -- Check the password authentication timestamp, not JWT iat (token refresh
  -- must not count as password reauthentication).
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) m
    where m->>'method' = 'password'
      and (m->>'timestamp')::numeric between extract(epoch from now() - interval '2 minutes') and extract(epoch from now() + interval '30 seconds')
  ) then raise exception 'Confirm your password again before leaving this group.'; end if;
  if public.is_site_owner() then raise exception 'The site owner cannot leave a group through member self-service.'; end if;
  -- Serialize departures to prevent two administrators leaving simultaneously.
  perform 1 from public.organizations where id = target_organization for update;
  if not exists (select 1 from public.organization_memberships where organization_id=target_organization and user_id=actor and status='active') then
    raise exception 'No active membership was found in this group.';
  end if;
  if exists (select 1 from public.organization_memberships where organization_id=target_organization and user_id=actor and status='active' and role in ('organization_director','organization_admin'))
     and not exists (select 1 from public.organization_memberships where organization_id=target_organization and user_id<>actor and status='active' and role in ('organization_director','organization_admin')) then
    raise exception 'The last group administrator must arrange group deactivation or another administrator before leaving.';
  end if;
  update public.organization_memberships set status='archived', updated_at=now()
    where organization_id=target_organization and user_id=actor;
  delete from public.event_memberships em using public.events e
    where em.event_id=e.id and e.organization_id=target_organization and em.user_id=actor;
  update public.officials set identity_status='removed', updated_at=now()
    where organization_id=target_organization and linked_user_id=actor;
  insert into public.audit_log(organization_id,actor_id,action,entity_type,entity_id)
    values(target_organization,actor,'membership.left','organization_membership',actor::text);
end;
$$;
revoke all on function public.leave_group_membership(uuid) from public, anon;
grant execute on function public.leave_group_membership(uuid) to authenticated;
