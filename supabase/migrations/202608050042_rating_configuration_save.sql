-- Law18Ref v0.15.1: reliable, authorized event rating configuration saves.

create or replace function public.update_event_rating_settings(
  target_event uuid,
  next_rating_type text,
  next_ratings_admin_only boolean,
  next_public_rating_approval_role text
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization uuid;
  updated_event public.events;
begin
  if next_rating_type not in ('skills_eval', 'basic_eval') then
    raise exception 'Choose a valid evaluation type.';
  end if;
  if next_public_rating_approval_role not in ('inherit', 'none', 'organization_admin', 'event_admin') then
    raise exception 'Choose a valid public evaluation approval setting.';
  end if;

  select organization_id into target_organization
  from public.events where id = target_event;
  if target_organization is null then
    raise exception 'The selected event could not be found.';
  end if;

  if not (
    public.is_site_owner()
    or public.has_org_role(target_organization, array['organization_director','organization_admin']::public.membership_role[])
    or public.has_event_role(target_event, array['event_admin']::public.membership_role[])
  ) then
    raise exception 'You do not have permission to configure ratings for this event.' using errcode = '42501';
  end if;

  update public.events
  set rating_type = next_rating_type,
      ratings_admin_only = next_ratings_admin_only,
      public_rating_approval_role = next_public_rating_approval_role
  where id = target_event
  returning * into updated_event;

  return updated_event;
end;
$$;

grant execute on function public.update_event_rating_settings(uuid, text, boolean, text) to authenticated;
