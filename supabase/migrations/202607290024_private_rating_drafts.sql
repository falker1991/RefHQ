-- Law18Ref v0.5.24 — rating drafts are private to their creator

drop policy if exists "rating drafts private to creator" on public.assessments;

create policy "rating drafts private to creator"
  on public.assessments
  as restrictive
  for select
  to authenticated
  using (
    status <> 'draft'
    or coach_id = auth.uid()
  );
