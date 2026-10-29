BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3671-1000-0000-000000000001','send367@example.invalid',false,now(),'{"username":"send367"}'),
 ('aaaaaaaa-3671-1000-0000-000000000002','inbox367@example.invalid',false,now(),'{"username":"inbox367"}');
INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status)
 VALUES('aaaaaaaa-3671-1000-0000-000000000001','aaaaaaaa-3671-1000-0000-000000000002','aaaaaaaa-3671-1000-0000-000000000002','active');
DO $$
DECLARE actor uuid:='aaaaaaaa-3671-1000-0000-000000000001'; receiver uuid:='aaaaaaaa-3671-1000-0000-000000000002';
 table_name text; column_name text; statement text; mode text; kind text; typ text; src uuid; rid uuid; job jsonb; definition jsonb; result jsonb;
 offer public.resource_copy_offers; asset jsonb; path text; ref text; name text; copy_source jsonb;
 job_ids uuid[]:='{}'; offers uuid[]:='{}'; targets uuid[]:='{}'; source_ids uuid[]:='{}'; index integer:=0;
BEGIN
 FOREACH mode IN ARRAY ARRAY['prepared','poll_text','poll_points','TEXT','IMAGE','DRAW'] LOOP
  index:=index+1;kind:=CASE WHEN index<=3 THEN 'game' ELSE 'logo' END;
  rid:=gen_random_uuid();name:='Source367-'||mode;
  IF kind='game' THEN
   INSERT INTO public.games(owner_id,name,type,status) VALUES(actor,name,mode::public.game_type,'draft') RETURNING id INTO src;
   definition:=jsonb_build_object('game',jsonb_build_object('name',name,'type',mode),'questions','[]'::jsonb);
  ELSE
   typ:=CASE WHEN mode='TEXT' THEN 'GLYPH_30x10' ELSE 'PIX_150x70' END;
   ref:='https://test.supabase.invalid/storage/v1/object/public/user-logos/'||actor||'/source367.png';
   copy_source:=CASE mode WHEN 'TEXT' THEN '{"mode":"TEXT","text":"RODZINA367"}'::jsonb
    WHEN 'IMAGE' THEN jsonb_build_object('mode',mode,'imageUrl',ref)
    ELSE jsonb_build_object('mode',mode,'fabricData',jsonb_build_object('objects',jsonb_build_array(jsonb_build_object('type','image','src',ref)))) END;
   definition:=jsonb_build_object('name',name,'type',typ,'payload',jsonb_build_object('layers','[]'::jsonb,'source',copy_source));
   INSERT INTO public.user_logos(user_id,name,type,payload) VALUES(actor,name,typ,definition->'payload') RETURNING id INTO src;
  END IF;
  source_ids:=source_ids||src;
  job:=public._resource_clone_begin(actor,receiver,kind,src,'send',rid);
  IF mode IN('IMAGE','DRAW') THEN
   BEGIN PERFORM public._resource_clone_finish_send(actor,(job->>'id')::uuid,definition,false,'https://test.supabase.invalid');
    RAISE EXCEPTION 'uncopied image was accepted';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'unmaterialized_copy_image' THEN RAISE; END IF; END;
   asset:=public._resource_clone_asset_register(actor,(job->>'id')::uuid,ref,'storage','image/png',68,repeat('b',32),NULL,actor||'/source367.png');
   path:=asset->>'destination_path';
   INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('user-logos',path,jsonb_build_object('mimetype','image/png','size',68,'eTag',repeat('b',32)));
   IF mode='IMAGE' THEN definition:=jsonb_set(definition,'{payload,source,imageUrl}',to_jsonb('https://test.supabase.invalid/storage/v1/object/public/user-logos/'||path));
   ELSE definition:=jsonb_set(definition,'{payload,source,fabricData,objects,0,src}',to_jsonb('https://test.supabase.invalid/storage/v1/object/public/user-logos/'||path)); END IF;
  END IF;
  job_ids:=job_ids||(job->>'id')::uuid;
  result:=public._resource_clone_finish_send(actor,(job->>'id')::uuid,definition,false,'https://test.supabase.invalid');
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'send failed: %',result; END IF;
  SELECT * INTO offer FROM public.resource_copy_offers WHERE id=(result->>'offer_id')::uuid;
  IF offer.status<>'pending' OR offer.recipient_id<>receiver OR offer.resource_kind<>kind THEN RAISE EXCEPTION 'wrong pending offer'; END IF;
  offers:=offers||offer.id;targets:=targets||coalesce(offer.game_id,offer.logo_id);
  IF (public._resource_clone_finish_send(actor,(job->>'id')::uuid,definition,false,'https://test.supabase.invalid')->>'offer_id') IS DISTINCT FROM offer.id::text THEN RAISE EXCEPTION 'retry duplicated send'; END IF;
  job:=public._resource_clone_begin(actor,receiver,kind,src,'send',gen_random_uuid());
  IF (public._resource_clone_finish_send(actor,(job->>'id')::uuid,definition,false,'https://test.supabase.invalid')->>'error') IS DISTINCT FROM 'already_sent' THEN RAISE EXCEPTION 'second pending send allowed'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.resource_copy_history WHERE sender_id=actor)<>6 THEN RAISE EXCEPTION 'wrong send history count'; END IF;
 -- Public and legacy writers share the same ancestor guard. Before-row
 -- guards run before constraints, so minimal inserts reach every real table.
 FOREACH table_name IN ARRAY ARRAY['control_device_link_tokens','control_device_shares','control_runtime_sessions','device_connect_codes','device_presence','display_audio_unlock','game_session_active','game_sessions','game_state_history','poll_anonymous_limits','poll_sessions','poll_tally_drafts','poll_tasks','poll_text_entries','poll_votes','shared_devices','market_games','user_market_library'] LOOP
  column_name:=CASE table_name WHEN 'market_games' THEN 'source_game_id' ELSE 'game_id' END;
  statement:=format('INSERT INTO public.%I(%I) VALUES(%L)',table_name,column_name,targets[1]);
  BEGIN EXECUTE statement; RAISE EXCEPTION 'pending descendant insert succeeded: %',table_name;
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'received_copy_pending' THEN RAISE; END IF; END;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',receiver::text,true);
 result:=public._copy_decide(offers[2],'decline');
 IF result->>'ok' IS DISTINCT FROM 'true' OR EXISTS(SELECT 1 FROM public.games WHERE id=targets[2]) THEN RAISE EXCEPTION 'decline retained game'; END IF;
 job:=public._resource_clone_begin(actor,receiver,'game',source_ids[2],'send',gen_random_uuid());
 IF (public._resource_clone_finish_send(actor,(job->>'id')::uuid,'{"game":{"name":"Source367-poll_text","type":"poll_text"},"questions":[]}',false,'https://test.supabase.invalid')->>'error') IS DISTINCT FROM 'declined_cooldown' THEN RAISE EXCEPTION 'decline cooldown bypassed'; END IF;
 PERFORM public.delete_user_everything(actor);
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE sender_id=actor) OR (SELECT count(*) FROM public.resource_copy_offers WHERE recipient_id=receiver)<>6 THEN RAISE EXCEPTION 'sender deletion changed recipient offers'; END IF;
 result:=public._copy_decide(offers[1],'accept');
 IF result->>'id' IS DISTINCT FROM targets[1]::text THEN RAISE EXCEPTION 'accept imported a second game'; END IF;
 result:=public._copy_decide(offers[4],'accept');
 IF result->>'id' IS DISTINCT FROM targets[4]::text THEN RAISE EXCEPTION 'accept imported a second logo'; END IF;
 result:=public._copy_decide(offers[5],'decline');
 IF result->>'ok' IS DISTINCT FROM 'true' OR EXISTS(SELECT 1 FROM public.user_logos WHERE id=targets[5]) THEN RAISE EXCEPTION 'decline retained logo'; END IF;
 IF (public._copy_decide(offers[5],'accept')->>'error') IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'decline restored logo'; END IF;
 UPDATE public.resource_copy_offers SET created_at=now()-interval '5 days' WHERE id=offers[6];
 result:=public._copy_decide(offers[6],'accept');
 IF result->>'error' IS DISTINCT FROM 'expired' OR EXISTS(SELECT 1 FROM public.user_logos WHERE id=targets[6]) THEN RAISE EXCEPTION 'expiry retained logo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.storage_cleanup_queue cq WHERE cq.bucket='user-logos' AND cq.path=receiver::text||'/copies/'||job_ids[5]::text AND cq.is_folder) OR NOT EXISTS(SELECT 1 FROM public.storage_cleanup_queue cq WHERE cq.bucket='user-logos' AND cq.path=receiver::text||'/copies/'||job_ids[6]::text AND cq.is_folder) THEN RAISE EXCEPTION 'decline/expiry did not queue exact own file folders'; END IF;
 PERFORM public.delete_user_everything(receiver);
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE recipient_id=receiver) OR EXISTS(SELECT 1 FROM public.resource_clone_jobs WHERE recipient_id=receiver) OR EXISTS(SELECT 1 FROM public.user_logos WHERE user_id=receiver) THEN RAISE EXCEPTION 'receiver deletion retained own copies'; END IF;
 RAISE NOTICE 'Send367 local private finish: Games3/Logo3, own files, one result, decline/expiry, both account cascades passed';
END $$;
ROLLBACK;
