-- Włączyć po przygotowaniu komunikatu duplicate_content w UI/API.
BEGIN;
-- Zgłoszenia użytkownika wyłącznie przez walidowane RPC; publikacja przez moderatora.
REVOKE INSERT ON public.market_games FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS mg_insert_own ON public.market_games;
-- Unikalny indeks rozstrzyga też wyścig między różnymi źródłami i autorami.
CREATE UNIQUE INDEX market_games_active_content_unique ON public.market_games(content_key)
 WHERE status IN ('pending','published') AND content_key IS NOT NULL;
DROP INDEX public.market_games_content_key_idx;

-- Zgłoszenie zachowuje dotychczasowy kontrakt TABLE(ok,err,market_id).
ALTER FUNCTION public.market_submit_game(uuid,text,text,text,jsonb) RENAME TO _market_submit_game_before_content_guard;
REVOKE ALL ON FUNCTION public._market_submit_game_before_content_guard(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.market_submit_game(p_game_id uuid,p_title text,p_description text,p_lang text,p_payload jsonb)
RETURNS TABLE(ok boolean,err text,market_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE violated_constraint text;
BEGIN
 RETURN QUERY SELECT * FROM public._market_submit_game_before_content_guard(p_game_id,p_title,p_description,p_lang,p_payload);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='market_games_active_content_unique' THEN
   RETURN QUERY SELECT false,'duplicate_content'::text,NULL::uuid;
 ELSE RAISE;
 END IF;
END
$$;
REVOKE ALL ON FUNCTION public.market_submit_game(uuid,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.market_submit_game(uuid,text,text,text,jsonb) TO authenticated,service_role;

-- Publikacja moderatora też zwraca kontrolowany błąd, bez danych cudzych zgłoszeń.
ALTER FUNCTION public.market_admin_review(uuid,text,text) RENAME TO _market_admin_review_before_content_guard;
REVOKE ALL ON FUNCTION public._market_admin_review_before_content_guard(uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.market_admin_review(p_id uuid,p_action text,p_note text DEFAULT '')
RETURNS TABLE(ok boolean,err text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE violated_constraint text;
BEGIN
 RETURN QUERY SELECT * FROM public._market_admin_review_before_content_guard(p_id,p_action,p_note);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='market_games_active_content_unique' THEN
   RETURN QUERY SELECT false,'duplicate_content'::text;
 ELSE RAISE;
 END IF;
END
$$;
REVOKE ALL ON FUNCTION public.market_admin_review(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.market_admin_review(uuid,text,text) TO service_role;
COMMIT;
