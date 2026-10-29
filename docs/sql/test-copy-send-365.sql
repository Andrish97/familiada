BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3651-1000-0000-000000000001','send365@example.invalid',false,now(),'{"username":"send365"}'),
 ('aaaaaaaa-3651-1000-0000-000000000002','inbox365@example.invalid',false,now(),'{"username":"inbox365"}'),
 ('aaaaaaaa-3651-1000-0000-000000000003','other365send@example.invalid',false,now(),'{"username":"other365send"}');
INSERT INTO public.friendships(requester_id,addressee_id,decision_user_id,status)
 VALUES('aaaaaaaa-3651-1000-0000-000000000001','aaaaaaaa-3651-1000-0000-000000000002','aaaaaaaa-3651-1000-0000-000000000002','active');
DO $$
DECLARE sender uuid:='aaaaaaaa-3651-1000-0000-000000000001'; recipient uuid:='aaaaaaaa-3651-1000-0000-000000000002';
 typ text; source_id uuid; request_id uuid; packet jsonb; result jsonb; offer public.resource_copy_offers;
 offers uuid[]:='{}'; copies uuid[]:='{}'; srcs uuid[]:='{}'; question365 uuid; answer_id uuid; statement text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',sender::text,true);
 FOREACH typ IN ARRAY ARRAY['prepared','poll_text','poll_points'] LOOP
  INSERT INTO public.games(owner_id,name,type,status) VALUES(sender,'Source365-'||typ,typ::public.game_type,'draft') RETURNING id INTO source_id;
  srcs:=srcs||source_id; request_id:=gen_random_uuid();
  packet:=jsonb_build_object('game',jsonb_build_object('name','Source365-'||typ,'type',typ),'questions',
   jsonb_build_array(jsonb_build_object('text','Co zabieramy?','answers',CASE WHEN typ='poll_text' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('text','Aparat','fixed_points',CASE WHEN typ='prepared' THEN 20 ELSE 0 END)) END)));
  PERFORM public.game_import_content(source_id,'Source365-'||typ,packet->'questions');
  result:=public._copy_game_send(source_id,recipient,packet,request_id);
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'send failed: %',result; END IF;
  SELECT * INTO offer FROM public.resource_copy_offers WHERE id=(result->>'offer_id')::uuid;
  offers:=offers||offer.id; copies:=copies||offer.game_id;
  IF offer.status<>'pending' OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=offer.game_id AND owner_id=recipient AND name='Source365-'||typ AND type::text=typ AND status='draft') THEN RAISE EXCEPTION 'own game was not created during Send'; END IF;
  IF (SELECT count(*) FROM public.questions WHERE game_id=offer.game_id)<>1 THEN RAISE EXCEPTION 'missing own questions before acceptance'; END IF;
  IF (SELECT count(*) FROM public.answers a JOIN public.questions q ON q.id=a.question_id WHERE q.game_id=offer.game_id)<>(CASE WHEN typ='poll_text' THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'missing own answers before acceptance'; END IF;
  IF (public._copy_game_send(source_id,recipient,packet,request_id)->>'offer_id') IS DISTINCT FROM offer.id::text THEN RAISE EXCEPTION 'retry created a duplicate offer'; END IF;
  IF (public._copy_game_send(source_id,recipient,packet,gen_random_uuid())->>'error') IS DISTINCT FROM 'already_sent' THEN RAISE EXCEPTION 'pending duplicate accepted'; END IF;
  IF (public._copy_game_send(source_id,'aaaaaaaa-3651-1000-0000-000000000003',packet,gen_random_uuid())->>'error') IS DISTINCT FROM 'not_friend' THEN RAISE EXCEPTION 'non-friend got a game'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.games WHERE owner_id=recipient)<>3 THEN RAISE EXCEPTION 'Send produced duplicate owned resources'; END IF;
 SELECT id INTO question365 FROM public.questions WHERE game_id=copies[1];
 SELECT a.id INTO answer_id FROM public.answers a WHERE a.question_id=question365;
 -- Every attempted legacy mutation must remain blocked before acceptance.
 FOREACH statement IN ARRAY ARRAY[
  format('UPDATE public.games SET name=''Changed'' WHERE id=%L',copies[1]),
  format('DELETE FROM public.games WHERE id=%L',copies[1]),
  format('UPDATE public.questions SET text=''Changed'' WHERE game_id=%L',copies[1]),
  format('INSERT INTO public.questions(game_id,ord,text) VALUES(%L,2,''Changed'')',copies[1]),
  format('UPDATE public.answers SET fixed_points=21 WHERE id=%L',answer_id),
  format('INSERT INTO public.game_state(game_id) VALUES(%L)',copies[1])
 ] LOOP
  BEGIN EXECUTE statement; RAISE EXCEPTION 'pending mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'received_copy_pending' THEN RAISE; END IF; END;
 END LOOP;
 -- An additional pending copy proves account deletion can cascade through its guards.
 INSERT INTO public.games(owner_id,name,type,status) VALUES(sender,'Parent365','prepared','draft') RETURNING id INTO source_id;
 result:=public._copy_game_send(source_id,recipient,'{"game":{"name":"Parent365","type":"prepared"},"questions":[]}',gen_random_uuid());
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'parent fixture failed'; END IF;
 DELETE FROM public.games WHERE id=ANY(srcs);
 DELETE FROM public.friendships WHERE requester_id=sender;
 DELETE FROM auth.users WHERE id=sender;
 IF (SELECT count(*) FROM public.games WHERE owner_id=recipient)<>4 OR EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE sender_id=sender) THEN RAISE EXCEPTION 'sender/source/friend deletion invalidated the recipient'; END IF;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-3651-1000-0000-000000000003',true);
 IF (public._copy_decide(offers[1],'accept')->>'error') IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'foreign acceptance allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',recipient::text,true);
 result:=public._copy_decide(offers[1],'accept');
 IF result->>'id' IS DISTINCT FROM copies[1]::text OR (public._copy_decide(offers[1],'accept')->>'id') IS DISTINCT FROM copies[1]::text THEN RAISE EXCEPTION 'acceptance changed the existing game ID'; END IF;
 UPDATE public.games SET name='Accepted own game' WHERE id=copies[1];
 result:=public._copy_decide(offers[2],'decline');
 IF result->>'ok' IS DISTINCT FROM 'true' OR EXISTS(SELECT 1 FROM public.games WHERE id=copies[2]) OR EXISTS(SELECT 1 FROM public.questions WHERE game_id=copies[2]) THEN RAISE EXCEPTION 'decline retained the own resource'; END IF;
 IF (public._copy_decide(offers[2],'accept')->>'error') IS DISTINCT FROM 'declined' THEN RAISE EXCEPTION 'declined copy was restored'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='resource_copy_offers' AND column_name='payload') THEN RAISE EXCEPTION 'a restorable packet is retained'; END IF;
 UPDATE public.resource_copy_offers SET created_at=now()-interval '5 days' WHERE id=offers[3];
 result:=public._copy_decide(offers[3],'accept');
 IF result->>'error' IS DISTINCT FROM 'expired' OR EXISTS(SELECT 1 FROM public.games WHERE id=copies[3]) THEN RAISE EXCEPTION 'expiry kept the waiting game: %',result; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=copies[1] AND received_from_label='send365' AND received_from_identity=sender) THEN RAISE EXCEPTION 'accepted provenance depended on the deleted sender'; END IF;
 DELETE FROM auth.users WHERE id=recipient;
 IF EXISTS(SELECT 1 FROM public.games WHERE owner_id=recipient) OR EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE recipient_id=recipient) OR EXISTS(SELECT 1 FROM public.game_import_receipts WHERE owner_id=recipient) THEN RAISE EXCEPTION 'account deletion failed to remove accepted/pending copies'; END IF;
 RAISE NOTICE 'Copy365 corrected Send-time model: three own types before acceptance, legacy mutation guards, stable IDs, irreversible deletion, expiry and parent cascades passed';
END $$;
ROLLBACK;
