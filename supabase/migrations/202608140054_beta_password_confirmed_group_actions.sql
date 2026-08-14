-- Law18Ref v0.21.5: beta authentication uses in-app password confirmation
-- without an email/OTP round trip for Site Owner group lifecycle actions.

create or replace function public.complete_organization_action(challenge_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge public.organization_action_challenges;
  target public.organizations;
  result_message text;
begin
  if not public.is_site_owner() then
    raise exception 'Only the site owner can manage groups.';
  end if;
  if not public.jwt_has_recent_method('password', interval '5 minutes') then
    raise exception 'Please confirm your password again.';
  end if;

  select * into challenge
  from public.organization_action_challenges
  where id = challenge_id and user_id = auth.uid()
  for update;
  if not found or challenge.completed_at is not null or challenge.expires_at < now() then
    raise exception 'This confirmation is invalid. Please try again.';
  end if;

  select * into target from public.organizations
  where id = challenge.organization_id;
  if not found then raise exception 'Group not found.'; end if;

  if challenge.requested_action = 'deactivate' then
    update public.organizations
    set active = false, deactivated_at = now(), deactivated_by = auth.uid()
    where id = target.id;
    update public.organization_action_challenges
    set completed_at = now() where id = challenge.id;
    insert into public.audit_log
      (organization_id, actor_id, action, entity_type, entity_id, details)
    values
      (target.id, auth.uid(), 'organization.deactivated', 'organization',
       target.id::text, jsonb_build_object('name', target.name));
    result_message := target.name || ' was deactivated.';
  else
    if target.active or target.deactivated_at is null
       or target.deactivated_at > now() - interval '7 days' then
      raise exception 'This group is not eligible for permanent deletion.';
    end if;
    delete from public.organizations where id = target.id;
    insert into public.audit_log
      (actor_id, action, entity_type, entity_id, details)
    values
      (auth.uid(), 'organization.deleted', 'organization', target.id::text,
       jsonb_build_object('name', target.name));
    result_message := target.name || ' was permanently deleted.';
  end if;

  return result_message;
end;
$$;

revoke execute on function public.complete_organization_action(uuid) from public, anon;
grant execute on function public.complete_organization_action(uuid) to authenticated;
