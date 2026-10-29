-- Jednorazowe uzupełnienie game_sessions danymi sprzed wdrożenia realnego
-- śledzenia rozgrywek, żeby panel admina mógł czytać JEDNĄ tabelę zamiast
-- sklejać dwa różne źródła.
--
-- Ważne ograniczenie (świadome, zaakceptowane): device_presence trzyma
-- tylko OSTATNI moment, gdy ekran danej gry był otwarty — nie ma w niej
-- historii poszczególnych rozgrywek. Więc dla gry granej wielokrotnie
-- przed wdrożeniem dostajemy najwyżej JEDEN wpis "legacy" (ostatnia
-- znana aktywność), a nie osobny wpis za każdą dawną rozgrywkę. Reszta
-- pól (rundy, wynik, zwycięzca) zostaje pusta/nieznana — to nie jest
-- błąd, tylko granica tego, co faktycznie było kiedyś zapisywane.

ALTER TABLE "public"."game_sessions"
  DROP CONSTRAINT "game_sessions_status_check";

ALTER TABLE "public"."game_sessions"
  ADD CONSTRAINT "game_sessions_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'playing'::"text", 'final'::"text", 'won'::"text", 'lost'::"text", 'abandoned'::"text", 'error'::"text", 'legacy'::"text"])));

INSERT INTO "public"."game_sessions" ("game_id", "started_at", "last_seen_at", "ended_at", "status", "client_meta")
SELECT
  dp.game_id,
  dp.last_seen,
  dp.last_seen,
  dp.last_seen,
  'legacy',
  '{"source":"device_presence_backfill"}'::jsonb
FROM (
  SELECT game_id, max(last_seen_at) AS last_seen
  FROM public.device_presence
  WHERE device_type = 'display'
  GROUP BY game_id
) dp
JOIN public.games g ON g.id = dp.game_id AND g.is_demo = false
WHERE NOT EXISTS (
  SELECT 1 FROM public.game_sessions gs WHERE gs.game_id = dp.game_id
);
