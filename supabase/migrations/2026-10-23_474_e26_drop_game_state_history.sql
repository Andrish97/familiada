-- E26 B1 (decyzja użytkownika 2026-10-23): cofanie w Control wycofane, więc
-- bez migawek stanu. game_state_write nie kopiuje już poprzedniego stanu do
-- game_state_history (każdy ruch w Control o jeden INSERT i DELETE lżejszy);
-- game_state_undo (bez wywołującego) i sama tabela znikają.

CREATE OR REPLACE FUNCTION "public"."game_state_write"("p_game_id" "uuid", "p_step" "public"."game_step", "p_top_card" "public"."game_top_card", "p_phase" "public"."game_round_phase" DEFAULT NULL::"public"."game_round_phase", "p_control_team" "public"."game_team" DEFAULT NULL::"public"."game_team", "p_detail" "jsonb" DEFAULT NULL::"jsonb", "p_sound_cue_key" "text" DEFAULT NULL::"text", "p_expected_rev" bigint DEFAULT NULL::bigint) RETURNS "public"."game_state"
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
  end if;

  if p_sound_cue_key is not null then
    v_next_sound_key := p_sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0) + 1;
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

CREATE OR REPLACE FUNCTION "public"."game_state_write"("p_game_id" "uuid", "p_step" "public"."game_step", "p_top_card" "public"."game_top_card", "p_phase" "public"."game_round_phase" DEFAULT NULL::"public"."game_round_phase", "p_control_team" "public"."game_team" DEFAULT NULL::"public"."game_team", "p_detail" "jsonb" DEFAULT NULL::"jsonb", "p_sound_cue_key" "text" DEFAULT NULL::"text", "p_expected_rev" bigint DEFAULT NULL::bigint, "p_lock_ms" integer DEFAULT NULL::integer) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_old public.game_state;
  v_new public.game_state;
  v_next_sound_key text;
  v_next_sound_seq bigint;
  v_locked_until timestamptz;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_old from public.game_state where game_id = p_game_id for update;

  if found and v_old.locked_until is not null and v_old.locked_until > now() then
    raise exception 'locked';
  end if;

  if not found then
    -- pierwszy zapis dla tej gry — nie ma z czym porównać expected_rev
    if p_expected_rev is not null and p_expected_rev <> 0 then
      raise exception 'stale_write';
    end if;
  else
    if p_expected_rev is not null and p_expected_rev <> v_old.rev then
      raise exception 'stale_write';
    end if;
  end if;

  if p_sound_cue_key is not null then
    v_next_sound_key := p_sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0) + 1;
  else
    v_next_sound_key := v_old.sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0);
  end if;

  if p_lock_ms is not null and p_lock_ms > 0 then
    v_locked_until := now() + (p_lock_ms::text || ' milliseconds')::interval;
  else
    v_locked_until := null;
  end if;

  insert into public.game_state as gs
    (game_id, rev, top_card, step, phase, control_team, sound_cue_key, sound_cue_seq, detail, locked_until, updated_at)
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
    v_locked_until,
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
    locked_until = excluded.locked_until,
    updated_at = excluded.updated_at
  returning * into v_new;

  return v_new;
end;
$$;

DROP FUNCTION public.game_state_undo("uuid");

DROP TABLE public.game_state_history;

COMMENT ON TABLE public.game_state IS 'Control v2: jedyne, autorytatywne źródło "co jest teraz prawdą o grze". Zapis wyłącznie przez game_state_write/game_state_buzzer_press (SECURITY DEFINER) — brak polityk INSERT/UPDATE dla klienta wprost na tabeli.';
