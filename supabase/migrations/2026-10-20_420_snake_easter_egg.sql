-- 420: ukryta gra w węża (decyzja użytkownika 2026-10-20). Wejście z kodu QR
-- na kadrze strony ankiet (strona główna) -- demo-ankieta nie istnieje, więc
-- /go/ prowadzi do /snake/. Zbieramy: zeskanowanie (scan), wejście na stronę
-- gry (enter), start gry (start) i koniec gry z wynikiem (finish). Zalogowani
-- mają zapisany postęp (najlepszy wynik, liczba gier). Statystyki dla admina
-- tylko przez Worker (service_role).
--   visitor -- losowy identyfikator przeglądarki (localStorage), do liczenia
--              unikalnych osób; testy e2e używają prefiksu "e2e-" (pomijane
--              w statystykach).
--   score   -- liczba zjedzonych jabłek; plansza ma 30x10 pól, więc <= 300.

CREATE TABLE public.snake_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('scan','enter','start','finish')),
  visitor text NOT NULL CHECK (visitor ~ '^[A-Za-z0-9_-]{8,64}$'),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  score integer CHECK (score BETWEEN 0 AND 300),
  lang text CHECK (lang IN ('pl','en','uk'))
);
CREATE INDEX snake_events_created_idx ON public.snake_events (created_at);
CREATE INDEX snake_events_visitor_idx ON public.snake_events (visitor, created_at);
ALTER TABLE public.snake_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.snake_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snake_events TO service_role;

CREATE TABLE public.snake_progress (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  best_score integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  total_score bigint NOT NULL DEFAULT 0,
  best_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.snake_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.snake_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snake_progress TO service_role;

-- Zapis zdarzenia. Zwraca postęp zalogowanego (best/games) albo tylko ok.
-- Limit: 120 zdarzeń na przeglądarkę w 10 minut (gra trwa zwykle dłużej niż 10 s).
CREATE FUNCTION public.snake_log(p_kind text, p_visitor text, p_score integer DEFAULT NULL, p_lang text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_score integer;
  v_row public.snake_progress;
BEGIN
  IF p_kind NOT IN ('scan','enter','start','finish') OR coalesce(p_visitor, '') !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  IF (SELECT count(*) FROM public.snake_events
      WHERE visitor = p_visitor AND created_at > now() - interval '10 minutes') >= 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;
  IF v_uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    v_uid := NULL;
  END IF;
  v_score := CASE WHEN p_kind = 'finish' THEN least(greatest(coalesce(p_score, 0), 0), 300) END;
  INSERT INTO public.snake_events (kind, visitor, user_id, score, lang)
  VALUES (p_kind, p_visitor, v_uid, v_score, CASE WHEN p_lang IN ('pl','en','uk') THEN p_lang END);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF p_kind = 'finish' THEN
    INSERT INTO public.snake_progress AS sp (user_id, best_score, games, total_score, best_at)
    VALUES (v_uid, v_score, 1, v_score, now())
    ON CONFLICT (user_id) DO UPDATE SET
      games = sp.games + 1,
      total_score = sp.total_score + EXCLUDED.total_score,
      best_at = CASE WHEN EXCLUDED.best_score > sp.best_score THEN now() ELSE sp.best_at END,
      best_score = greatest(sp.best_score, EXCLUDED.best_score),
      updated_at = now()
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.snake_progress WHERE user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true, 'best', coalesce(v_row.best_score, 0), 'games', coalesce(v_row.games, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.snake_log(text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snake_log(text, text, integer, text) TO anon, authenticated, service_role;

-- Statystyki dla panelu admina (przez Worker).
CREATE FUNCTION public.get_admin_snake_stats()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH ev AS (
    SELECT e.*, (e.created_at AT TIME ZONE 'Europe/Warsaw')::date AS day
    FROM public.snake_events e
    WHERE e.visitor NOT LIKE 'e2e-%'
      AND (e.user_id IS NULL OR e.user_id NOT IN (SELECT user_id FROM public.stats_exclusions_effective))
  ), today AS (SELECT (now() AT TIME ZONE 'Europe/Warsaw')::date AS d),
  kinds AS (
    SELECT k.kind, jsonb_build_object(
      'total', count(ev.id),
      'today', count(ev.id) FILTER (WHERE ev.day = (SELECT d FROM today)),
      'last_7d', count(ev.id) FILTER (WHERE ev.day > (SELECT d FROM today) - 7),
      'visitors', count(DISTINCT ev.visitor)) AS v
    FROM unnest(ARRAY['scan','enter','start','finish']) AS k(kind)
    LEFT JOIN ev ON ev.kind = k.kind
    GROUP BY k.kind
  ), days AS (
    SELECT g.d::date AS day FROM generate_series((SELECT d FROM today) - 13, (SELECT d FROM today), interval '1 day') AS g(d)
  )
  SELECT jsonb_build_object(
    'kinds', (SELECT jsonb_object_agg(kind, v) FROM kinds),
    'scores', (SELECT jsonb_build_object('max', coalesce(max(score), 0), 'avg', coalesce(round(avg(score), 1), 0))
               FROM ev WHERE kind = 'finish'),
    'players', (SELECT count(*) FROM public.snake_progress sp
                WHERE sp.user_id NOT IN (SELECT user_id FROM public.stats_exclusions_effective)),
    'top', (SELECT coalesce(jsonb_agg(t ORDER BY t.best DESC, t.best_at), '[]'::jsonb) FROM (
              SELECT p.username, sp.best_score AS best, sp.games, sp.best_at
              FROM public.snake_progress sp JOIN public.profiles p ON p.id = sp.user_id
              WHERE sp.user_id NOT IN (SELECT user_id FROM public.stats_exclusions_effective)
              ORDER BY sp.best_score DESC, sp.best_at LIMIT 10) t),
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', days.day,
                'scan', (SELECT count(*) FROM ev WHERE ev.day = days.day AND kind = 'scan'),
                'enter', (SELECT count(*) FROM ev WHERE ev.day = days.day AND kind = 'enter'),
                'start', (SELECT count(*) FROM ev WHERE ev.day = days.day AND kind = 'start')) ORDER BY days.day)
              FROM days)
  );
$$;
REVOKE ALL ON FUNCTION public.get_admin_snake_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_snake_stats() TO service_role;

NOTIFY pgrst, 'reload schema';
