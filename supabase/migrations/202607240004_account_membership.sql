-- Account self-service for Law18Referee Management.
create policy "members update own profile"
on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and organization_id = public.current_org_id()
);

create or replace function public.leave_current_organization()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_profile public.profiles%rowtype;
  administrator_count integer;
begin
  select * into member_profile
  from public.profiles
  where id = auth.uid();

  if member_profile.id is null then
    raise exception 'No organization membership was found.';
  end if;

  if member_profile.role = 'admin' then
    select count(*) into administrator_count
    from public.profiles
    where organization_id = member_profile.organization_id
      and role = 'admin';

    if administrator_count <= 1 then
      raise exception 'Assign another administrator before leaving this group.';
    end if;
  end if;

  delete from public.profiles where id = auth.uid();
end;
$$;

grant execute on function public.leave_current_organization() to authenticated;
