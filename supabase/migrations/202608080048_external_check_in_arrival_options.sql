-- Law18Ref v0.19.1: customizable External Check-In arrival and account-login visibility.

alter table public.events
  add column if not exists external_check_in_arrival_message text not null
    default 'Enter the requested details exactly as they appear in your Assignr account or the event’s assigning system.',
  add column if not exists external_check_in_allow_account_sign_in boolean not null default true;

create or replace function public.get_external_check_in_config(event_slug text, event_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare selected_event public.events;
begin
  select * into selected_event from public.events event
  where event.check_in_slug = event_slug and event.archived_at is null
    and event.check_in_enabled and event.guest_check_in_enabled
    and coalesce((event.feature_settings ->> 'check_in')::boolean, true)
    and event_day between event.starts_on and event.ends_on;
  if selected_event.id is null then raise exception 'External check-in is not available for this event date.'; end if;
  return jsonb_build_object(
    'event_name', selected_event.name,
    'required_fields', selected_event.external_check_in_fields,
    'other_label', selected_event.external_check_in_other_label,
    'arrival_message', selected_event.external_check_in_arrival_message,
    'allow_account_sign_in', selected_event.external_check_in_allow_account_sign_in,
    'first_failure_message', selected_event.external_check_in_first_failure_message,
    'second_failure_message', selected_event.external_check_in_second_failure_message
  );
end;
$$;

revoke all on function public.get_external_check_in_config(text, date) from public;
grant execute on function public.get_external_check_in_config(text, date) to anon, authenticated;

