create or replace function public.swap_game_details_with_options(
  first_game_uuid uuid,
  second_game_uuid uuid,
  move_crews_with_game boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  detail_result jsonb;
  crew_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;

  -- Both operations share this transaction. A failed crew move rolls back the detail swap.
  detail_result := public.swap_game_details(first_game_uuid, second_game_uuid);
  if coalesce(move_crews_with_game, false) then
    crew_result := public.swap_game_crews(first_game_uuid, second_game_uuid);
  end if;

  return detail_result || jsonb_build_object(
    'crews_moved_with_games', coalesce(move_crews_with_game, false),
    'crew_size', case when crew_result is null then null else crew_result -> 'crew_size' end
  );
end;
$$;

revoke all on function public.swap_game_details_with_options(uuid, uuid, boolean) from public, anon;
grant execute on function public.swap_game_details_with_options(uuid, uuid, boolean) to authenticated;
