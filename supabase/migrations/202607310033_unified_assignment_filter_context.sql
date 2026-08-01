-- Law18Ref v0.10.4: event and organization context for personal schedule filters.

create or replace function public.my_law18_assignment_context()
returns table (
  event_id uuid,
  event_name text,
  organization_id uuid,
  organization_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct e.id, e.name, o.id, o.name
  from public.assignments a
  join public.officials official on official.id = a.official_id
  join public.games g on g.id = a.game_id
  join public.events e on e.id = g.event_id
  join public.organizations o on o.id = e.organization_id
  where official.linked_user_id = auth.uid();
$$;

grant execute on function public.my_law18_assignment_context() to authenticated;

