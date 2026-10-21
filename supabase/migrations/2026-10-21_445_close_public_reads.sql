-- Bezpieczeństwo (zgłoszenie 2026-10-21): otwarte polityki odczytu.
--  * profiles: każdy zalogowany (także gość) czytał e-maile i nazwy WSZYSTKICH
--    użytkowników (profiles_select_authenticated USING true). Zostają polityki
--    „własny profil” (profiles_select_own / profiles_self_read).
--  * device_connect_codes: każdy (bez logowania) czytał kody z share_key
--    cudzych urządzeń. Zostaje „owner can manage”; parowanie idzie przez RPC.
--  * app_ratings: każdy czytał oceny z user_id i komentarzami; zostaje odczyt
--    własnej oceny, średnia publiczna przez get_app_rating_stats (SECURITY DEFINER).
--  * game_gen_queue: publiczny odczyt i zapis kolejki; zostają polityki _own
--    i service_role.
-- Zamienniki dla miejsc, które potrzebowały cudzych danych:
--  * _public_username(uuid) -- sama nazwa autora w Grach Społeczności
--    (market_browse, market_game_detail, market_find_similar_*),
--  * username_taken(text) -- czy nazwa jest zajęta (Konto, logowanie),
--  * poll_go_owner_email_match(uuid, text) -- czy e-mail w zaproszeniu to
--    e-mail właściciela ankiety (strona /go), zwraca nazwę właściciela albo null.

CREATE OR REPLACE FUNCTION public._public_username(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT username FROM public.profiles WHERE id = p_id
$$;
REVOKE ALL ON FUNCTION public._public_username(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._public_username(uuid) TO anon, authenticated, service_role;

DO $$
DECLARE
  fn record;
  def text;
  n int := 0;
BEGIN
  -- Treść funkcji poza kolumną autora bez zmian -- bez ponownej walidacji
  -- (rozszerzenia trigram/vector mogą być w innym schemacie niż search_path).
  PERFORM set_config('check_function_bodies', 'off', true);
  FOR fn IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE s.nspname = 'public'
      AND p.proname IN ('market_browse', 'market_game_detail', 'market_find_similar_questions', 'market_find_similar_embeddings')
      AND p.prosrc ~* 'LEFT JOIN public\.profiles pr ON pr\.id = mg\.author_user_id'
  LOOP
    def := pg_get_functiondef(fn.oid);
    def := regexp_replace(def, '\s*LEFT JOIN public\.profiles pr ON pr\.id = mg\.author_user_id', '', 'gi');
    def := regexp_replace(def, '\mpr\.username\M', 'public._public_username(mg.author_user_id)', 'gi');
    IF def ~* 'public\.profiles' THEN
      RAISE EXCEPTION 'close_public_reads: w % zostało odwołanie do profiles', fn.oid::regprocedure;
    END IF;
    EXECUTE def;
    n := n + 1;
  END LOOP;
  IF n < 3 THEN
    RAISE EXCEPTION 'close_public_reads: przepisano % funkcji Gier Społeczności, oczekiwano co najmniej 3', n;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.username_taken(p_username text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(btrim(coalesce(p_username, '')))
      AND id IS DISTINCT FROM auth.uid()
  )
$$;
REVOKE ALL ON FUNCTION public.username_taken(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.username_taken(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.poll_go_owner_email_match(p_owner_id uuid, p_email text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(nullif(username, ''), email)
  FROM public.profiles
  WHERE id = p_owner_id
    AND lower(btrim(email)) = lower(btrim(coalesce(p_email, '')))
$$;
REVOKE ALL ON FUNCTION public.poll_go_owner_email_match(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_go_owner_email_match(uuid, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "anyone can read device_connect_codes" ON public.device_connect_codes;
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.app_ratings;
DROP POLICY IF EXISTS "Allow public read access to queue" ON public.game_gen_queue;
DROP POLICY IF EXISTS "Allow public insert to queue" ON public.game_gen_queue;

DROP POLICY IF EXISTS "app_ratings_select_own" ON public.app_ratings;
CREATE POLICY "app_ratings_select_own" ON public.app_ratings FOR SELECT TO authenticated USING (user_id = auth.uid());
