-- Law18Ref v0.18.0: enforce Site Owner feature ceilings immediately for every group.

drop policy if exists "site owner updates group settings" on public.organizations;
create policy "site owner updates group settings"
on public.organizations for update
using (public.is_site_owner())
with check (public.is_site_owner());

create or replace function public.protect_group_feature_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.feature_entitlements is distinct from old.feature_entitlements
     and not public.is_site_owner() then
    raise exception 'Only the Site Owner can change group feature entitlements' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_group_feature_entitlements on public.organizations;
create trigger protect_group_feature_entitlements
before update of feature_entitlements on public.organizations
for each row execute function public.protect_group_feature_entitlements();

create or replace function public.apply_group_feature_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  feature_key text;
begin
  if new.feature_entitlements is not distinct from old.feature_entitlements then
    return new;
  end if;

  for feature_key in select unnest(array['assignment_board','check_in','ratings','coaching','event_documents']) loop
    if not coalesce((new.feature_entitlements ->> feature_key)::boolean, true) then
      update public.events
      set feature_settings = jsonb_set(feature_settings, array[feature_key], 'false'::jsonb, true)
      where organization_id = new.id
        and coalesce((feature_settings ->> feature_key)::boolean, true);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists apply_group_feature_entitlements on public.organizations;
create trigger apply_group_feature_entitlements
after update of feature_entitlements on public.organizations
for each row execute function public.apply_group_feature_entitlements();

comment on column public.organizations.feature_entitlements is
  'Site Owner controlled feature ceiling for the user-facing Law18Ref group.';
