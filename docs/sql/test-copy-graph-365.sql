-- Historical prototype contract, not the final Send-time creation contract.
BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3650-1000-0000-000000000001','sender365@example.invalid',false,now(),'{"username":"sender365"}'),
 ('aaaaaaaa-3650-1000-0000-000000000002','receiver365@example.invalid',false,now(),'{"username":"receiver365"}'),
 ('aaaaaaaa-3650-1000-0000-000000000003','other365@example.invalid',false,now(),'{"username":"other365"}');
INSERT INTO public.games(id,owner_id,name,type,status) VALUES
 ('bbbbbbbb-3650-1000-0000-000000000001','aaaaaaaa-3650-1000-0000-000000000001','Original365','prepared','draft');
INSERT INTO public.user_logos(id,user_id,name,type,payload) VALUES
 ('bbbbbbbb-3650-1000-0000-000000000002','aaaaaaaa-3650-1000-0000-000000000001','Logo365','GLYPH_30x10','{}');
INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status)
 VALUES('aaaaaaaa-3650-1000-0000-000000000001','aaaaaaaa-3650-1000-0000-000000000002','aaaaaaaa-3650-1000-0000-000000000002','active');
INSERT INTO public.resource_copy_offers(id,recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,payload,payload_hash,request_id)
 SELECT 'cccccccc-3650-1000-0000-000000000001','aaaaaaaa-3650-1000-0000-000000000002','aaaaaaaa-3650-1000-0000-000000000001','aaaaaaaa-3650-1000-0000-000000000001','sender365',
 'bbbbbbbb-3650-1000-0000-000000000001','game','prepared','Original365',packet,encode(sha256(convert_to(packet::text,'UTF8')),'hex'),gen_random_uuid()
 FROM(SELECT '{"game":{"name":"Original365","type":"prepared"},"questions":[{"text":"Co?","answers":[{"text":"Aparat","fixed_points":20}]}]}'::jsonb packet) x;
INSERT INTO public.resource_copy_offers(id,recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,payload,payload_hash,request_id)
 SELECT 'cccccccc-3650-1000-0000-000000000002','aaaaaaaa-3650-1000-0000-000000000002','aaaaaaaa-3650-1000-0000-000000000001','aaaaaaaa-3650-1000-0000-000000000001','sender365',
 'bbbbbbbb-3650-1000-0000-000000000002','logo','GLYPH_30x10','Logo365',packet,encode(sha256(convert_to(packet::text,'UTF8')),'hex'),gen_random_uuid()
 FROM(SELECT '{"kind":"GLYPH","name":"Logo365","payload":{"layers":[],"source":{"mode":"TEXT","text":"FAMILIADA"}}}'::jsonb packet) x;
INSERT INTO public.resource_copy_history(sender_id,game_id,offer_id,recipient_identity,recipient_label)
 VALUES('aaaaaaaa-3650-1000-0000-000000000001','bbbbbbbb-3650-1000-0000-000000000001','cccccccc-3650-1000-0000-000000000001','aaaaaaaa-3650-1000-0000-000000000002','receiver365');
INSERT INTO public.resource_copy_history(sender_id,logo_id,offer_id,recipient_identity,recipient_label)
 VALUES('aaaaaaaa-3650-1000-0000-000000000001','bbbbbbbb-3650-1000-0000-000000000002','cccccccc-3650-1000-0000-000000000002','aaaaaaaa-3650-1000-0000-000000000002','receiver365');
DO $$
DECLARE recipient uuid:='aaaaaaaa-3650-1000-0000-000000000002'; result jsonb; offer public.resource_copy_offers; expiry timestamptz; first_decline timestamptz; gid uuid;
BEGIN
 SELECT * INTO offer FROM public.resource_copy_offers WHERE id='cccccccc-3650-1000-0000-000000000001';
 IF public._copy_offer_deadline(offer) IS DISTINCT FROM offer.created_at+interval '5 days' THEN RAISE EXCEPTION 'initial deadline incorrect'; END IF;
 -- Source edits and all sender-side deletions leave the frozen recipient package.
 UPDATE public.games SET name='Changed365' WHERE id=offer.source_id;
 DELETE FROM public.friendships WHERE requester_id=offer.sender_identity;
 DELETE FROM public.games WHERE id=offer.source_id;
 DELETE FROM public.user_logos WHERE id='bbbbbbbb-3650-1000-0000-000000000002';
 IF EXISTS(SELECT 1 FROM public.resource_copy_history WHERE sender_id=offer.sender_identity) THEN RAISE EXCEPTION 'source deletion retained sender history'; END IF;
 DELETE FROM auth.users WHERE id=offer.sender_identity;
 SELECT * INTO offer FROM public.resource_copy_offers WHERE id=offer.id;
 IF offer.id IS NULL OR offer.sender_id IS NOT NULL OR offer.sender_label<>'sender365' OR offer.payload#>>'{game,name}'<>'Original365' THEN RAISE EXCEPTION 'sender deletion changed or removed the frozen offer'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE id='cccccccc-3650-1000-0000-000000000002' AND payload#>>'{payload,source,text}'='FAMILIADA') THEN RAISE EXCEPTION 'logo package lost after sender deletion'; END IF;
 IF (public._copy_game_accept(offer.id,'aaaaaaaa-3650-1000-0000-000000000003')->>'error') IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'foreign receiver accepted offer'; END IF;
 result:=public._copy_offer_decline(offer.id,recipient);IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'decline failed'; END IF;
 SELECT declined_at INTO first_decline FROM public.resource_copy_offers WHERE id=offer.id;
 PERFORM public._copy_offer_decline(offer.id,recipient);
 IF (SELECT declined_at FROM public.resource_copy_offers WHERE id=offer.id) IS DISTINCT FROM first_decline THEN RAISE EXCEPTION 'repeat decline reset deadline'; END IF;
 IF (public._copy_game_accept(offer.id,recipient)->>'error') IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'declined offer accepted directly'; END IF;
 PERFORM public._copy_offer_undo_decline(offer.id,recipient);
 SELECT * INTO offer FROM public.resource_copy_offers WHERE id=offer.id;
 IF offer.status<>'pending' OR public._copy_offer_deadline(offer) IS DISTINCT FROM first_decline+interval '30 days' THEN RAISE EXCEPTION 'undo reset the rejection clock'; END IF;
 -- Clock after the initial five days: undo follows the same retained model as Bases.
 UPDATE public.resource_copy_offers SET created_at=now()-interval '6 days' WHERE id=offer.id;
 result:=public._copy_game_accept(offer.id,recipient);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'accept after undo failed: %',result; END IF;
 gid:=(result->>'id')::uuid;
 IF (public._copy_game_accept(offer.id,recipient)->>'id') IS DISTINCT FROM gid::text OR (SELECT count(*) FROM public.games WHERE owner_id=recipient)<>1 THEN RAISE EXCEPTION 'accept retry duplicated own game'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=gid AND owner_id=recipient AND name='Original365' AND received_from_label='sender365' AND received_from_identity='aaaaaaaa-3650-1000-0000-000000000001') THEN RAISE EXCEPTION 'own copy provenance changed'; END IF;
 IF (SELECT payload FROM public.resource_copy_offers WHERE id=offer.id) IS NOT NULL THEN RAISE EXCEPTION 'accepted offer retained unnecessary packet'; END IF;
 -- Cleanup of another expired packet and sender history cannot delete an accepted own game.
 UPDATE public.resource_copy_offers SET created_at=now()-interval '5 days' WHERE id='cccccccc-3650-1000-0000-000000000002';
 PERFORM public._copy_graph_cleanup();
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE id='cccccccc-3650-1000-0000-000000000002') OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=gid) THEN RAISE EXCEPTION 'expiry crossed into accepted own resources'; END IF;
 DELETE FROM public.games WHERE id=gid;
 IF (public._copy_game_accept(offer.id,recipient)->>'error') IS DISTINCT FROM 'previously_removed' THEN RAISE EXCEPTION 'accepted replay resurrected deleted own game'; END IF;
 DELETE FROM auth.users WHERE id=recipient;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE recipient_id=recipient) OR EXISTS(SELECT 1 FROM public.game_import_receipts WHERE owner_id=recipient) THEN RAISE EXCEPTION 'recipient account cascade left offers or import receipts'; END IF;
 INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data)
  VALUES('aaaaaaaa-3650-1000-0000-000000000004','receiver365@example.invalid',false,now(),'{"username":"newreceiver365"}');
 IF (public._copy_game_accept(offer.id,'aaaaaaaa-3650-1000-0000-000000000004')->>'error') IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'new owner of old email inherited a copy'; END IF;
 RAISE NOTICE 'Copy365 independent game/logo packages, sender/friend/source deletion, retained decline/undo clock, single game acceptance and recipient cleanup passed';
END $$;
DO $$
DECLARE role365 text;
BEGIN
 FOREACH role365 IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role365,'public.resource_copy_offers','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege(role365,'public.resource_copy_history','SELECT,INSERT,UPDATE,DELETE')
   OR has_function_privilege(role365,'public._copy_game_accept(uuid,uuid)','EXECUTE') OR has_function_privilege(role365,'public._copy_offer_decline(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'prototype private graph exposed to %',role365; END IF;
 END LOOP;
END $$;
ROLLBACK;
