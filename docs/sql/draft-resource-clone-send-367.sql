-- Private local Send prototype after366. No public endpoint or grants.
CREATE FUNCTION public._resource_clone_check_assets(p_kind text,p_job uuid,p_definition jsonb,p_storage_base text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE ref text;
BEGIN
 IF p_kind='logo' THEN
  IF p_storage_base IS NULL OR p_storage_base !~ '^https://[a-zA-Z0-9.-]+$' THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
  FOR ref IN SELECT public._logo_clone_image_refs(p_definition#>'{payload,source}') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.resource_clone_assets a JOIN storage.objects o ON o.bucket_id='user-logos' AND o.name=a.destination_path
    WHERE a.job_id=p_job AND ref=p_storage_base||'/storage/v1/object/public/user-logos/'||a.destination_path AND
     o.metadata->>'mimetype'=a.mime AND (o.metadata->>'size')::bigint=a.byte_size AND
     (a.source_kind<>'storage' OR trim(both '"' from o.metadata->>'eTag')=a.etag)) THEN RAISE EXCEPTION 'unmaterialized_copy_image'; END IF;
  END LOOP;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_check_assets(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_send_name(p_kind text,p_owner uuid,p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original text:=left(trim(p_name),80); candidate text; number integer:=1; tail text;
BEGIN
 IF coalesce(original,'')='' OR p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'invalid_copy_name'; END IF;
 LOOP
  tail:=CASE WHEN number=1 THEN '' ELSE ' '||number::text END;
  candidate:=left(original,80-length(tail))||tail;
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE p_kind='game' AND owner_id=p_owner AND name=candidate) AND
     NOT EXISTS(SELECT 1 FROM public.user_logos WHERE p_kind='logo' AND user_id=p_owner AND name=candidate) THEN RETURN candidate; END IF;
  number:=number+1;
  IF number>10000 THEN RAISE EXCEPTION 'copy_name_unavailable'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_send_name(text,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_finish_send(p_actor uuid,p_job uuid,p_definition jsonb,p_demo boolean,p_storage_base text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_clone_jobs; existing public.resource_copy_offers; hash text; target uuid; offer_id uuid;
 blocked_until timestamptz; imported jsonb; label text; receiver_label text; key text[]; named jsonb; variant text;
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor;
 IF NOT FOUND OR item.action<>'send' THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 PERFORM 1 FROM auth.users WHERE id IN(p_actor,item.recipient_id) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,item.recipient_id) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>2 THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job FOR UPDATE NOWAIT;
 key:=CASE item.resource_kind WHEN 'game' THEN ARRAY['game','name'] ELSE ARRAY['name'] END;
 hash:=encode(sha256(convert_to((p_definition #- key)::text,'UTF8')),'hex');
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND request_id=item.request_id;
 IF item.status='complete' THEN
  IF item.definition_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'request_conflict'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('ok',true,'offer_id',existing.id,'already',true);
 END IF;
 IF item.status IN('removed','expired') THEN RAISE EXCEPTION 'previously_removed'; END IF;
 IF item.created_at+interval '1 hour'<=clock_timestamp() THEN
  UPDATE public.resource_clone_jobs SET status='expired',source_snapshot=NULL WHERE id=p_job;
  PERFORM public._resource_clone_cleanup(item.recipient_id,p_job);
  RETURN jsonb_build_object('ok',false,'error','expired');
 END IF;
 IF p_demo IS DISTINCT FROM false OR coalesce((item.source_snapshot->>'demo_origin')::boolean,false) OR coalesce((item.source_snapshot#>>ARRAY[item.resource_kind,'is_demo'])::boolean,false) THEN RAISE EXCEPTION 'demo_not_sendable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_actor,item.recipient_id)::text||':'||GREATEST(p_actor,item.recipient_id)::text,329));
 PERFORM 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL AND
  ((requester_id=p_actor AND addressee_id=item.recipient_id) OR (requester_id=item.recipient_id AND addressee_id=p_actor)) FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_friend'; END IF;
 SELECT max(decided_at+interval '30 days') INTO blocked_until FROM public.resource_copy_offers
  WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND source_id=item.source_id AND status='declined';
 IF blocked_until>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','declined_cooldown','cooldown_until',blocked_until); END IF;
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND source_id=item.source_id AND status='pending' FOR UPDATE;
 IF FOUND THEN
  IF existing.created_at+interval '5 days'>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','already_sent'); END IF;
  PERFORM public._copy_discard(existing.id,'expired');
 END IF;
 PERFORM public._resource_clone_check_assets(item.resource_kind,p_job,p_definition,p_storage_base);
 named:=jsonb_set(p_definition,key,to_jsonb(public._resource_clone_send_name(item.resource_kind,item.recipient_id,p_definition#>>key)));
 imported:=public._resource_clone_write(p_actor,item.recipient_id,item.resource_kind,'send',item.source_id,item.request_id,named,false);
 IF imported->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'clone_import_failed'; END IF;
 target:=(imported->>'id')::uuid;
 SELECT coalesce(nullif(p.username,''),u.email) INTO label FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=p_actor;
 SELECT coalesce(nullif(p.username,''),u.email) INTO receiver_label FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=item.recipient_id;
 IF item.resource_kind='game' THEN
  UPDATE public.games SET received_from_label=label,received_from_identity=p_actor WHERE id=target;
  variant:=named#>>'{game,type}';
 ELSE
  UPDATE public.user_logos SET received_from_label=label,received_from_identity=p_actor WHERE id=target;
  variant:=named->>'type';
 END IF;
 INSERT INTO public.resource_copy_offers(recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,request_id,payload_hash,game_id,logo_id)
 VALUES(item.recipient_id,p_actor,p_actor,label,item.source_id,item.resource_kind,variant,named#>>key,item.request_id,hash,
  CASE WHEN item.resource_kind='game' THEN target END,CASE WHEN item.resource_kind='logo' THEN target END) RETURNING id INTO offer_id;
 INSERT INTO public.resource_copy_history(sender_id,game_id,logo_id,offer_id,recipient_identity,recipient_label)
 VALUES(p_actor,CASE WHEN item.resource_kind='game' THEN item.source_id END,CASE WHEN item.resource_kind='logo' THEN item.source_id END,offer_id,item.recipient_id,receiver_label);
 UPDATE public.resource_clone_jobs SET status='complete',source_snapshot=NULL,definition_hash=hash,completed_at=clock_timestamp(),
  game_id=CASE WHEN resource_kind='game' THEN target END,logo_id=CASE WHEN resource_kind='logo' THEN target END WHERE id=p_job;
 UPDATE public.resource_clone_assets SET reference='' WHERE job_id=p_job;
 RETURN jsonb_build_object('ok',true,'offer_id',offer_id,'already',false);
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_finish_send(uuid,uuid,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;

-- Before public Send, extend the existing pending guard to every operational
-- game descendant. Clone receipts/manifests and the offers themselves are
-- lifecycle metadata and must remain writable by the private transaction.
CREATE OR REPLACE FUNCTION public._copy_pending_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE ids uuid[]; question_ids uuid[]; old_row jsonb; new_row jsonb; kind text:='game';
BEGIN
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME IN('games','user_logos') THEN
  ids:=ARRAY[(old_row->>'id')::uuid,(new_row->>'id')::uuid];
  IF TG_TABLE_NAME='user_logos' THEN kind:='logo'; END IF;
 ELSIF TG_TABLE_NAME='market_games' THEN
  ids:=ARRAY[(old_row->>'source_game_id')::uuid,(new_row->>'source_game_id')::uuid];
 ELSIF TG_TABLE_NAME='answers' THEN
  question_ids:=ARRAY[(old_row->>'question_id')::uuid,(new_row->>'question_id')::uuid];
  SELECT array_agg(game_id) INTO ids FROM public.questions WHERE id=ANY(question_ids);
 ELSE ids:=ARRAY[(old_row->>'game_id')::uuid,(new_row->>'game_id')::uuid]; END IF;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers o JOIN auth.users u ON u.id=o.recipient_id
  WHERE o.status='pending' AND u.deleted_at IS NULL AND o.resource_kind=kind
   AND CASE kind WHEN 'game' THEN o.game_id ELSE o.logo_id END=ANY(ids)) THEN
  RAISE EXCEPTION 'received_copy_pending';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public._copy_pending_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER copy_pending_control_device_link_tokens BEFORE INSERT OR UPDATE OR DELETE ON public.control_device_link_tokens FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_control_device_shares BEFORE INSERT OR UPDATE OR DELETE ON public.control_device_shares FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_control_runtime_sessions BEFORE INSERT OR UPDATE OR DELETE ON public.control_runtime_sessions FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_device_connect_codes BEFORE INSERT OR UPDATE OR DELETE ON public.device_connect_codes FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_device_presence BEFORE INSERT OR UPDATE OR DELETE ON public.device_presence FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_display_audio_unlock BEFORE INSERT OR UPDATE OR DELETE ON public.display_audio_unlock FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_game_session_active BEFORE INSERT OR UPDATE OR DELETE ON public.game_session_active FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_game_sessions BEFORE INSERT OR UPDATE OR DELETE ON public.game_sessions FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_game_state_history BEFORE INSERT OR UPDATE OR DELETE ON public.game_state_history FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_anonymous_limits BEFORE INSERT OR UPDATE OR DELETE ON public.poll_anonymous_limits FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_sessions BEFORE INSERT OR UPDATE OR DELETE ON public.poll_sessions FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_tally_drafts BEFORE INSERT OR UPDATE OR DELETE ON public.poll_tally_drafts FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_tasks BEFORE INSERT OR UPDATE OR DELETE ON public.poll_tasks FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_text_entries BEFORE INSERT OR UPDATE OR DELETE ON public.poll_text_entries FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_poll_votes BEFORE INSERT OR UPDATE OR DELETE ON public.poll_votes FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_shared_devices BEFORE INSERT OR UPDATE OR DELETE ON public.shared_devices FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_market_games BEFORE INSERT OR UPDATE OR DELETE ON public.market_games FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_user_market_library BEFORE INSERT OR UPDATE OR DELETE ON public.user_market_library FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
