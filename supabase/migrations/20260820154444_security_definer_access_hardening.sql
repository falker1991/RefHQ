-- Law18Ref v0.30.0 security hardening.
-- Remove implicit PUBLIC/anonymous execution from every elevated public-schema
-- function, then explicitly restore only the external check-in API.

do $$
declare
  secured_function record;
begin
  for secured_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', secured_function.signature);
  end loop;
end;
$$;

-- These three RPCs intentionally support the no-account external check-in
-- workflow. All other elevated functions now require authentication or are
-- callable only by the database itself.
grant execute on function public.get_external_check_in_config(text, date) to anon, authenticated;
grant execute on function public.find_external_check_in(text, date, jsonb) to anon, authenticated;
grant execute on function public.confirm_guest_check_in(uuid) to anon, authenticated;

-- Legacy profile helpers remain referenced by older RLS policies.
grant execute on function public.current_org_id() to authenticated;
grant execute on function public."current_role"() to authenticated;

-- Trigger functions and the RLS event trigger are internal entry points. Their
-- triggers continue to execute even though clients cannot invoke them as RPCs.
do $$
declare
  internal_function record;
begin
  for internal_function in
    select distinct p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', internal_function.signature);
  end loop;
end;
$$;

revoke execute on function public.rls_auto_enable() from authenticated;
revoke execute on function public.jwt_has_recent_method(text, interval) from authenticated;

-- These tables are intentionally function-only. Explicit deny policies make
-- that design visible and prevent future grants from accidentally exposing rows.
drop policy if exists "no direct guest check-in session access" on public.guest_check_in_sessions;
create policy "no direct guest check-in session access"
  on public.guest_check_in_sessions for all to public
  using (false) with check (false);

drop policy if exists "no direct organization challenge access" on public.organization_action_challenges;
create policy "no direct organization challenge access"
  on public.organization_action_challenges for all to public
  using (false) with check (false);

drop policy if exists "no direct personal calendar feed access" on public.personal_calendar_feeds;
create policy "no direct personal calendar feed access"
  on public.personal_calendar_feeds for all to public
  using (false) with check (false);

revoke all on table public.guest_check_in_sessions from anon, authenticated;
revoke all on table public.organization_action_challenges from anon, authenticated;
revoke all on table public.personal_calendar_feeds from anon, authenticated;
