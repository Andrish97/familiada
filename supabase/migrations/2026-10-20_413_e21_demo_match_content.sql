-- 413: E21 — decyzja użytkownika 2026-10-20: nieedytowane kopie demo mają
-- być zgodne z pierwotną (obecną) wersją demo, edytowane — naprawione „ładnie”
-- (411). Odczyt db-read: kopie preparowanej dopasowane po nazwie 122 z 125
-- -- kopia ze zmienioną samą nazwą (treść nietknięta) wypadała z poprawki.
-- e21_demo_repair dopasowuje teraz po typie i treści (pytania, odpowiedzi,
-- punkty), bez nazwy; reszta jak w 409. Bazy demo: 9 z 26 różnych po mapie
-- 298 (411) ma pytania jak szablon, 17 edytowanych -- naprawa 411.

CREATE OR REPLACE FUNCTION public.e21_demo_repair(p_skip uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  r record;
  v_new jsonb;
  v_n_old int;
  v_vote jsonb;
  v_qid uuid;
  v_sid uuid;
  v_aid uuid;
  v_pick int;
  v_raw text;
  v_tok text;
  j int; q int;
  v_prepared int := 0; v_answers int := 0; v_points int := 0; v_text int := 0; v_skipped int := 0;
BEGIN
  FOR r IN
    -- nieedytowana = ta sama treść co szablon (typ, pytania, odpowiedzi,
    -- punkty); nazwa gry bez znaczenia (413)
    SELECT DISTINCT ON (g.id) g.id, g.type::text AS type, g.status::text AS status, b.slot, b.payload AS old_payload
    FROM public.games g
    JOIN public.e21_demo_templates_before b ON b.payload->'game'->>'type' = g.type::text
    WHERE g.is_demo
      AND ((b.slot = 'prepared' AND g.status = 'draft')
        OR (b.slot IN ('poll_points_open', 'poll_text_open') AND g.status IN ('poll_open', 'poll_stopped')))
      AND public.e21_demo_game_content(g.id) = public.e21_demo_template_content(b.payload)
    ORDER BY g.id, b.lang
  LOOP
    IF r.id = ANY (p_skip) THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    IF r.slot = 'prepared' THEN
      DELETE FROM public.answers a USING public.questions qq
      WHERE qq.id = a.question_id AND qq.game_id = r.id AND a.fixed_points < 4;
      GET DIAGNOSTICS j = ROW_COUNT;
      v_answers := v_answers + j;
      v_prepared := v_prepared + 1;
      CONTINUE;
    END IF;

    -- ankiety: tylko głosy demo, wszystkie pełne w bieżącym uruchomieniu
    v_n_old := jsonb_array_length(coalesce(r.old_payload->'votes', '[]'));
    IF v_n_old = 0
       OR EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.game_id = r.id AND v.voter_token NOT LIKE 'demo_seed_v%')
       OR EXISTS (SELECT 1 FROM public.poll_text_entries e WHERE e.game_id = r.id AND e.voter_token NOT LIKE 'demo_seed_v%')
       OR public._poll_full_submissions(r.id) <> v_n_old THEN
      CONTINUE;
    END IF;
    v_new := public.e21_demo_fixed_payload(r.slot, r.old_payload);
    FOR j IN (v_n_old + 1)..jsonb_array_length(v_new->'votes') LOOP
      v_vote := v_new->'votes'->(j - 1);
      v_tok := 'demo_seed_v' || lpad(j::text, 4, '0');
      FOR q IN 1..jsonb_array_length(v_new->'questions') LOOP
        SELECT qq.id INTO v_qid FROM public.questions qq WHERE qq.game_id = r.id AND qq.ord = q;
        SELECT ls.poll_session_id INTO v_sid FROM public._poll_latest_sessions(r.id) ls WHERE ls.question_id = v_qid;
        IF r.slot = 'poll_points_open' THEN
          v_pick := (v_vote->'picks'->>(q - 1))::int;
          SELECT a.id INTO v_aid FROM public.answers a WHERE a.question_id = v_qid AND a.ord = v_pick + 1;
          INSERT INTO public.poll_votes (game_id, question_ord, answer_ord, voter_token, poll_session_id, question_id, answer_id)
          VALUES (r.id, q, v_pick + 1, v_tok, v_sid, v_qid, v_aid);
        ELSE
          v_raw := v_vote->'answers_raw'->>(q - 1);
          INSERT INTO public.poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
          VALUES (r.id, v_sid, v_qid, v_tok, v_raw, lower(regexp_replace(trim(v_raw), '\s+', ' ', 'g')));
        END IF;
      END LOOP;
    END LOOP;
    IF r.slot = 'poll_points_open' THEN v_points := v_points + 1; ELSE v_text := v_text + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('demo_prepared_games', v_prepared, 'demo_prepared_answers_removed', v_answers,
    'demo_points_polls_filled', v_points, 'demo_text_polls_filled', v_text, 'demo_skipped_active_control', v_skipped);
END $$;
REVOKE ALL ON FUNCTION public.e21_demo_repair(uuid[]) FROM PUBLIC, anon, authenticated;
