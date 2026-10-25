-- Tylko izolowana baza po local-stubs + schema.sql + migracja 486.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-4860-0000-0000-000000000001','owner486@example.com');
INSERT INTO public.profiles(id,email,username) VALUES ('aaaaaaaa-4860-0000-0000-000000000001','owner486@example.com','owner486');
INSERT INTO public.games(id,owner_id,name) VALUES ('cccccccc-4860-0000-0000-000000000003','aaaaaaaa-4860-0000-0000-000000000001','Ack486');
INSERT INTO public.game_state(game_id,rev,top_card,step,phase,control_team,detail)
VALUES ('cccccccc-4860-0000-0000-000000000003',5,'rounds','r_play','PLAY','A','{"locks":{"gameStarted":true}}');
UPDATE public.game_state SET updated_at = now() - interval '1 minute' WHERE game_id='cccccccc-4860-0000-0000-000000000003';
CREATE TEMP TABLE before_ack AS SELECT rev, updated_at, display_rendered_rev, xmin::text AS x
  FROM public.game_state WHERE game_id='cccccccc-4860-0000-0000-000000000003';
-- Atrapa walidacji urządzenia (tylko w tej transakcji).
CREATE OR REPLACE FUNCTION public._control_device_action_valid(p_game_id uuid,p_device_type text,p_key text,p_connection_id uuid,p_epoch bigint)
RETURNS boolean LANGUAGE sql AS 'SELECT true';
SELECT public.game_state_display_complete('cccccccc-4860-0000-0000-000000000003','k',5);
SELECT pg_temp.check_result((SELECT c.rendered_rev=5 AND c.rendered_at IS NOT NULL
  FROM public.game_state_display_completion c WHERE c.game_id='cccccccc-4860-0000-0000-000000000003'),
  'potwierdzenie zapisuje się w tabeli potwierdzeń');
SELECT pg_temp.check_result((SELECT g.rev=b.rev AND g.updated_at=b.updated_at AND g.display_rendered_rev=b.display_rendered_rev
  FROM public.game_state g, before_ack b WHERE g.game_id='cccccccc-4860-0000-0000-000000000003'),
  'wiersz game_state bez zmian (brak rozsyłki Realtime do urządzeń)');
SELECT pg_temp.check_result(public.game_state_display_is_ready('cccccccc-4860-0000-0000-000000000003','k','buzzer',NULL,NULL),
  'gotowość Wyświetlacza dla Przycisku z tabeli potwierdzeń');
ROLLBACK;
