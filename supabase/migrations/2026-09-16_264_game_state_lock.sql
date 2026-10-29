-- Blokada zapisu do game_state na czas realnego dźwięku/animacji —
-- dotąd wyłącznie po stronie klienta (control2/js/app.js's `committing`/
-- `lockedUntil`, zwykłe zmienne JS w jednej karcie przeglądarki), zero
-- egzekwowania w bazie. Odświeżenie strony, druga karta Control, wyścig z
-- Buzzerem piszącym bezpośrednio (game_state_buzzer_press, z pominięciem
-- store.js) — żadne z tych źródeł nie widziało tej blokady wcale.
--
-- Nowa kolumna `locked_until` niesie ten sam sens co dzisiejsze klienckie
-- `lockedUntil`, tylko w bazie: "do kiedy trwa dźwięk/animacja tego
-- przejścia, w trakcie których żaden kolejny zapis nie powinien przejść".
-- game_state_write i game_state_buzzer_press odrzucają zapis, dopóki
-- locked_until > now() — niezależnie od tego, KTO próbuje pisać.
--
-- Czas trwania (p_lock_ms) liczony jest PO STRONIE KLIENTA tak jak dziś
-- (control2/js/actionGate.js's computeGateMs, z realnego czasu plików mp3)
-- — baza nie zna nic o dźwiękach, tylko przechowuje wynikowy znacznik
-- czasu. Ustawiany osobnym, lekkim wywołaniem game_state_set_lock PO
-- potwierdzeniu głównego zapisu (dokładnie tak jak dzisiejszy klient już
-- liczy `ms` PO potwierdzeniu commit() — patrz control2/js/app.js's
-- dispatchGated) — nie w tym samym RPC, żeby nie przerabiać sygnatury
-- computeGateMs/engine.dispatch(). Wąskie okno między tymi dwoma
-- wywołaniami jest samo-chronione przez p_expected_rev (stale_write przy
-- kolizji), tak jak każdy inny zapis w tym systemie.

ALTER TABLE "public"."game_state"
  ADD COLUMN "locked_until" timestamp with time zone;

COMMENT ON COLUMN "public"."game_state"."locked_until" IS 'Do kiedy trwa dźwięk/animacja bieżącego przejścia — game_state_write/game_state_buzzer_press odrzucają zapis, dopóki now() < locked_until. Ustawiane przez game_state_set_lock, PO potwierdzeniu głównego zapisu treści.';

-- ---------------------------------------------------------------------
-- game_state_write: nowy param p_lock_ms (na razie zawsze NULL z
-- dzisiejszego klienta — patrz następny commit) + odrzucenie zapisu, gdy
-- gra jest zablokowana.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."game_state_write"(
    "p_game_id" "uuid",
    "p_step" "public"."game_step",
    "p_top_card" "public"."game_top_card",
    "p_phase" "public"."game_round_phase" DEFAULT NULL,
    "p_control_team" "public"."game_team" DEFAULT NULL,
    "p_detail" "jsonb" DEFAULT NULL,
    "p_sound_cue_key" "text" DEFAULT NULL,
    "p_expected_rev" bigint DEFAULT NULL,
    "p_lock_ms" integer DEFAULT NULL
) RETURNS "public"."game_state"
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

-- ---------------------------------------------------------------------
-- game_state_set_lock: JEDYNY sposób na ustawienie locked_until -- lekkie
-- wywołanie PO potwierdzeniu głównego zapisu (control2/js/app.js liczy
-- realny czas dźwięku z p_sound_cue_key dopiero z POTWIERDZONEGO wiersza,
-- dokładnie jak dziś dla klienckiego lockedUntil). Nie zmienia treści
-- stanu -- tylko locked_until. Chronione tym samym p_expected_rev co
-- każdy inny zapis.
-- ---------------------------------------------------------------------

CREATE FUNCTION "public"."game_state_set_lock"(
    "p_game_id" "uuid",
    "p_expected_rev" bigint,
    "p_lock_ms" integer
) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_row public.game_state;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.game_state where game_id = p_game_id for update;
  if not found then raise exception 'game_state not found'; end if;
  if p_expected_rev is not null and p_expected_rev <> v_row.rev then
    raise exception 'stale_write';
  end if;

  update public.game_state
  set locked_until = case when p_lock_ms > 0 then now() + (p_lock_ms::text || ' milliseconds')::interval else null end,
      updated_at = now()
  where game_id = p_game_id
  returning * into v_row;

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."game_state_set_lock" IS 'Ustawia locked_until PO potwierdzeniu głównego zapisu (control2/js/app.js's dispatchGated/advance liczą realny czas dźwięku z potwierdzonego sound_cue_key). Nie bumpuje rev poza tym, co robi zwykły update -- treść stanu się nie zmienia, tylko blokada.';

-- ---------------------------------------------------------------------
-- game_state_buzzer_press: to samo odrzucenie w trakcie blokady -- Buzzer
-- nie powinien rejestrować wciśnięcia, dopóki trwa dźwięk/animacja
-- poprzedniego przejścia (np. wjazd planszy rundy tuż przed r_duel).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."game_state_buzzer_press"(
    "p_game_id" "uuid",
    "p_key" "text",
    "p_team" "public"."game_team"
) RETURNS "public"."game_state"
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
