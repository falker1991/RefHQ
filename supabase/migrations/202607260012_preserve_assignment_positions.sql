-- Preserve the position title supplied by Assignr instead of reducing every
-- unfamiliar position to Referee.

alter type public.assignment_position add value if not exists 'referee_coach';
alter type public.assignment_position add value if not exists 'site_coordinator';
alter type public.assignment_position add value if not exists 'site_supervisor';
alter type public.assignment_position add value if not exists 'standby';
alter type public.assignment_position add value if not exists 'other';

alter table public.assignments
  add column if not exists position_title text;

update public.assignments
set position_title = case position::text
  when 'referee' then 'Referee'
  when 'assistant_referee' then 'Assistant Referee'
  when 'fourth_official' then 'Fourth Official'
  when 'mentor' then 'Mentor'
  when 'referee_coach' then 'Referee Coach'
  when 'site_coordinator' then 'Site Coordinator'
  when 'site_supervisor' then 'Site Supervisor'
  when 'standby' then 'Standby'
  else 'Official'
end
where position_title is null;
