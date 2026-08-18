-- Sesje ze statusem 'final' (host dotarł do finału) nigdy nie były
-- automatycznie oznaczane jako 'abandoned' po godzinie ciszy — próg
-- 1h z migracji 231 obejmował tylko status IN ('started','playing').
-- Efekt: gra porzucona w trakcie finału pokazywała się w panelu jako
-- "w trakcie" bezterminowo. Dodajemy 'final' do sprawdzanych statusów.

CREATE OR REPLACE VIEW "public"."game_sessions_effective" WITH ("security_invoker"='true') AS
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
