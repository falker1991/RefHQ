-- PostgREST cannot infer a partial unique index for ON CONFLICT. Keep the
-- official-based assessment identity unique with a non-partial index instead.
-- PostgreSQL still permits legacy rows with a null official_id.

drop index if exists public.assessments_game_official_coach_unique;

create unique index assessments_game_official_coach_unique
  on public.assessments(game_id, official_id, coach_id);

