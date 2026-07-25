-- Allow authenticated RefHQ users to reach the tables protected by RLS.
-- Row-level security policies remain the authorization boundary.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.organizations,
  public.profiles,
  public.events,
  public.games,
  public.officials,
  public.assignments,
  public.coach_assignments,
  public.check_ins,
  public.assessments,
  public.import_jobs
to authenticated;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.link_current_referee() to authenticated;
