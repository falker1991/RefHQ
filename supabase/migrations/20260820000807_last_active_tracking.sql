-- Law18Ref v0.28.0: treat the legacy last_login_at presence field as Last Active.
-- This preserves existing directory data and its audit exclusion while extending
-- updates to visible authenticated use. Calls are throttled server-side.

comment on column public.profiles.last_login_at is
  'Most recent recorded authenticated Law18Ref activity. Retained column name for backwards compatibility.';

comment on column public.officials.last_login_at is
  'Most recent recorded authenticated Law18Ref activity for the linked account. Retained column name for backwards compatibility.';

create or replace function public.record_current_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  update public.profiles
  set last_login_at = now()
  where id = current_user_id
    and (last_login_at is null or last_login_at < now() - interval '30 seconds');

  update public.officials
  set last_login_at = now()
  where linked_user_id = current_user_id
    and (last_login_at is null or last_login_at < now() - interval '30 seconds');
end;
$$;

revoke all on function public.record_current_activity() from public;
revoke all on function public.record_current_activity() from anon;
grant execute on function public.record_current_activity() to authenticated;
