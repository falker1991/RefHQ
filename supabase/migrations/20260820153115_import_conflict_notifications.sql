-- Law18Ref v0.29.5: completed imports retain field-level conflict warnings,
-- notify the importer and Site Owner, and add a detailed activity record.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_recipient_idx
  on public.user_notifications(user_id, read_at, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "users view own notifications" on public.user_notifications;
create policy "users view own notifications"
  on public.user_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users mark own notifications read" on public.user_notifications;
create policy "users mark own notifications read"
  on public.user_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.user_notifications to authenticated;

create or replace function public.report_import_warnings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  warning_count integer := jsonb_array_length(coalesce(new.errors, '[]'::jsonb));
  warning_message text;
begin
  if new.status <> 'completed_with_warnings' or warning_count = 0 then
    return new;
  end if;

  warning_message := format(
    '%s completed with %s contact conflict%s. Conflicting fields were skipped; assignments and other valid updates continued.',
    new.file_name,
    warning_count,
    case when warning_count = 1 then '' else 's' end
  );

  insert into public.audit_log (
    organization_id, event_id, actor_id, action, entity_type, entity_id, details
  ) values (
    new.organization_id,
    new.event_id,
    new.uploaded_by,
    'import.completed_with_warnings',
    'import_jobs',
    new.id::text,
    jsonb_build_object(
      'file_name', new.file_name,
      'warning_count', warning_count,
      'message', warning_message,
      'conflicts', new.errors
    )
  );

  insert into public.user_notifications (
    user_id, organization_id, event_id, notification_type, title, message, details
  )
  select distinct recipient.user_id,
    new.organization_id,
    new.event_id,
    'import_conflict',
    'Import completed with warnings',
    warning_message,
    jsonb_build_object('import_job_id', new.id, 'file_name', new.file_name, 'conflicts', new.errors)
  from (
    select new.uploaded_by as user_id
    union
    select p.id from public.profiles p where p.is_site_owner
  ) recipient
  where recipient.user_id is not null;

  return new;
end;
$$;

revoke all on function public.report_import_warnings() from public;
revoke all on function public.report_import_warnings() from anon;
revoke all on function public.report_import_warnings() from authenticated;

drop trigger if exists report_import_warnings on public.import_jobs;
create trigger report_import_warnings
after insert on public.import_jobs
for each row execute function public.report_import_warnings();
