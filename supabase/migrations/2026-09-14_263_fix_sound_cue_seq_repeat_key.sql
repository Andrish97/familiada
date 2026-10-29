-- game_state_write: sound_cue_seq ma się zwiększać przy KAŻDYM zapisie, który
-- niesie p_sound_cue_key, nie tylko gdy różni się od poprzedniego klucza.
--
-- Zgłoszony bug ("nie każde odsłonięcie odtwarza dźwięk", "3s licznik nie
-- gra dźwięku pudła"): dwa kolejne, RÓŻNE zdarzenia w grze (np. dwa kolejne
-- trafienia z rzędu, albo pudło z 3s zegarka tuż po ręcznym pudle) często
-- niosą DOKŁADNIE TEN SAM klucz dźwięku (np. "answer_correct" dwa razy albo
-- "answer_wrong" dwa razy) — poprzednia reguła ("rośnie TYLKO gdy nowy klucz
-- różni się od poprzedniego") świadomie zakładała, że taki przypadek nie
-- wymaga nowego dźwięku, ale to było błędne założenie: dwa RÓŻNE zdarzenia w
-- grze (dwie różne odpowiedzi, dwa różne pudła) zawsze mają zagrać dźwięk
-- osobno, nawet jeśli akurat mają ten sam klucz. shared/deriveEvents.js's
-- SOUND_CUE event odpala się wyłącznie na zmianę sound_cue_seq (nigdy na
-- sam sound_cue_key, bo ten sam klucz nie zawsze oznacza to samo zdarzenie)
-- — więc bez tej poprawki drugie z pary zdarzeń o tym samym kluczu nigdy nie
-- dostawało własnego SOUND_CUE i milczało.
--
-- Odpowiednik po stronie klienta (control2/js/store.js's optymistyczny
-- emit PRZED potwierdzeniem zapisu) poprawiony w tym samym commit, tą samą
-- regułą — musi liczyć identycznie, inaczej dwie strony (optymistyczna i
-- potwierdzona) rozjadą się i re-render po potwierdzeniu zagra dźwięk
-- ponownie.

CREATE OR REPLACE FUNCTION "public"."game_state_write"(
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
