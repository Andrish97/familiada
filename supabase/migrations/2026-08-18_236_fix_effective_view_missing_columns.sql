-- Migracja 235 dodała kolumny rounds_score_a/rounds_score_b/final_points do
-- game_sessions, ale nie przeładowała game_sessions_effective. Widok z
-- "SELECT s.*" ma listę kolumn zamrożoną w momencie utworzenia — Postgres
-- NIE dociąga nowych kolumn bazowej tabeli automatycznie, trzeba go
-- jawnie odtworzyć. Efekt: get_stats_detail('gameplay') wybuchał
-- "column s.rounds_score_a does not exist".

-- CREATE OR REPLACE VIEW nie wystarczy: reguła Postgresa wymaga, żeby
-- wszystkie dotychczasowe kolumny zostały na tych samych pozycjach, a nowe
-- kolumny z "s.*" wstawiłyby się PRZED computed "effective_status" (który
-- był ostatni), przesuwając jego pozycję — trzeba więc odtworzyć widok
-- od zera.
DROP VIEW IF EXISTS "public"."game_sessions_effective";

CREATE VIEW "public"."game_sessions_effective" WITH ("security_invoker"='true') AS
SELECT
  s.*,
  CASE
    WHEN s.ended_at IS NULL
     AND s.status IN ('started', 'playing', 'final')
     AND now() - s.last_seen_at > interval '1 hour'
    THEN 'abandoned'
    ELSE s.status
  END AS "effective_status"
FROM public.game_sessions s;
