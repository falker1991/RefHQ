-- Law18Ref v0.15.0: organization entitlement ceilings and per-event feature settings.

alter table public.organizations
  add column if not exists feature_entitlements jsonb not null default '{"assignment_board":true,"check_in":true,"ratings":true,"coaching":true,"event_documents":true}'::jsonb;

alter table public.events
  add column if not exists feature_settings jsonb not null default '{"assignment_board":true,"check_in":true,"ratings":true,"coaching":true,"event_documents":true}'::jsonb;

alter table public.organizations
  drop constraint if exists organizations_feature_entitlements_object;
alter table public.organizations
  add constraint organizations_feature_entitlements_object check (jsonb_typeof(feature_entitlements) = 'object');

alter table public.events
  drop constraint if exists events_feature_settings_object;
alter table public.events
  add constraint events_feature_settings_object check (jsonb_typeof(feature_settings) = 'object');

update public.events
set feature_settings = jsonb_set(feature_settings, '{check_in}', to_jsonb(check_in_enabled), true);

create or replace function public.enforce_event_feature_ceiling()
returns trigger language plpgsql set search_path = public as $$
declare entitlements jsonb;
declare feature_key text;
begin
  select organization.feature_entitlements into entitlements
  from public.organizations organization where organization.id = new.organization_id;
  foreach feature_key in array array['assignment_board','check_in','ratings','coaching','event_documents'] loop
    if coalesce((new.feature_settings ->> feature_key)::boolean, true)
       and not coalesce((entitlements ->> feature_key)::boolean, true) then
      raise exception '% is not enabled for this organization', feature_key using errcode = '42501';
    end if;
  end loop;
  new.check_in_enabled := coalesce((new.feature_settings ->> 'check_in')::boolean, true);
  return new;
end;
$$;

drop trigger if exists enforce_event_feature_ceiling on public.events;
create trigger enforce_event_feature_ceiling before insert or update of organization_id, feature_settings
on public.events for each row execute function public.enforce_event_feature_ceiling();

create or replace function public.can_access_event_document(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events event
    where event.id = target_event
      and coalesce((event.feature_settings ->> 'event_documents')::boolean, true)
      and (
        public.is_site_owner()
        or public.has_org_role(event.organization_id, array['organization_director','organization_admin']::public.membership_role[])
        or public.has_event_role(event.id, array['event_admin','assignor','site_coordinator','referee_coach','referee']::public.membership_role[])
        or exists (
          select 1 from public.games game
          join public.assignments assignment on assignment.game_id = game.id
          join public.officials official on official.id = assignment.official_id
          where game.event_id = event.id and official.linked_user_id = auth.uid()
        )
        or exists (select 1 from public.coach_assignments coach where coach.event_id = event.id and coach.coach_id = auth.uid())
      )
  );
$$;

create or replace function public.enforce_event_feature_enabled()
returns trigger language plpgsql set search_path = public as $$
declare target_event uuid;
declare feature_key text;
declare enabled boolean;
begin
  if tg_table_name = 'check_ins' then target_event := new.event_id; feature_key := 'check_in';
  elsif tg_table_name = 'coach_assignments' then target_event := new.event_id; feature_key := 'coaching';
  elsif tg_table_name = 'event_documents' then target_event := new.event_id; feature_key := 'event_documents';
  elsif tg_table_name = 'assessments' then
    select game.event_id into target_event from public.games game where game.id = new.game_id;
    feature_key := 'ratings';
  else return new;
  end if;
  select coalesce((event.feature_settings ->> feature_key)::boolean, true)
    into enabled from public.events event where event.id = target_event;
  if not coalesce(enabled, false) then raise exception '% is disabled for this event', feature_key using errcode = '42501'; end if;
  return new;
end;
$$;

drop trigger if exists enforce_check_in_feature on public.check_ins;
create trigger enforce_check_in_feature before insert or update on public.check_ins for each row execute function public.enforce_event_feature_enabled();
drop trigger if exists enforce_coaching_feature on public.coach_assignments;
create trigger enforce_coaching_feature before insert or update on public.coach_assignments for each row execute function public.enforce_event_feature_enabled();
drop trigger if exists enforce_rating_feature on public.assessments;
create trigger enforce_rating_feature before insert or update on public.assessments for each row execute function public.enforce_event_feature_enabled();
drop trigger if exists enforce_document_feature on public.event_documents;
create trigger enforce_document_feature before insert or update on public.event_documents for each row execute function public.enforce_event_feature_enabled();
