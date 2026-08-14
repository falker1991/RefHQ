-- Law18Ref v0.23.1: release a merged official's unique email before the
-- surviving record adopts it. The original address remains preserved in the
-- merge audit entry and, for linked users, in the surviving profile.

create or replace function public.retire_merged_official_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.merged_into_official_id is not null
     and old.merged_into_official_id is null then
    new.email := 'merged+' || new.id::text || '@invalid.law18ref.local';
  end if;
  return new;
end;
$$;

revoke all on function public.retire_merged_official_email() from public, anon, authenticated;

drop trigger if exists retire_merged_official_email_before_update on public.officials;
create trigger retire_merged_official_email_before_update
before update of merged_into_official_id on public.officials
for each row
execute function public.retire_merged_official_email();
