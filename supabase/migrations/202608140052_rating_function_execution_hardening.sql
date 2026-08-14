-- Law18Ref v0.21.1: rating RPCs are authenticated-only; trigger helpers are internal.

revoke execute on function public.effective_public_rating_approval_role(uuid) from public, anon;
grant execute on function public.effective_public_rating_approval_role(uuid) to authenticated;

revoke execute on function public.enforce_event_rating_settings() from public, anon, authenticated;
revoke execute on function public.enforce_assessment_group_ownership() from public, anon, authenticated;

revoke execute on function public.can_review_assessment(uuid) from public, anon;
grant execute on function public.can_review_assessment(uuid) to authenticated;

revoke execute on function public.can_manage_assessment(uuid) from public, anon;
grant execute on function public.can_manage_assessment(uuid) to authenticated;

revoke execute on function public.approve_public_rating(uuid) from public, anon;
grant execute on function public.approve_public_rating(uuid) to authenticated;

revoke execute on function public.mark_event_ratings_seen(uuid) from public, anon;
grant execute on function public.mark_event_ratings_seen(uuid) to authenticated;

revoke execute on function public.delete_rating(uuid, boolean) from public, anon;
grant execute on function public.delete_rating(uuid, boolean) to authenticated;

revoke execute on function public.set_rating_archived(uuid, boolean) from public, anon;
grant execute on function public.set_rating_archived(uuid, boolean) to authenticated;

revoke execute on function public.authorized_rating_history(uuid) from public, anon;
grant execute on function public.authorized_rating_history(uuid) to authenticated;

revoke execute on function public.update_event_rating_settings(uuid, text, boolean, text) from public, anon;
grant execute on function public.update_event_rating_settings(uuid, text, boolean, text) to authenticated;
