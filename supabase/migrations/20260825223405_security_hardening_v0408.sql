-- Law18Ref v0.40.8 defense-in-depth hardening.
-- Elevated functions remain available only through explicit grants, and every
-- elevated function receives a fixed search path to prevent object shadowing.

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
    execute format('alter function %s set search_path = public, pg_temp', secured_function.signature);
  end loop;
end;
$$;

-- The no-account External Check-In API is intentionally public. Its underlying
-- session table remains inaccessible directly and tokens expire independently.
grant execute on function public.get_external_check_in_config(text, date) to anon, authenticated;
grant execute on function public.find_external_check_in(text, date, jsonb) to anon, authenticated;
grant execute on function public.confirm_guest_check_in(uuid) to anon, authenticated;

revoke all on table public.guest_check_in_sessions from public, anon, authenticated;
revoke all on table public.organization_action_challenges from public, anon, authenticated;
revoke all on table public.personal_calendar_feeds from public, anon, authenticated;
revoke all on table public.assessment_revisions from public, anon, authenticated;

-- Trigger functions are internal entry points and must never be callable as RPCs.
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
