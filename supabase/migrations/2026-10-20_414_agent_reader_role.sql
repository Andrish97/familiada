-- 414: ograniczona rola do odczytów agenta (workflow db-read i blokady
-- przerwy technicznej) zamiast superużytkownika — decyzja użytkownika
-- 2026-10-20 („nie powinno być aż tak mocne”).
--  * tylko SELECT na liście tabel z treścią gier/baz/ankiet i aktywnością
--    (liczby do blokad przerwy); bez schematu auth, profili, poczty,
--    kontaktów, subskrybentów i innych danych osobowych;
--  * BYPASSRLS tylko po to, by liczyć wiersze wszystkich użytkowników
--    w tabelach z listy (bez niego RLS ukrywa wszystko) — uprawnienia do
--    tabel nadal ograniczają zakres;
--  * nie superużytkownik: bez plików serwera, bez przerywania cudzych
--    połączeń, bez tworzenia obiektów; sesje domyślnie tylko do odczytu,
--    limit czasu 60 s, najwyżej 3 połączenia.
-- Logowanie: wewnątrz kontenera bazy (docker exec … -h 127.0.0.1).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_reader') THEN
    CREATE ROLE agent_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS CONNECTION LIMIT 3;
  ELSE
    ALTER ROLE agent_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS CONNECTION LIMIT 3;
  END IF;
END $$;

ALTER ROLE agent_reader SET default_transaction_read_only = on;
ALTER ROLE agent_reader SET statement_timeout = '60s';

-- Bez tworzenia obiektów w public (domyślne CREATE dla PUBLIC w starszych bazach).
REVOKE CREATE ON SCHEMA public FROM agent_reader;
GRANT USAGE ON SCHEMA public TO agent_reader;

-- Lista tabel: treść gier, baz i ankiet oraz aktywność (bez danych osobowych).
GRANT SELECT ON
  public.games, public.questions, public.answers,
  public.question_bases, public.qb_questions, public.qb_categories, public.qb_tags,
  public.qb_question_tags, public.qb_category_tags,
  public.poll_sessions, public.poll_votes, public.poll_text_entries,
  public.game_state, public.game_sessions, public.control_runtime_sessions,
  public.device_presence, public.edit_locks, public.site_activity,
  public.market_games, public.demo_template_data,
  public.e21_demo_templates_before, public.e21_repair_runs,
  public.stats_exclusions_effective
TO agent_reader;

-- Funkcje reguł i audytu E21 (część odebrana PUBLIC w 405/409/411).
GRANT EXECUTE ON FUNCTION
  public.fam_answer_clean(text), public.fam_answer_invalid_chars(text),
  public.fam_display_has_glyph(text), public.fam_display_glyph_chars(),
  public.game_rules_compute(uuid, text, text), public._game_control_active(uuid),
  public._poll_latest_sessions(uuid), public._poll_full_voters(uuid), public._poll_full_submissions(uuid),
  public.e21_demo_game_content(uuid), public.e21_demo_template_content(jsonb), public.e21_demo_answer_map()
TO agent_reader;

-- Samosprawdzenie: rola nie widzi danych osobowych ani nie pisze.
DO $$
BEGIN
  IF has_schema_privilege('agent_reader', 'auth', 'USAGE') THEN RAISE EXCEPTION 'agent_reader: dostęp do auth'; END IF;
  IF has_table_privilege('agent_reader', 'public.profiles', 'SELECT') THEN RAISE EXCEPTION 'agent_reader: dostęp do profiles'; END IF;
  IF has_table_privilege('agent_reader', 'public.games', 'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'agent_reader: zapis'; END IF;
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = 'agent_reader') THEN RAISE EXCEPTION 'agent_reader: superużytkownik'; END IF;
END $$;
