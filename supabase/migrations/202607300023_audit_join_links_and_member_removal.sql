-- Law18Ref v0.6.0: comprehensive organization activity, last-login tracking,
-- secure reusable join links, and recoverable organization-member removal.

alter table public.profiles
  add column if not exists last_login_at timestamptz;

alter table public.officials
  add column if not exists last_login_at timestamptz;

create table if not exists public.organization_join_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  label text not null default 'Officials join link',
  default_role public.membership_role not null default 'referee',
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0
);

create index if not exists organization_join_links_org_idx
  on public.organization_join_links(organization_id, created_at desc);

alter table public.organization_join_links enable row level security;

drop policy if exists "organization admins view join links" on public.organization_join_links;
create policy "organization admins view join links"
  on public.organization_join_links for select
  using (
    public.is_site_owner()
    or public.has_org_role(
      organization_id,
      array['organization_admin']::public.membership_role[]
    )
  );

grant select on public.organization_join_links to authenticated;

create or replace function public.record_current_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_login_at = now()
  where id = auth.uid();

  update public.officials
  set last_login_at = now()
  where linked_user_id = auth.uid();
end;
$$;

grant execute on function public.record_current_login() to authenticated;

create or replace function public.create_organization_join_link(
  target_organization uuid,
  link_label text default 'Officials join link',
  link_role public.membership_role default 'referee',
  link_expires_at timestamptz default null
)
returns setof public.organization_join_links
language plpgsql
security definer
set search_path = public
as $$
declare
  created_link public.organization_join_links;
begin
  if not (
    public.is_site_owner()
    or public.has_org_role(
      target_organization,
      array['organization_admin']::public.membership_role[]
    )
  ) then
    raise exception 'Only an organization administrator can create a join link.';
  end if;

  if link_role in ('site_owner', 'organization_admin', 'event_admin') then
    raise exception 'Join links may not grant an administrator role.';
  end if;

  insert into public.organization_join_links (
    organization_id, label, default_role, created_by, expires_at
  )
  values (
    target_organization,
    coalesce(nullif(trim(link_label), ''), 'Officials join link'),
    link_role,
    auth.uid(),
    link_expires_at
  )
  returning * into created_link;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    target_organization,
    auth.uid(),
    'join_link.created',
    'organization_join_link',
    created_link.id::text,
    jsonb_build_object('label', created_link.label, 'default_role', created_link.default_role)
  );

  return next created_link;
  return;
end;
$$;

grant execute on function public.create_organization_join_link(
  uuid, text, public.membership_role, timestamptz
) to authenticated;

create or replace function public.set_organization_join_link_active(
  join_link_id uuid,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization uuid;
begin
  select organization_id into target_organization
  from public.organization_join_links
  where id = join_link_id;

  if target_organization is null or not (
    public.is_site_owner()
    or public.has_org_role(
      target_organization,
      array['organization_admin']::public.membership_role[]
    )
  ) then
    raise exception 'Only an organization administrator can update this join link.';
  end if;

  update public.organization_join_links
  set active = enabled
  where id = join_link_id;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    target_organization,
    auth.uid(),
    case when enabled then 'join_link.enabled' else 'join_link.disabled' end,
    'organization_join_link',
    join_link_id::text,
    jsonb_build_object('active', enabled)
  );
end;
$$;

grant execute on function public.set_organization_join_link_active(uuid, boolean) to authenticated;

create or replace function public.claim_organization_join_link(join_token text)
returns table (organization_id uuid, organization_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_link public.organization_join_links;
  account_email text;
  account_name text;
  matched_official uuid;
  matched_user uuid;
begin
  select * into target_link
  from public.organization_join_links
  where token = join_token
    and active
    and (expires_at is null or expires_at > now());

  if target_link.id is null then
    raise exception 'This Join Group link is invalid, disabled, or expired.';
  end if;

  select lower(email), full_name
  into account_email, account_name
  from public.profiles
  where id = auth.uid();

  if account_email is null then
    raise exception 'Complete your account before joining this organization.';
  end if;

  insert into public.organization_memberships (
    organization_id, user_id, role, status
  )
  values (
    target_link.organization_id, auth.uid(), target_link.default_role, 'active'
  )
  on conflict (organization_id, user_id, role)
  do update set status = 'active';

  select id, linked_user_id into matched_official, matched_user
  from public.officials
  where organization_id = target_link.organization_id
    and lower(email) = account_email
    and merged_into_official_id is null
  order by created_at
  limit 1;

  if matched_user is not null and matched_user <> auth.uid() then
    raise exception 'An organization official with this email is already linked to another account.';
  end if;

  if matched_official is null then
    insert into public.officials (
      organization_id,
      full_name,
      email,
      linked_user_id,
      identity_status,
      source,
      source_display_name,
      pending_org_role,
      pending_org_roles
    )
    values (
      target_link.organization_id,
      coalesce(nullif(account_name, ''), account_email),
      account_email,
      auth.uid(),
      'linked',
      'join_link',
      coalesce(nullif(account_name, ''), account_email),
      target_link.default_role,
      array[target_link.default_role]::public.membership_role[]
    );
  else
    update public.officials
    set linked_user_id = auth.uid(),
        identity_status = 'linked',
        pending_org_role = target_link.default_role,
        pending_org_roles = (
          select array_agg(distinct role_value)
          from unnest(
            coalesce(pending_org_roles, array[]::public.membership_role[])
            || array[target_link.default_role]::public.membership_role[]
          ) role_value
        ),
        updated_at = now()
    where id = matched_official;
  end if;

  update public.organization_join_links
  set last_used_at = now(),
      use_count = use_count + 1
  where id = target_link.id;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    target_link.organization_id,
    auth.uid(),
    'membership.joined_via_link',
    'organization_membership',
    auth.uid()::text,
    jsonb_build_object('join_link_id', target_link.id, 'role', target_link.default_role)
  );

  return query
  select o.id, o.name
  from public.organizations o
  where o.id = target_link.organization_id;
end;
$$;

grant execute on function public.claim_organization_join_link(text) to authenticated;

create or replace function public.remove_organization_member(
  target_organization uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_is_admin boolean;
  active_admin_count integer;
begin
  if not (
    public.is_site_owner()
    or public.has_org_role(
      target_organization,
      array['organization_admin']::public.membership_role[]
    )
  ) then
    raise exception 'Only an organization administrator can remove a member.';
  end if;

  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_organization
      and user_id = target_user
      and role = 'organization_admin'
      and status = 'active'
  ) into target_is_admin;

  select count(distinct user_id) into active_admin_count
  from public.organization_memberships
  where organization_id = target_organization
    and role = 'organization_admin'
    and status = 'active';

  if target_is_admin and active_admin_count <= 1 then
    raise exception 'The last organization administrator cannot be removed. Deactivate the organization instead.';
  end if;

  update public.organization_memberships
  set status = 'archived'
  where organization_id = target_organization
    and user_id = target_user;

  delete from public.event_memberships em
  using public.events e
  where em.event_id = e.id
    and e.organization_id = target_organization
    and em.user_id = target_user;

  update public.officials
  set identity_status = 'removed',
      updated_at = now()
  where organization_id = target_organization
    and linked_user_id = target_user;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id
  )
  values (
    target_organization,
    auth.uid(),
    'membership.removed',
    'organization_membership',
    target_user::text
  );
end;
$$;

grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;

create or replace function public.organization_activity(
  target_organization uuid,
  result_limit integer default 250
)
returns table (
  id bigint,
  event_id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_site_owner()
    or public.has_org_role(
      target_organization,
      array['organization_admin']::public.membership_role[]
    )
  ) then
    raise exception 'Only an organization administrator can view activity.';
  end if;

  return query
  select
    a.id,
    a.event_id,
    a.actor_id,
    coalesce(p.full_name, p.email, 'System'),
    a.action,
    a.entity_type,
    a.entity_id,
    a.details,
    a.created_at
  from public.audit_log a
  left join public.profiles p on p.id = a.actor_id
  where a.organization_id = target_organization
  order by a.created_at desc
  limit least(greatest(result_limit, 1), 1000);
end;
$$;

grant execute on function public.organization_activity(uuid, integer) to authenticated;

create or replace function public.audit_organization_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_payload jsonb := case when TG_OP = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  org_uuid uuid;
  event_uuid uuid;
  record_id text;
  changed_fields text[];
begin
  if payload ? 'organization_id' then
    org_uuid := nullif(payload->>'organization_id', '')::uuid;
  end if;
  if payload ? 'event_id' then
    event_uuid := nullif(payload->>'event_id', '')::uuid;
  elsif TG_TABLE_NAME = 'events' then
    event_uuid := nullif(payload->>'id', '')::uuid;
  elsif payload ? 'game_id' then
    select g.event_id into event_uuid
    from public.games g
    where g.id = nullif(payload->>'game_id', '')::uuid;
  end if;

  if org_uuid is null and event_uuid is not null then
    select e.organization_id into org_uuid
    from public.events e
    where e.id = event_uuid;
  end if;

  if org_uuid is null and TG_TABLE_NAME = 'organization_memberships' then
    org_uuid := nullif(payload->>'organization_id', '')::uuid;
  end if;

  record_id := coalesce(payload->>'id', payload->>'user_id', payload->>'game_id');

  if TG_OP = 'UPDATE' then
    select coalesce(array_agg(field_name order by field_name), array[]::text[])
    into changed_fields
    from jsonb_object_keys(payload) as fields(field_name)
    where payload->field_name is distinct from old_payload->field_name
      and field_name not in ('updated_at', 'last_login_at');

    if cardinality(changed_fields) = 0 then
      if TG_OP = 'DELETE' then return old; else return new; end if;
    end if;
  end if;

  insert into public.audit_log (
    organization_id,
    event_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    org_uuid,
    event_uuid,
    auth.uid(),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    record_id,
    case
      when TG_OP = 'UPDATE' then jsonb_build_object('changed_fields', changed_fields)
      else jsonb_build_object('operation', lower(TG_OP))
    end
  );

  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'events',
    'games',
    'assignments',
    'officials',
    'assessments',
    'check_ins',
    'coach_assignments',
    'import_jobs',
    'organization_memberships',
    'event_memberships'
  ]
  loop
    execute format('drop trigger if exists audit_%I_mutation on public.%I', table_name, table_name);
    execute format(
      'create trigger audit_%I_mutation after insert or update or delete on public.%I for each row execute function public.audit_organization_mutation()',
      table_name,
      table_name
    );
  end loop;
end;
$$;
