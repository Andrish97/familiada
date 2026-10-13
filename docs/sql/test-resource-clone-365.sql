BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3653-1000-0000-000000000001','clone365@example.invalid',false,now(),'{"username":"clone365"}'),
 ('aaaaaaaa-3653-1000-0000-000000000002','clone365friend@example.invalid',false,now(),'{"username":"clone365friend"}');
DO $$
DECLARE actor uuid:='aaaaaaaa-3653-1000-0000-000000000001'; other_user uuid:='aaaaaaaa-3653-1000-0000-000000000002';
 base_source uuid; game_source uuid; logo_source uuid; base_result uuid; game_result uuid; logo_result uuid;
 cat1 uuid; cat2 uuid; tag_id uuid; q1 uuid; q2 uuid; snap jsonb; packet jsonb; result jsonb; request_id uuid:=gen_random_uuid();
 saved_ids uuid[]; failed boolean; statement text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO public.question_bases(owner_id,name) VALUES(actor,'Original base') RETURNING id INTO base_source;
 INSERT INTO public.qb_categories(base_id,name,ord) VALUES(base_source,'Root',1) RETURNING id INTO cat1;
 INSERT INTO public.qb_categories(base_id,parent_id,name,ord) VALUES(base_source,cat1,'Nested',1) RETURNING id INTO cat2;
 INSERT INTO public.qb_tags(base_id,name,color,ord) VALUES(base_source,'Red','red',1) RETURNING id INTO tag_id;
 INSERT INTO public.qb_questions(base_id,category_id,ord,payload,updated_by) VALUES(base_source,cat2,1,'{"text":"Nested?","answers":[{"text":"Yes","points":5}]}',actor) RETURNING id INTO q1;
 INSERT INTO public.qb_questions(base_id,ord,payload,updated_by) VALUES(base_source,2,'{"text":"Root?","answers":[]}',actor) RETURNING id INTO q2;
 INSERT INTO public.qb_question_tags(question_id,tag_id) VALUES(q1,tag_id);
 INSERT INTO public.qb_category_tags(category_id,tag_id) VALUES(cat1,tag_id);
 INSERT INTO public.question_base_shares(base_id,user_id,role) VALUES(base_source,other_user,'editor');
 snap:=public._resource_clone_read(actor,'base',base_source);
 IF jsonb_array_length(snap->'categories')<>2 OR jsonb_array_length(snap->'questions')<>2 OR jsonb_array_length(snap->'tags')<>1 OR
  jsonb_array_length(snap->'question_tags')<>1 OR jsonb_array_length(snap->'category_tags')<>1 OR snap ? 'shares' THEN RAISE EXCEPTION 'base source definition incomplete'; END IF;
 packet:=jsonb_set(snap-ARRAY['demo_templates','demo_origin'],'{base}',jsonb_build_object('name','Original base kopia'));
 result:=public._resource_clone_write(actor,actor,'base','duplicate',base_source,request_id,packet,false);base_result:=(result->>'id')::uuid;
 IF (public._resource_clone_write(actor,actor,'base','duplicate',base_source,request_id,packet,false)->>'id') IS DISTINCT FROM base_result::text THEN RAISE EXCEPTION 'retry duplicated base'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.question_bases WHERE id=base_result AND owner_id=actor AND name='Original base kopia' AND NOT is_demo) THEN RAISE EXCEPTION 'base name or owner wrong'; END IF;
 IF (SELECT count(*) FROM public.qb_categories WHERE base_id=base_result)<>2 OR (SELECT count(*) FROM public.qb_questions WHERE base_id=base_result)<>2 OR
  NOT EXISTS(SELECT 1 FROM public.qb_categories c JOIN public.qb_categories parent ON parent.id=c.parent_id WHERE c.base_id=base_result AND parent.base_id=base_result AND c.name='Nested' AND parent.name='Root') OR
  NOT EXISTS(SELECT 1 FROM public.qb_questions q JOIN public.qb_categories c ON c.id=q.category_id WHERE q.base_id=base_result AND c.base_id=base_result AND c.name='Nested') OR
  (SELECT count(*) FROM public.qb_question_tags e JOIN public.qb_questions q ON q.id=e.question_id WHERE q.base_id=base_result)<>1 OR
  (SELECT count(*) FROM public.qb_category_tags e JOIN public.qb_categories c ON c.id=e.category_id WHERE c.base_id=base_result)<>1 OR
  EXISTS(SELECT 1 FROM public.qb_categories WHERE base_id=base_result AND id IN(cat1,cat2)) OR
  EXISTS(SELECT 1 FROM public.qb_questions WHERE base_id=base_result AND id IN(q1,q2)) OR
  EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id=base_result) THEN RAISE EXCEPTION 'base clone inherited IDs/shares or lost its tree'; END IF;
 -- Malformed later child must roll back the entire base and all earlier rows.
 SELECT array_agg(id ORDER BY id) INTO saved_ids FROM public.question_bases WHERE owner_id=actor;
 BEGIN
  PERFORM public._resource_clone_write(actor,actor,'base','duplicate',base_source,gen_random_uuid(),jsonb_set(packet,'{questions,1,ord}','"not an integer"'),false);
  RAISE EXCEPTION 'invalid base succeeded';
 EXCEPTION WHEN invalid_text_representation THEN NULL; END;
 IF (SELECT array_agg(id ORDER BY id) FROM public.question_bases WHERE owner_id=actor) IS DISTINCT FROM saved_ids THEN RAISE EXCEPTION 'failed clone left a partial base'; END IF;
 DELETE FROM public.question_bases WHERE id=base_result;
 BEGIN PERFORM public._resource_clone_write(actor,actor,'base','duplicate',base_source,request_id,packet,false);RAISE EXCEPTION 'deleted result resurrected';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'previously_removed' THEN RAISE; END IF; END;
 -- Unknown/foreign source, active child lock and open game are rejected.
 BEGIN PERFORM public._resource_clone_read(other_user,'base',base_source);RAISE EXCEPTION 'foreign source exposed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'not_found' THEN RAISE; END IF; END;
 INSERT INTO public.edit_locks(resource_type,resource_id,holder_user_id,holder_tab_id,holder_context,mode) VALUES('base_folder',cat2,actor,'clone-test-tab','base-explorer','exclusive');
 BEGIN PERFORM public._resource_clone_read(actor,'base',base_source);RAISE EXCEPTION 'busy source copied';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'resource_in_use' THEN RAISE; END IF; END;
 DELETE FROM public.edit_locks WHERE holder_tab_id='clone-test-tab';
 INSERT INTO public.games(owner_id,name,type,status,is_demo) VALUES(actor,'Demo renamed','prepared','draft',true) RETURNING id INTO game_source;
 PERFORM public.game_import_content(game_source,'Demo renamed','[{"text":"A?","answers":[{"text":"Yes","fixed_points":30}]}]');
 packet:='{"game":{"name":"Demo renamed kopia","type":"prepared"},"questions":[{"text":"A?","answers":[{"text":"Yes","fixed_points":30}]}]}';
 result:=public._resource_clone_write(actor,actor,'game','duplicate',game_source,gen_random_uuid(),packet,true);game_result:=(result->>'id')::uuid;
 snap:=public._resource_clone_read(actor,'game',game_result);
 IF snap->>'demo_origin'<>'true' OR snap#>>'{game,name}'<>'Demo renamed kopia' OR jsonb_array_length(snap->'questions')<>1 OR snap#>>'{questions,0,answers,0,fixed_points}'<>'30' THEN RAISE EXCEPTION 'game definition/demo origin missing'; END IF;
 BEGIN PERFORM public._resource_clone_write(actor,other_user,'game','send',game_result,gen_random_uuid(),packet,false);RAISE EXCEPTION 'demo flag stripped';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_demo_provenance' THEN RAISE; END IF; END;
 BEGIN PERFORM public._resource_clone_write(actor,other_user,'game','send',game_result,gen_random_uuid(),packet,true);RAISE EXCEPTION 'demo sent';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'demo_not_sendable' THEN RAISE; END IF; END;
 INSERT INTO public.user_logos(user_id,name,type,payload) VALUES(actor,'Logo','GLYPH_30x10','{"layers":[{"color":"main","rows":["101"]}],"source":{"mode":"TEXT","text":"Logo"}}') RETURNING id INTO logo_source;
 snap:=public._resource_clone_read(actor,'logo',logo_source);packet:=jsonb_set((snap->'logo')-ARRAY['id','is_demo'],'{name}','"Logo kopia"');
 result:=public._resource_clone_write(actor,actor,'logo','duplicate',logo_source,gen_random_uuid(),packet,false);logo_result:=(result->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.user_logos WHERE id=logo_result AND user_id=actor AND name='Logo kopia' AND payload=packet->'payload') THEN RAISE EXCEPTION 'logo clone definition wrong'; END IF;
 -- The tree belongs to the recipient, and private receipts have no source FK.
 DELETE FROM public.games WHERE id=game_source;
 IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=game_result) OR NOT EXISTS(SELECT 1 FROM public.resource_clone_receipts WHERE game_id=game_result AND demo_origin) THEN RAISE EXCEPTION 'source delete revoked clone'; END IF;
 PERFORM public.delete_user_everything(actor);
 IF EXISTS(SELECT 1 FROM public.resource_clone_receipts WHERE recipient_id=actor) OR EXISTS(SELECT 1 FROM public.games WHERE owner_id=actor) OR EXISTS(SELECT 1 FROM public.question_bases WHERE owner_id=actor) OR EXISTS(SELECT 1 FROM public.user_logos WHERE user_id=actor) THEN RAISE EXCEPTION 'account cascade missed clones'; END IF;
 IF has_function_privilege('authenticated','public._resource_clone_read(uuid,text,uuid)','EXECUTE') OR has_function_privilege('anon','public._resource_clone_write(uuid,uuid,text,text,uuid,uuid,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'private planner exposed'; END IF;
 RAISE NOTICE 'Common clone: own base tree/tags/newIDs/no sharing, atomic failure/retry/removal, game and logo definition, locks/demo lineage, source independence and account cleanup passed';
END $$;
ROLLBACK;
