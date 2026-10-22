-- 458: gość może powielać własne zasoby, nie może wysyłać kopii ani ich odbierać.
BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-4580-1000-0000-000000000001',NULL,true,NULL,'{"is_guest":true}'),
 ('aaaaaaaa-4580-1000-0000-000000000002','dup458@example.invalid',false,now(),'{"username":"dup458"}');
INSERT INTO public.profiles(id,username,email,is_guest) VALUES
 ('aaaaaaaa-4580-1000-0000-000000000001','guest458',NULL,true)
 ON CONFLICT(id) DO UPDATE SET is_guest=true;
DO $$
DECLARE guest uuid:='aaaaaaaa-4580-1000-0000-000000000001'; regular uuid:='aaaaaaaa-4580-1000-0000-000000000002';
 game_source uuid; logo_source uuid; job jsonb; result jsonb; packet jsonb; snap jsonb; reg_game uuid;
BEGIN
 IF public._poll_identity_regular(guest,(SELECT to_jsonb(u) FROM auth.users u WHERE u.id=guest)) THEN RAISE EXCEPTION 'fixture: guest counted as registered'; END IF;
 PERFORM set_config('request.jwt.claim.sub',guest::text,true);
 INSERT INTO public.games(owner_id,name,type,status) VALUES(guest,'Gra gościa','prepared','draft') RETURNING id INTO game_source;
 PERFORM public.game_import_content(game_source,'Gra gościa','[{"text":"A?","answers":[{"text":"Tak","fixed_points":30}]}]');
 INSERT INTO public.user_logos(user_id,name,type,payload) VALUES(guest,'Logo gościa','GLYPH_30x10','{"layers":[]}') RETURNING id INTO logo_source;

 -- Powiel gry: begin (Worker) i zapis.
 job:=public._resource_clone_begin(guest,guest,'game',game_source,'duplicate',gen_random_uuid());
 IF job->>'status'<>'preparing' OR job#>>'{snapshot,game,id}'<>game_source::text THEN RAISE EXCEPTION 'guest duplicate begin failed: %',job; END IF;
 packet:='{"game":{"name":"Gra gościa kopia","type":"prepared"},"questions":[{"text":"A?","answers":[{"text":"Tak","fixed_points":30}]}]}';
 result:=public._resource_clone_write(guest,guest,'game','duplicate',game_source,gen_random_uuid(),packet,false);
 IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=(result->>'id')::uuid AND owner_id=guest AND name='Gra gościa kopia') THEN RAISE EXCEPTION 'guest game copy missing'; END IF;
 snap:=public._resource_clone_read(guest,'game',(result->>'id')::uuid);
 IF jsonb_array_length(snap->'questions')<>1 THEN RAISE EXCEPTION 'guest game copy lost questions'; END IF;

 -- Powiel logo.
 job:=public._resource_clone_begin(guest,guest,'logo',logo_source,'duplicate',gen_random_uuid());
 IF job->>'status'<>'preparing' THEN RAISE EXCEPTION 'guest logo begin failed'; END IF;
 packet:=jsonb_set((public._resource_clone_read(guest,'logo',logo_source)->'logo')-ARRAY['id','is_demo'],'{name}','"Logo gościa kopia"');
 result:=public._resource_clone_write(guest,guest,'logo','duplicate',logo_source,gen_random_uuid(),packet,false);
 IF NOT EXISTS(SELECT 1 FROM public.user_logos WHERE id=(result->>'id')::uuid AND user_id=guest AND name='Logo gościa kopia') THEN RAISE EXCEPTION 'guest logo copy missing'; END IF;

 -- Wyślij od gościa: odmowa na każdym etapie.
 BEGIN PERFORM public._resource_clone_begin(guest,regular,'game',game_source,'send',gen_random_uuid());RAISE EXCEPTION 'guest send begin allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'auth_required' THEN RAISE; END IF; END;
 BEGIN PERFORM public._resource_clone_write(guest,regular,'game','send',game_source,gen_random_uuid(),'{}'::jsonb,false);RAISE EXCEPTION 'guest send write allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'auth_required' THEN RAISE; END IF; END;
 -- Wyślij do gościa: odmowa.
 PERFORM set_config('request.jwt.claim.sub',regular::text,true);
 INSERT INTO public.games(owner_id,name,type,status) VALUES(regular,'Gra konta','prepared','draft') RETURNING id INTO reg_game;
 BEGIN PERFORM public._resource_clone_begin(regular,guest,'game',reg_game,'send',gen_random_uuid());RAISE EXCEPTION 'send to guest allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'auth_required' THEN RAISE; END IF; END;
 -- Duplikat cudzego zasobu nadal niemożliwy.
 BEGIN PERFORM public._resource_clone_begin(guest,guest,'game',reg_game,'duplicate',gen_random_uuid());RAISE EXCEPTION 'foreign duplicate allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'not_found' THEN RAISE; END IF; END;
 -- Nieistniejący aktor: auth_required.
 BEGIN PERFORM public._resource_clone_begin('aaaaaaaa-4580-1000-0000-0000000000ff','aaaaaaaa-4580-1000-0000-0000000000ff','game',reg_game,'duplicate',gen_random_uuid());RAISE EXCEPTION 'missing actor allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'auth_required' THEN RAISE; END IF; END;
 RAISE NOTICE 'test-guest-duplicate-458 OK';
END $$;
ROLLBACK;
