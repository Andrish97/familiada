-- Wyłączony Przycisk nie może zgłosić naciśnięcia, również ze starej otwartej strony.
CREATE OR REPLACE FUNCTION "public"."game_state_buzzer_press"("p_game_id" "uuid", "p_key" "text", "p_team" "public"."game_team") RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g public.games;
  ok boolean := false;
  v_old public.game_state;
  v_new public.game_state;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;

  if coalesce(g.share_key_buzzer,'') <> '' and g.share_key_buzzer = p_key then ok := true; end if;
  if coalesce(g.share_key_buzzer,'') = ''  and g.share_key_host   = p_key then ok := true; end if;
  if not ok then raise exception 'forbidden'; end if;

  select * into v_old from public.game_state where game_id = p_game_id for update;
  if found and v_old.locked_until is not null and v_old.locked_until > now() then
    raise exception 'locked';
  end if;

  if coalesce((v_old.detail #>> '{settings,physicalBuzzer}')::boolean, false) then
    raise exception 'device_disabled';
  end if;

  update public.game_state
  set detail = jsonb_set(
        detail,
        '{rounds,duel,lastPressed}',
        to_jsonb(p_team::text)
      ),
      rev = rev + 1,
      updated_at = now()
  where game_id = p_game_id
    and step = 'r_duel'
    and (detail #>> '{rounds,duel,lastPressed}') is null
  returning * into v_new;

  if not found then
    raise exception 'already_pressed';
  end if;

  return v_new;
end;
$$;
