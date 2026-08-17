-- Rozszerzenie game_sessions o wynik końcowy + bezpiecznik na sesje,
-- które nigdy nie dostały statusu końcowego (np. przeglądarka padła,
-- karta została zabita przez system zanim zdążyliśmy wysłać "porzucona").
--
-- Ważna korekta założeń z poprzedniej migracji: stan gry w control/js
-- (store.js) jest CELOWO czyszczony przy każdym wejściu na stronę
-- (store.hydrate() -> localStorage.removeItem), więc odświeżenie strony
-- w trakcie gry nie "przywraca" starej sesji - to i tak nowy start.
-- Realne ryzyko "wiecznej" sesji to wyłącznie przypadki, w których
-- żaden kod klienta nie zdążył się wykonać (crash karty, zabita karta
-- w tle, utrata zasilania) - stąd rozwiązanie czysto po stronie bazy,
-- bez zmian w kliencie.

ALTER TABLE "public"."game_sessions"
  ADD COLUMN "winner_team" "text",
  ADD COLUMN "team_a_score" integer,
  ADD COLUMN "team_b_score" integer;

ALTER TABLE "public"."game_sessions"
  ADD CONSTRAINT "game_sessions_winner_team_check" CHECK (("winner_team" = ANY (ARRAY['A'::"text", 'B'::"text"])) OR "winner_team" IS NULL);

ALTER TABLE "public"."game_sessions"
  ADD CONSTRAINT "game_sessions_scores_check" CHECK (("team_a_score" IS NULL OR "team_a_score" >= 0) AND ("team_b_score" IS NULL OR "team_b_score" >= 0));

-- game_session_end: dodane opcjonalne pola wyniku (bez utraty zgodności —
-- stare wywołania z 3 argumentami przestają istnieć jako osobna funkcja,
-- więc najpierw usuwamy starą sygnaturę, żeby nie zostawić martwej wersji
-- obok nowej, tak jak w migracji 224).
DROP FUNCTION IF EXISTS "public"."game_session_end"("uuid", "text", "text");

CREATE FUNCTION "public"."game_session_end"(
    "p_session_id" "uuid",
    "p_status" "text",
    "p_error_message" "text" DEFAULT NULL::"text",
    "p_winner_team" "text" DEFAULT NULL::"text",
    "p_team_a_score" integer DEFAULT NULL::integer,
    "p_team_b_score" integer DEFAULT NULL::integer
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
begin
  select g.owner_id into v_owner
  from public.game_sessions s
  join public.games g on g.id = s.game_id
  where s.id = p_session_id;

  if not found then raise exception 'session not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_sessions
  set
    ended_at = now(),
    last_seen_at = now(),
    status = p_status,
    error_message = coalesce(p_error_message, error_message),
    winner_team = coalesce(p_winner_team, winner_team),
    team_a_score = coalesce(p_team_a_score, team_a_score),
    team_b_score = coalesce(p_team_b_score, team_b_score)
  where id = p_session_id;
end;
$$;

-- Widok tylko do odczytu: dolicza "effective_status" - sesje utknięte
-- w 'started'/'playing' bez sygnału życia od > 3h są traktowane jako
-- porzucone, bez modyfikowania samej tabeli (nic nie nadpisujemy,
-- to czysto obliczeniowa kolumna przy odczycie).
-- security_invoker = true: widok MUSI liczyć RLS jako użytkownik, który
-- go odpytuje, a nie jako właściciel widoku (domyślne zachowanie Postgresa
-- bez tej flagi ujawniłoby sesje WSZYSTKICH gier każdemu zalogowanemu —
-- to samo ostrzeżenie daje Supabase Database Linter).
CREATE VIEW "public"."game_sessions_effective" WITH (security_invoker = true) AS
SELECT
  s.*,
  CASE
    WHEN s.ended_at IS NULL
     AND s.status IN ('started', 'playing')
     AND now() - s.last_seen_at > interval '3 hours'
    THEN 'abandoned'
    ELSE s.status
  END AS "effective_status"
FROM public.game_sessions s;
