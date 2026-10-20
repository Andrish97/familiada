-- 404: E21 — centralny silnik reguł gry (docs/reguly-gier-transfer-plan.md §3, §8).
-- 1. Znaki odpowiedzi według czcionki Wyświetlacza font_5x7.json: te same
--    znaki co web/shared/fonts/display/font_5x7.json (wszystkie grupy poza
--    "meta"; zgodność pilnuje tests/unit/answerText.test.js) i ta sama reguła
--    co fonts.js:hasDisplayGlyph (NFC, jednoznakowa wielka litera).
-- 2. game_rules_compute: pełna lista braków (readiness), preparowana wymaga
--    min. 4 pkt na odpowiedź, akcja change_type = edit; transfer: export =
--    duplicate (także otwarta/zatrzymana ankieta jako szkic, drops_votes),
--    send tylko szkice, market bez transferu.
-- 3. Aktywna rozgrywka Control (sesja runtime niewygasła: godzina od ostatniej
--    aktywności operatora) blokuje edycję, reset, zmianę typu i zapis treści.
-- 4. Reset przy edycji = pełny reset ankiety (głosy, wpisy, sesje, zaproszenia,
--    kody QR, nowy klucz) -- wspólny z poll_abort i zmianą typu.
-- 5. game_change_type: zmiana typu tego samego rekordu przez bramkę edit.
-- 6. Walidacja zapisu treści z obu edytorów (pytanie ≤100, odpowiedź: znaki
--    z czcionki) -- tylko dla zmienianych tekstów, istniejące dane naprawia
--    migracja danych E21.
-- 7. Marketplace: zgłoszenie wymaga centralnej grywalności (play).

CREATE OR REPLACE FUNCTION public.fam_display_glyph_chars() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$ SELECT '╱╲▀▁▂▃▄▅▇▊▋▍▏▐▔▕▖▗▘▙▚▛▜▝▞▟■□▢▣⌜⌝⌞⌟◢◣◤◥Ѵ█░▒ЀЁЂЃЄЅІЇЈЉЊЋЌЍЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯҐ0123456789ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩABCDEFGHIJKLMNOPQRSTUVWXYZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞĀĂĄĆĈĊČĎĐĒĔĖĘĚĜĞĠĢĤĦĨĪĬĮİĲĴĶĹĻĽĿŁŃŅŇŊŌŎŐŒŔŖŘŚŜŞŠŢŤŦŨŪŬŮŰŲŴŶŸŹŻŽƑ+=×÷∗∘∙√∛∜∫<>∣∤∥∦∧∨∩∪≤≥⊂⊃⊄⊅¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⅟↉↊↋₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎²³¹⁰ⁱ⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ#%&*@^`|~¡¦§¨©ª¬®¯°±´¶·¸º¿ˆˇˊˋ˘˙˚˛˜‑‖‗†‡•‣‰‱‼‽⁇⁈⁉⁋⁘⁙⁚⁛⁜⁝⁞ℂℍℕ№ℙℚℝ™ℤ℮⍰⎴⎵�￾ẞ()[]{}〈〉-_‐‒–—―−"''«»‘’‚‛“”„‟‹›!,.:;?․‥…‧/\⁄∕∖ ←↑→↓⇖⇗⇘⇙$¢£¤¥€₴✓✗⧗'::text $f$;

CREATE OR REPLACE FUNCTION public.fam_display_has_glyph(p_ch text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT char_length(n) = 1
     AND (strpos(public.fam_display_glyph_chars(), n) > 0
          OR (char_length(upper(n)) = 1 AND strpos(public.fam_display_glyph_chars(), upper(n)) > 0))
  FROM (SELECT normalize(coalesce(p_ch, ''), NFC) AS n) s
$f$;

CREATE OR REPLACE FUNCTION public.fam_answer_invalid_chars(p text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT coalesce(array_agg(ch ORDER BY pos), '{}'::text[])
  FROM (
    SELECT ch, min(i) AS pos
    FROM regexp_split_to_table(normalize(coalesce(p, ''), NFC), '') WITH ORDINALITY AS t(ch, i)
    WHERE ch !~ '[\t\n\v\f\r    -     　﻿]'
      AND NOT public.fam_display_has_glyph(ch)
    GROUP BY ch
  ) s
$f$;

CREATE OR REPLACE FUNCTION public.fam_answer_clean(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT btrim(left(btrim(regexp_replace(coalesce(string_agg(ch, '' ORDER BY i), ''),
           '[\t\n\v\f\r    -     　﻿]+', ' ', 'g'), ' '), 17), ' ')
  FROM regexp_split_to_table(normalize(coalesce(p, ''), NFC), '') WITH ORDINALITY AS t(ch, i)
  WHERE ch ~ '[\t\n\v\f\r    -     　﻿]'
     OR public.fam_display_has_glyph(ch)
$f$;

-- Baza musi zamieniać na wielkie litery jak przeglądarka (lokalizacja UTF-8);
-- inaczej małe polskie/ukraińskie litery byłyby odrzucane.
DO $$
BEGIN
  IF NOT (public.fam_display_has_glyph('ą') AND public.fam_display_has_glyph('ż')
          AND public.fam_display_has_glyph('ї') AND public.fam_display_has_glyph('ґ')
          AND public.fam_display_has_glyph('a') AND NOT public.fam_display_has_glyph('😀')) THEN
    RAISE EXCEPTION 'fam_display_has_glyph: upper() w tej bazie nie obsługuje liter spoza ASCII';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.fam_display_glyph_chars(), public.fam_display_has_glyph(text),
  public.fam_answer_invalid_chars(text), public.fam_answer_clean(text) TO anon, authenticated;

-- Aktywna rozgrywka Control: niewygasła sesja runtime (expires_at przedłuża
-- control_runtime_session_touch o godzinę po aktywności operatora).
CREATE OR REPLACE FUNCTION public._game_control_active(p_game_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.control_runtime_sessions r
    WHERE r.game_id = p_game_id AND r.ended_at IS NULL AND r.expires_at > now()
  )
$f$;
-- wołana też przez guard_game_content (SECURITY INVOKER) z roli przeglądarki
REVOKE ALL ON FUNCTION public._game_control_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._game_control_active(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.game_rules_compute(p_game_id uuid, p_type text, p_status text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  c_qmin constant int := 10;
  c_amin constant int := 3;
  c_amax constant int := 6;
  c_pmin constant int := 4;
  c_sum  constant int := 100;
  c_ok   constant jsonb := '{"ok": true}'::jsonb;

  r record;
  v_qn int;
  v_is_poll boolean := p_type in ('poll_text', 'poll_points');
  v_scored boolean := p_type in ('prepared', 'market');
  v_issues jsonb := '[]'::jsonb;  -- braki gotowości typu, w kolejności pytań
  v_issue jsonb;
  v_minq jsonb;
  v_struct jsonb;
  v_points jsonb;
  v_content_poll jsonb;
  v_edit jsonb;
  v_play jsonb;
  v_poll_entry jsonb;
  v_poll_open jsonb;
  v_export jsonb;
  v_send jsonb;
  v_poll_stop jsonb;
  v_poll_resume jsonb;
begin
  select count(*)::int into v_qn from public.questions where game_id = p_game_id;
  if v_qn < c_qmin then
    v_minq := jsonb_build_object('ok', false, 'code', 'minQuestions',
      'params', jsonb_build_object('min', c_qmin, 'n', v_qn));
    v_issues := v_issues || jsonb_build_array(v_minq - 'ok');
  end if;

  for r in
    select q.ord,
           count(a.id)::int as cnt,
           coalesce(min(a.fixed_points), 0)::int as minp,
           coalesce(max(a.fixed_points), 0)::int as maxp,
           coalesce(sum(a.fixed_points), 0)::int as sump
    from public.questions q
    left join public.answers a on a.question_id = q.id
    where q.game_id = p_game_id
    group by q.id, q.ord
    order by q.ord
  loop
    v_issue := null;
    if r.cnt < c_amin or r.cnt > c_amax then
      v_issue := jsonb_build_object('code', 'answersRange',
        'params', jsonb_build_object('ord', r.ord, 'min', c_amin, 'max', c_amax, 'n', r.cnt));
      v_struct := coalesce(v_struct, v_issue || '{"ok": false}');
    end if;
    if v_scored then
      v_issue := coalesce(v_issue, case
        when r.minp < 0 then jsonb_build_object('code', 'negativePoints', 'params', jsonb_build_object('ord', r.ord))
        when r.maxp > 100 then jsonb_build_object('code', 'answerOver100', 'params', jsonb_build_object('ord', r.ord))
        when r.minp < c_pmin then jsonb_build_object('code', 'answerMinPoints', 'params', jsonb_build_object('ord', r.ord, 'min', c_pmin))
        when r.sump > c_sum then jsonb_build_object('code', 'sumTooBig', 'params', jsonb_build_object('ord', r.ord, 'max', c_sum, 'sum', r.sump))
      end);
      if v_issue is not null then
        v_points := coalesce(v_points, v_issue || '{"ok": false}');
      end if;
    end if;
    -- ankieta tekstowa nie potrzebuje odpowiedzi; punktowa -- 3..6
    if v_issue is not null and p_type <> 'poll_text' then
      v_issues := v_issues || jsonb_build_array(v_issue);
    end if;
  end loop;

  v_content_poll := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when v_minq is not null then v_minq
    when p_type = 'poll_points' and v_struct is not null then v_struct
    else c_ok
  end;

  v_edit := case
    when p_type = 'prepared' then jsonb_build_object('ok', true, 'needs_reset', false)
    when p_type = 'market' then jsonb_build_object('ok', false, 'code', 'marketNoEdit')
    when p_status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollOpenNoEdit')
    when p_status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStoppedNoEdit')
    when p_status = 'ready' then jsonb_build_object('ok', true, 'needs_reset', true)
    else jsonb_build_object('ok', true, 'needs_reset', false)
  end;

  v_play := case
    when v_is_poll and p_status <> 'ready' then jsonb_build_object('ok', false, 'code', 'playAfterPoll')
    when v_is_poll then c_ok
    when v_scored then coalesce(v_minq, v_points, c_ok)
    else jsonb_build_object('ok', false, 'code', 'unknownType')
  end;

  v_poll_entry := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when p_status in ('poll_open', 'poll_stopped', 'ready') then c_ok
    else v_content_poll
  end;

  v_poll_open := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when p_status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollAlreadyOpen')
    when p_status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStopped')
    else v_content_poll
  end;

  -- Transfer (plik, Powiel): trzy typy źródłowe w każdym stanie; otwarta/
  -- zatrzymana ankieta przechodzi jako szkic bez bieżących głosów (drops_votes
  -- -- UI ostrzega). Kopia market -- żadnego transferu. Wyślij: tylko szkice
  -- (preparowana zawsze jest szkicem treści), bez zamkniętych ankiet.
  v_export := case
    when p_type = 'market' then jsonb_build_object('ok', false, 'code', 'marketNoTransfer')
    when p_type not in ('prepared', 'poll_text', 'poll_points') then jsonb_build_object('ok', false, 'code', 'unknownType')
    when v_is_poll and p_status in ('poll_open', 'poll_stopped') then jsonb_build_object('ok', true, 'drops_votes', true)
    else c_ok
  end;
  v_send := case
    when p_type = 'market' then jsonb_build_object('ok', false, 'code', 'marketNoTransfer')
    when p_type not in ('prepared', 'poll_text', 'poll_points') then jsonb_build_object('ok', false, 'code', 'unknownType')
    when v_is_poll and p_status <> 'draft' then jsonb_build_object('ok', false, 'code', 'sendOnlyDraft')
    else c_ok
  end;

  v_poll_stop := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when p_status = 'poll_open' then c_ok
    else jsonb_build_object('ok', false, 'code', 'stopOnlyOpen')
  end;

  v_poll_resume := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when p_status = 'poll_stopped' then c_ok
    else jsonb_build_object('ok', false, 'code', 'resumeOnlyStopped')
  end;

  return jsonb_build_object(
    'rules', jsonb_build_object('qn_min', c_qmin, 'an_min', c_amin, 'an_max', c_amax,
                                'pts_min', c_pmin, 'sum_max', c_sum),
    'readiness', jsonb_build_object('ok', jsonb_array_length(v_issues) = 0, 'issues', v_issues),
    'edit', v_edit,
    'change_type', v_edit,
    'play', v_play,
    'poll_entry', v_poll_entry,
    'poll_open', v_poll_open,
    'export', v_export,
    'duplicate', v_export,
    'send', v_send,
    'poll_stop', v_poll_stop,
    'poll_resume', v_poll_resume
  );
end;
$$;

-- Dynamiczne części reguł (poza cache rules_state): aktywna rozgrywka Control.
CREATE OR REPLACE FUNCTION public.game_validate(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_uid uuid := auth.uid();
  g record;
  v_out jsonb;
  v_locked constant jsonb := '{"ok": false, "code": "controlActive"}'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, type::text as type, status::text as status, updated_at into g
  from public.games where id = p_game_id and owner_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_out := public.game_rules_compute(g.id, g.type, g.status);
  if public._game_control_active(g.id) then
    if coalesce((v_out->'edit'->>'ok')::boolean, false) then
      v_out := v_out || jsonb_build_object('edit', v_locked, 'change_type', v_locked);
    end if;
  end if;

  return v_out || jsonb_build_object(
    'ok', true,
    'game', jsonb_build_object('id', g.id, 'type', g.type, 'status', g.status, 'rev', g.updated_at),
    'poll_close', public.game_poll_close_check(g.id)
  );
end;
$$;

-- Pełny reset uruchomienia ankiety: głosy, surowe wpisy, sesje, zaproszenia,
-- kody QR, nowy klucz (stare linki przestają działać), status draft, punkty 0.
-- Treść pytań i odpowiedzi zostaje. Szkic podliczania i ended_key czyści
-- trigger games_poll_state_reset przy przejściu na draft.
CREATE OR REPLACE FUNCTION public._game_poll_reset(p_game_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_key text := public.gen_share_key(18);
BEGIN
  DELETE FROM public.poll_votes WHERE game_id = p_game_id;
  DELETE FROM public.poll_text_entries WHERE game_id = p_game_id;
  DELETE FROM public.poll_sessions WHERE game_id = p_game_id;
  DELETE FROM public.poll_tasks WHERE game_id = p_game_id;
  DELETE FROM public.device_connect_codes WHERE game_id = p_game_id AND device_type = 'poll_qr';

  UPDATE public.games
     SET status = 'draft', poll_opened_at = NULL, poll_closed_at = NULL,
         share_key_poll = v_key, poll_share_updated_at = now(), updated_at = now()
   WHERE id = p_game_id;

  UPDATE public.answers a
     SET fixed_points = 0
    FROM public.questions q
   WHERE q.id = a.question_id AND q.game_id = p_game_id AND a.fixed_points <> 0;

  RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION public._game_poll_reset(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.poll_abort(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_type text;
  v_status text;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
    RAISE EXCEPTION 'poll_not_abortable';
  END IF;

  RETURN jsonb_build_object('ok', true, 'share_key_poll', public._game_poll_reset(p_game_id));
END $$;

-- Wspólna bramka edycji (lista Gier, edytor, zmiana typu): zamknięta ankieta
-- wymaga potwierdzonego resetu; otwarta/zatrzymana, market i aktywny Control -- odmowa.
CREATE OR REPLACE FUNCTION public.game_reset_poll_for_edit(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_uid uuid := auth.uid();
  v_game record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, type, status into v_game
  from public.games where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  if public._game_control_active(p_game_id) then
    return jsonb_build_object('ok', false, 'error', 'control_active');
  end if;
  if v_game.status = 'poll_open' then
    return jsonb_build_object('ok', false, 'error', 'poll_open');
  end if;
  if v_game.status = 'poll_stopped' then
    return jsonb_build_object('ok', false, 'error', 'poll_stopped');
  end if;
  if v_game.type not in ('poll_text', 'poll_points') or v_game.status <> 'ready' then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  perform public._game_poll_reset(p_game_id);
  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

-- Zmiana typu tego samego rekordu (plan §4 „Zmiana typu gry”): ta sama bramka
-- co edit; zamknięta ankieta tylko z p_reset (ten sam reset co edytor); wynik
-- to szkic wybranego typu. Gotowość nie blokuje -- braki pokaże silnik reguł.
CREATE OR REPLACE FUNCTION public.game_change_type(p_game_id uuid, p_type text, p_reset boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_uid uuid := auth.uid();
  g record;
  v_edit jsonb;
  v_removed int := 0;
  v_cleared int := 0;
  v_reset boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_type is null or p_type not in ('prepared', 'poll_points', 'poll_text') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  select id, type::text as type, status::text as status into g
  from public.games where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  v_edit := public.game_rules_compute(g.id, g.type, g.status)->'edit';
  if not coalesce((v_edit->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'edit_blocked', 'code', v_edit->>'code');
  end if;
  if public._game_control_active(g.id) then
    return jsonb_build_object('ok', false, 'error', 'edit_blocked', 'code', 'controlActive');
  end if;
  if coalesce((v_edit->>'needs_reset')::boolean, false) then
    if not coalesce(p_reset, false) then
      return jsonb_build_object('ok', false, 'error', 'needs_reset');
    end if;
    perform public._game_poll_reset(g.id);
    v_reset := true;
  end if;

  if p_type = g.type then
    return jsonb_build_object('ok', true, 'changed', v_reset, 'type', g.type, 'reset', v_reset);
  end if;

  if p_type = 'poll_text' then
    delete from public.answers a using public.questions q
     where q.id = a.question_id and q.game_id = g.id;
    get diagnostics v_removed = row_count;
  elsif p_type = 'poll_points' then
    update public.answers a set fixed_points = 0
      from public.questions q
     where q.id = a.question_id and q.game_id = g.id and a.fixed_points <> 0;
    get diagnostics v_cleared = row_count;
  end if;

  update public.games
     set type = p_type::public.game_type, status = 'draft',
         poll_opened_at = null, poll_closed_at = null, updated_at = now()
   where id = g.id;

  return jsonb_build_object('ok', true, 'changed', true, 'type', p_type, 'reset', v_reset,
                            'removed_answers', v_removed, 'cleared_points', v_cleared);
end;
$$;
REVOKE ALL ON FUNCTION public.game_change_type(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.game_change_type(uuid, text, boolean) TO authenticated;

-- Zapis treści prosto z przeglądarki: blokady stanu + aktywny Control.
CREATE OR REPLACE FUNCTION public.guard_game_content() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare
  v_game_id uuid;
  v_type text;
  v_status text;
begin
  -- tylko zapisy prosto z przeglądarki; SECURITY DEFINER i kaskady -> owner
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'questions' then
    v_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  else
    select q.game_id into v_game_id
    from public.questions q
    where q.id = case when tg_op = 'DELETE' then old.question_id else new.question_id end;
  end if;

  select g.type::text, g.status::text into v_type, v_status
  from public.games g where g.id = v_game_id;
  if not found then
    return coalesce(new, old);
  end if;

  if v_type = 'market' then
    raise exception 'game_content_locked:market' using errcode = 'P0001';
  end if;
  if v_type in ('poll_text', 'poll_points') and v_status in ('poll_open', 'poll_stopped') then
    raise exception 'game_content_locked:%', v_status using errcode = 'P0001';
  end if;
  if public._game_control_active(v_game_id) then
    raise exception 'game_content_locked:control_active' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

-- Walidacja zmienianych tekstów z obu edytorów (gra: questions/answers,
-- bazy: qb_questions.payload). Kody: content_invalid:<kod>[:<znaki>].
CREATE OR REPLACE FUNCTION public.guard_game_text() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare
  v_bad text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.text is not distinct from old.text then
    return new;
  end if;
  if tg_table_name = 'questions' then
    if char_length(new.text) > 100 then
      raise exception 'content_invalid:questionTooLong' using errcode = 'P0001';
    end if;
  else
    v_bad := public.fam_answer_invalid_chars(new.text);
    if cardinality(v_bad) > 0 then
      raise exception 'content_invalid:answerChars:%', array_to_string(v_bad, ' ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_guard_game_text ON public.questions;
CREATE TRIGGER trg_guard_game_text BEFORE INSERT OR UPDATE OF text ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.guard_game_text();
DROP TRIGGER IF EXISTS trg_guard_game_text ON public.answers;
CREATE TRIGGER trg_guard_game_text BEFORE INSERT OR UPDATE OF text ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.guard_game_text();

CREATE OR REPLACE FUNCTION public.guard_qb_question_text() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare
  a jsonb;
  v_bad text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.payload is not distinct from old.payload then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.payload->'text' is not distinct from old.payload->'text'
     and new.payload->'answers' is not distinct from old.payload->'answers' then
    return new;
  end if;
  if char_length(coalesce(new.payload->>'text', '')) > 100 then
    raise exception 'content_invalid:questionTooLong' using errcode = 'P0001';
  end if;
  if jsonb_typeof(new.payload->'answers') = 'array' then
    for a in select value from jsonb_array_elements(new.payload->'answers') loop
      if char_length(coalesce(a->>'text', '')) > 17 then
        raise exception 'content_invalid:answerTooLong' using errcode = 'P0001';
      end if;
      v_bad := public.fam_answer_invalid_chars(a->>'text');
      if cardinality(v_bad) > 0 then
        raise exception 'content_invalid:answerChars:%', array_to_string(v_bad, ' ') using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_guard_qb_question_text ON public.qb_questions;
CREATE TRIGGER trg_guard_qb_question_text BEFORE INSERT OR UPDATE OF payload ON public.qb_questions
  FOR EACH ROW EXECUTE FUNCTION public.guard_qb_question_text();

-- Marketplace: zgłoszenie przez centralną regułę play (zamiast game_action_state).
CREATE OR REPLACE FUNCTION "public"."market_submit_game"("p_game_id" "uuid", "p_title" "text", "p_description" "text", "p_lang" "text", "p_payload" "jsonb") RETURNS TABLE("ok" boolean, "err" "text", "market_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_game public.games%rowtype;
  v_can_play boolean;
  v_payload jsonb;
  v_new uuid;
  v_ntfy_topic text;
begin
  if v_uid is null then return query select false, 'not_authenticated', null::uuid; return; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game
  from public.games
  where id = p_game_id
    and owner_id = v_uid
    and source_market_id is null
    and is_demo = false;

  if not found then return query select false, 'game_not_found', null::uuid; return; end if;

  if exists (
    select 1 from public.market_games
    where author_user_id = v_uid
      and source_game_id = p_game_id
      and status in ('pending', 'published')
  ) then
    return query select false, 'already_submitted', null::uuid; return;
  end if;

  -- E21: centralna grywalność (preparowana gotowa albo zamknięta ankieta)
  v_can_play := coalesce((public.game_rules_compute(v_game.id, v_game.type::text, v_game.status::text)
                          -> 'play' ->> 'ok')::boolean, false);
  if v_game.type not in ('prepared', 'poll_text', 'poll_points') or not v_can_play then
    return query select false, 'game_not_playable', null::uuid; return;
  end if;

  if p_lang not in ('pl', 'en', 'uk') then return query select false, 'invalid_lang', null::uuid; return; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    return query select false, 'invalid_title', null::uuid; return;
  end if;
  if char_length(btrim(coalesce(p_description, ''))) > 500 then
    return query select false, 'invalid_description', null::uuid; return;
  end if;

  select jsonb_build_object(
    'game', jsonb_build_object(
      'name', v_game.name,
      'type', case
        when v_game.status = 'ready' and v_game.type in ('poll_text', 'poll_points') then 'prepared'
        else v_game.type::text
      end
    ),
    'questions', coalesce(jsonb_agg(
      jsonb_build_object(
        'text', q.text,
        'answers', coalesce((
          select jsonb_agg(
            jsonb_build_object('text', a.text, 'fixed_points', a.fixed_points)
            order by a.ord
          )
          from public.answers a where a.question_id = q.id
            -- snapshot preparowany z zamkniętej ankiety: tylko punktowane odpowiedzi
            and (v_game.type = 'prepared' or a.fixed_points > 0)
        ), '[]'::jsonb)
      ) order by q.ord
    ), '[]'::jsonb)
  ) into v_payload
  from public.questions q
  where q.game_id = p_game_id;

  if jsonb_array_length(v_payload -> 'questions') < 10 then
    return query select false, 'too_few_questions', null::uuid; return;
  end if;

  insert into public.market_games
    (author_user_id, source_game_id, title, description, lang, status, payload)
  values
    (v_uid, p_game_id, btrim(p_title), btrim(coalesce(p_description, '')), p_lang, 'pending', v_payload)
  returning id into v_new;

  begin
    select value into v_ntfy_topic from public.app_config where key = 'ntfy_topic';
    if v_ntfy_topic is not null and v_ntfy_topic <> '' then
      perform net.http_post(
        url := 'https://ntfy.sh/' || v_ntfy_topic,
        body := jsonb_build_object(
          'title', 'Nowe zgłoszenie (' || p_lang || ')',
          'message', btrim(p_title),
          'priority', 3
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    null;
  end;

  return query select true, null::text, v_new;
end;
$$;

-- Odśwież cache reguł (nowe pola readiness/change_type, próg 4 pkt) bez
-- wyzwalaczy: bez zmiany updated_at i bez blokady oczekujących kopii.
SET LOCAL session_replication_role = replica;
UPDATE public.games SET rules_state = public.game_rules_compute(id, type::text, status::text);
SET LOCAL session_replication_role = origin;
