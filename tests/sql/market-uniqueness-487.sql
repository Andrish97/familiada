BEGIN;
CREATE FUNCTION pg_temp.assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
INSERT INTO public.games(id,owner_id,source_market_id,is_demo,type,status,name) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,false,'prepared','ready','Pierwsza'),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,false,'prepared','ready','Kopia'),
 ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL,false,'prepared','ready','Inny autor');
INSERT INTO public.questions SELECT gen_random_uuid(),g.id,'Pytanie testowe '||n,n FROM public.games g CROSS JOIN generate_series(1,10) n WHERE g.id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
INSERT INTO public.answers SELECT q.id,'Odpowiedź '||n,10,n FROM public.questions q CROSS JOIN generate_series(1,3) n WHERE q.game_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
SELECT set_config('audit.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_temp.assert_ok(ok,'first submission accepted') FROM public.market_submit_game('11111111-1111-4111-8111-111111111111','Tytuł','Opis','pl',NULL);
SELECT pg_temp.assert_ok(NOT ok AND err='already_submitted','same source keeps original error') FROM public.market_submit_game('11111111-1111-4111-8111-111111111111','Tytuł','Opis','pl',NULL);
SELECT pg_temp.assert_ok(NOT ok AND err='duplicate_content','new source and changed title blocked') FROM public.market_submit_game('22222222-2222-4222-8222-222222222222','Nowy tytuł','Opis','en',NULL);
SELECT set_config('audit.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_temp.assert_ok(NOT ok AND err='duplicate_content','another author blocked') FROM public.market_submit_game('33333333-3333-4333-8333-333333333333','Jeszcze inny','Opis','uk',NULL);
UPDATE public.market_games SET status='withdrawn' WHERE source_game_id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_ok(ok,'withdrawn content may be resubmitted') FROM public.market_submit_game('33333333-3333-4333-8333-333333333333','Ponowne','Opis','pl',NULL);
-- A service-role INSERT and UPDATE are covered by the same constraint.
DO $$ BEGIN
 BEGIN
   INSERT INTO public.market_games(id,title,lang,status,payload) SELECT '44444444-4444-4444-8444-444444444444','Producent','pl','published',payload FROM public.market_games WHERE source_game_id='33333333-3333-4333-8333-333333333333';
   RAISE EXCEPTION 'FAIL: producer bypass';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT pg_temp.assert_ok(NOT ok AND err='not_found_or_not_pending','withdrawn review retains contract') FROM public.market_admin_review((SELECT id FROM public.market_games WHERE source_game_id='11111111-1111-4111-8111-111111111111'),'approve','');
-- Moderator function only handles pending; set the older withdrawn row to rejected, then ensure activation cannot bypass the index.
UPDATE public.market_games SET status='rejected' WHERE source_game_id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 BEGIN
  UPDATE public.market_games SET status='pending' WHERE source_game_id='11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'FAIL: activation bypass';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT pg_temp.assert_ok(NOT has_table_privilege('authenticated','public.market_games','INSERT'),'direct publication outside validated RPC disabled');
SELECT pg_temp.assert_ok(NOT has_function_privilege('authenticated','public._market_submit_game_before_content_guard(uuid,text,text,text,jsonb)','EXECUTE'),'original RPC private');
SELECT pg_temp.assert_ok(has_function_privilege('authenticated','public.market_submit_game(uuid,text,text,text,jsonb)','EXECUTE'),'public submission contract retained');
ROLLBACK;
