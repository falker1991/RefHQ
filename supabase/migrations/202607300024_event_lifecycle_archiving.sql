-- Law18Ref v0.6.1: manual and automatic event archiving with restoration.

alter table public.events
  add column if not exists auto_archive_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

create index if not exists events_auto_archive_idx
  on public.events(auto_archive_at)
  where archived_at is null and auto_archive_at is not null;

create or replace function public.materialize_due_event_archives()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due_event record;
  archived_count integer := 0;
begin
  for due_event in
    select id, organization_id, auto_archive_at
    from public.events
    where archived_at is null
      and auto_archive_at is not null
      and auto_archive_at <= now()
    for update skip locked
  loop
    update public.events
    set archived_at = due_event.auto_archive_at,
        archived_by = null,
        archive_reason = 'automatic'
    where id = due_event.id;

    insert into public.audit_log (
      organization_id, event_id, actor_id, action, entity_type, entity_id, details
    )
    values (
      due_event.organization_id,
      due_event.id,
      null,
      'event.automatically_archived',
      'events',
      due_event.id::text,
      jsonb_build_object('scheduled_for', due_event.auto_archive_at)
    );
    archived_count := archived_count + 1;
  end loop;

  return archived_count;
end;
$$;

grant execute on function public.materialize_due_event_archives() to authenticated;

create or replace function public.can_view_event(event_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = event_uuid
      and e.archived_at is null
      and (e.auto_archive_at is null or e.auto_archive_at > now())
      and (
        public.is_site_owner()
        or exists (
          select 1
          from public.organization_memberships om
          where om.organization_id = e.organization_id
            and om.user_id = auth.uid()
            and om.status = 'active'
        )
        or exists (
          select 1
          from public.event_memberships em
          where em.event_id = e.id
            and em.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.games g
          join public.assignments a on a.game_id = g.id
          join public.officials o on o.id = a.official_id
          where g.event_id = e.id
            and o.linked_user_id = auth.uid()
        )
      )
  )
$$;

grant execute on function public.can_view_event(uuid) to authenticated;

drop policy if exists "members view events" on public.events;
drop policy if exists "scoped members view events" on public.events;
drop policy if exists "members view accessible events" on public.events;
create policy "members view accessible events"
  on public.events for select
  using (public.can_view_event(events.id));

create or replace function public.configure_event_auto_archive(
  target_event uuid,
  days_after_end integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events;
  scheduled_at timestamptz;
begin
  select * into target from public.events where id = target_event;
  if target.id is null then raise exception 'Event not found.'; end if;
  if not (
    public.is_site_owner()
    or public.has_org_role(
      target.organization_id,
      array['organization_admin']::public.membership_role[]
    )
    or public.has_event_role(
      target.id,
      array['event_admin']::public.membership_role[]
    )
  ) then
    raise exception 'You do not have permission to configure this event.';
  end if;
  if target.archived_at is not null then
    raise exception 'Restore this event before changing its automatic archive setting.';
  end if;
  if days_after_end is not null and (days_after_end < 0 or days_after_end > 365) then
    raise exception 'Automatic archive delay must be between 0 and 365 days.';
  end if;

  scheduled_at := case
    when days_after_end is null then null
    else ((target.ends_on + days_after_end + 1)::timestamp at time zone target.timezone)
  end;

  update public.events
  set auto_archive_at = scheduled_at
  where id = target.id;

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    target.organization_id,
    target.id,
    auth.uid(),
    'event.auto_archive_configured',
    'events',
    target.id::text,
    jsonb_build_object('days_after_end', days_after_end, 'scheduled_for', scheduled_at)
  );

  return scheduled_at;
end;
$$;

grant execute on function public.configure_event_auto_archive(uuid, integer) to authenticated;

create or replace function public.archive_event(target_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events;
begin
  select * into target from public.events where id = target_event;
  if target.id is null then raise exception 'Event not found.'; end if;
  if not (
    public.is_site_owner()
    or public.has_org_role(
      target.organization_id,
      array['organization_admin']::public.membership_role[]
    )
    or public.has_event_role(
      target.id,
      array['event_admin']::public.membership_role[]
    )
  ) then
    raise exception 'You do not have permission to archive this event.';
  end if;

  update public.events
  set archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = 'manual'
  where id = target.id and archived_at is null;

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id
  )
  values (
    target.organization_id,
    target.id,
    auth.uid(),
    'event.manually_archived',
    'events',
    target.id::text
  );
end;
$$;

grant execute on function public.archive_event(uuid) to authenticated;

create or replace function public.restore_event(target_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events;
begin
  select * into target from public.events where id = target_event;
  if target.id is null then raise exception 'Event not found.'; end if;
  if not (
    public.is_site_owner()
    or public.has_org_role(
      target.organization_id,
      array['organization_admin']::public.membership_role[]
    )
  ) then
    raise exception 'Only an organization administrator can restore an event.';
  end if;

  update public.events
  set archived_at = null,
      archived_by = null,
      archive_reason = null,
      auto_archive_at = null
  where id = target.id;

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id
  )
  values (
    target.organization_id,
    target.id,
    auth.uid(),
    'event.restored',
    'events',
    target.id::text
  );
end;
$$;

grant execute on function public.restore_event(uuid) to authenticated;

create or replace function public.organization_event_archive(
  target_organization uuid
)
returns setof public.events
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
    raise exception 'Only an organization administrator can view archived events.';
  end if;

  perform public.materialize_due_event_archives();

  return query
  select e.*
  from public.events e
  where e.organization_id = target_organization
    and e.archived_at is not null
  order by e.ends_on desc, e.name;
end;
$$;

grant execute on function public.organization_event_archive(uuid) to authenticated;
