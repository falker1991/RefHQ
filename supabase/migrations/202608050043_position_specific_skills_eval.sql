-- Law18Ref v0.16.0: position-specific Skills Eval categories and expanded written feedback.

alter table public.assessments
  add column if not exists additional_comments text;

create or replace function public.mark_shared_rating_additional_comments_changed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.additional_comments is distinct from old.additional_comments
     and new.visibility = 'public'
     and new.status = 'shared' then
    new.referee_seen_at := null;
    new.shared_at := coalesce(new.shared_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists mark_shared_rating_additional_comments_changed on public.assessments;
create trigger mark_shared_rating_additional_comments_changed
before update of additional_comments on public.assessments
for each row execute function public.mark_shared_rating_additional_comments_changed();
