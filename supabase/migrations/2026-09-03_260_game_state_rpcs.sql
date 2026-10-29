-- RPC dla public.game_state / public.game_state_history (Control v2).
-- Wzorce autoryzacji skopiowane wprost z dzisiejszych funkcji: właściciel
-- (auth.uid() = games.owner_id) jak w game_session_start/update/end,
-- share_key_* jak w device_ping/device_state_get/device_state_set_public
-- (łącznie z zachowanym fallbackiem buzzer→share_key_host dla zgodności).

-- ---------------------------------------------------------------------
-- game_state_write — jedyny sposób, w jaki Control (właściciel) zapisuje
-- stan gry. Zawsze pełne nadpisanie top_card/step/phase/control_team +
-- opcjonalnie detail (brak p_detail = zostaw bez zmian). Przed każdą
-- zmianą odkłada migawkę poprzedniego wiersza do game_state_history
-- (przycięte do 20 najnowszych na grę) — to jest mechanizm "lekkiego
-- cofnięcia" (game_state_undo, niżej).
-- ---------------------------------------------------------------------

CREATE FUNCTION "public"."game_state_write"(
    "p_game_id" "uuid",
    "p_step" "public"."game_step",
    "p_top_card" "public"."game_top_card",
    "p_phase" "public"."game_round_phase" DEFAULT NULL,
    "p_control_team" "public"."game_team" DEFAULT NULL,
    "p_detail" "jsonb" DEFAULT NULL,
    "p_sound_cue_key" "text" DEFAULT NULL,
    "p_expected_rev" bigint DEFAULT NULL
) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_old public.game_state;
  v_new public.game_state;
  v_next_sound_key text;
  v_next_sound_seq bigint;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_old from public.game_state where game_id = p_game_id for update;

  if not found then
    -- pierwszy zapis dla tej gry — nie ma z czym porównać expected_rev
    if p_expected_rev is not null and p_expected_rev <> 0 then
      raise exception 'stale_write';
    end if;
  else
    if p_expected_rev is not null and p_expected_rev <> v_old.rev then
      raise exception 'stale_write';
    end if;

    insert into public.game_state_history(game_id, rev, snapshot)
    values (v_old.game_id, v_old.rev, to_jsonb(v_old));

    delete from public.game_state_history
    where game_id = p_game_id
      and id not in (
        select id from public.game_state_history
        where game_id = p_game_id
        order by rev desc
        limit 20
      );
  end if;

  if p_sound_cue_key is not null then
    v_next_sound_key := p_sound_cue_key;
    if v_old.sound_cue_key is distinct from p_sound_cue_key then
      v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0) + 1;
    else
      v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0);
    end if;
  else
    v_next_sound_key := v_old.sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0);
  end if;

  insert into public.game_state as gs
    (game_id, rev, top_card, step, phase, control_team, sound_cue_key, sound_cue_seq, detail, updated_at)
  values (
    p_game_id,
    coalesce(v_old.rev, 0) + 1,
    p_top_card,
    p_step,
    p_phase,
    p_control_team,
    v_next_sound_key,
    v_next_sound_seq,
    coalesce(p_detail, v_old.detail, '{}'::jsonb),
    now()
  )
  on conflict (game_id) do update set
    rev = excluded.rev,
    top_card = excluded.top_card,
    step = excluded.step,
    phase = excluded.phase,
    control_team = excluded.control_team,
    sound_cue_key = excluded.sound_cue_key,
    sound_cue_seq = excluded.sound_cue_seq,
    detail = excluded.detail,
    updated_at = excluded.updated_at
  returning * into v_new;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- game_state_get — odczyt dla urządzeń anonimowych (Display/Host/Buzzer),
-- autoryzowany kluczem współdzielonym per typ urządzenia. Używane do
-- pierwszego odczytu przed potwierdzeniem subskrypcji postgres_changes
-- oraz jako fallback dogrywający stan, gdyby "dzwonek" broadcastowy dotarł
-- bez działającego postgres_changes (patrz plan, sekcja 1).
-- ---------------------------------------------------------------------

CREATE FUNCTION "public"."game_state_get"(
    "p_game_id" "uuid",
    "p_device_type" "public"."device_type",
    "p_key" "text"
) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g public.games;
  ok boolean := false;
  out public.game_state;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;

  if p_device_type = 'display' and g.share_key_display = p_key then ok := true; end if;
  if p_device_type = 'host'    and g.share_key_host    = p_key then ok := true; end if;

  if p_device_type = 'buzzer' then
    if coalesce(g.share_key_buzzer,'') <> '' and g.share_key_buzzer = p_key then ok := true; end if;
    if coalesce(g.share_key_buzzer,'') = ''  and g.share_key_host   = p_key then ok := true; end if;
  end if;

  if not ok then raise exception 'forbidden'; end if;

  select * into out from public.game_state where game_id = p_game_id;
  return out; -- NULL, jeśli Control jeszcze nigdy nic nie zapisał dla tej gry
end;
$$;

-- ---------------------------------------------------------------------
-- game_state_buzzer_press — jedyny zapis do game_state wykonywany
-- bezpośrednio przez Buzzer (nie przez Control). Atomowy, warunkowy: tylko
-- w kroku r_duel i tylko jeśli nikt jeszcze nie nacisnął. Rozstrzyga wyścig
-- pierwszeństwa w bazie (pojedynczy UPDATE ... WHERE), nie przez wyścig
-- dwóch broadcastów po stronie klienta jak dziś.
-- ---------------------------------------------------------------------

CREATE FUNCTION "public"."game_state_buzzer_press"(
    "p_game_id" "uuid",
    "p_key" "text",
    "p_team" "public"."game_team"
) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g public.games;
  ok boolean := false;
  v_new public.game_state;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;

  if coalesce(g.share_key_buzzer,'') <> '' and g.share_key_buzzer = p_key then ok := true; end if;
  if coalesce(g.share_key_buzzer,'') = ''  and g.share_key_host   = p_key then ok := true; end if;
  if not ok then raise exception 'forbidden'; end if;

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

-- ---------------------------------------------------------------------
-- game_state_undo — "Cofnij ostatnią akcję" w Control v2. Bierze
-- najnowszą migawkę z game_state_history i zapisuje ją jako nowy bieżący
-- stan (rev idzie DO PRZODU, nie jest przewijany) — z punktu widzenia
-- każdego innego urządzenia to zwykła zmiana stanu, bez specjalnego
-- przypadku do obsłużenia.
-- ---------------------------------------------------------------------

CREATE FUNCTION "public"."game_state_undo"("p_game_id" "uuid") RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_hist public.game_state_history;
  v_cur public.game_state;
  v_new public.game_state;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_cur from public.game_state where game_id = p_game_id for update;
  if not found then raise exception 'no_state'; end if;

  select * into v_hist from public.game_state_history
  where game_id = p_game_id
  order by rev desc
  limit 1;
  if not found then raise exception 'no_history'; end if;

  update public.game_state
  set rev = v_cur.rev + 1,
      top_card = (v_hist.snapshot->>'top_card')::public.game_top_card,
      step = (v_hist.snapshot->>'step')::public.game_step,
      phase = nullif(v_hist.snapshot->>'phase', '')::public.game_round_phase,
      control_team = nullif(v_hist.snapshot->>'control_team', '')::public.game_team,
      sound_cue_key = v_hist.snapshot->>'sound_cue_key',
      sound_cue_seq = coalesce((v_hist.snapshot->>'sound_cue_seq')::bigint, 0),
      detail = coalesce(v_hist.snapshot->'detail', '{}'::jsonb),
      updated_at = now()
  where game_id = p_game_id
  returning * into v_new;

  delete from public.game_state_history where id = v_hist.id;

  return v_new;
end;
$$;
