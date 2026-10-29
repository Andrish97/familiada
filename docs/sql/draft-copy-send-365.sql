-- Local prototype of the corrected model. No public API or migration yet.
BEGIN;
CREATE TABLE public.resource_copy_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 sender_identity uuid NOT NULL, sender_label text NOT NULL,
 source_id uuid NOT NULL, resource_kind text NOT NULL CHECK(resource_kind IN('game','logo')),
 variant text NOT NULL, name text NOT NULL,
 request_id uuid NOT NULL, payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','expired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), decided_at timestamptz,
 game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
 logo_id uuid REFERENCES public.user_logos(id) ON DELETE SET NULL,
 CHECK(sender_identity<>recipient_id),
 CHECK((resource_kind='game' AND variant IN('prepared','poll_text','poll_points')) OR
       (resource_kind='logo' AND variant IN('GLYPH_30x10','PIX_150x70'))),
 CHECK(game_id IS NULL OR resource_kind='game'), CHECK(logo_id IS NULL OR resource_kind='logo'),
 CHECK(status NOT IN('declined','expired') OR (game_id IS NULL AND logo_id IS NULL)),
 UNIQUE(sender_identity,request_id,recipient_id)
);
CREATE INDEX copy_inbox ON public.resource_copy_offers(recipient_id,resource_kind,variant,status,created_at);
CREATE INDEX copy_pair ON public.resource_copy_offers(sender_identity,source_id,recipient_id,status,decided_at);
ALTER TABLE public.resource_copy_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_copy_offers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_copy_offers FROM PUBLIC,anon,authenticated;
CREATE TABLE public.resource_copy_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
 logo_id uuid REFERENCES public.user_logos(id) ON DELETE CASCADE,
 offer_id uuid REFERENCES public.resource_copy_offers(id) ON DELETE SET NULL,
 recipient_identity uuid NOT NULL,recipient_label text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(num_nonnulls(game_id,logo_id)=1)
);
ALTER TABLE public.resource_copy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_copy_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_copy_history FROM PUBLIC,anon,authenticated;
ALTER TABLE public.games ADD COLUMN received_from_label text;
ALTER TABLE public.games ADD COLUMN received_from_identity uuid;
ALTER TABLE public.user_logos ADD COLUMN received_from_label text;
ALTER TABLE public.user_logos ADD COLUMN received_from_identity uuid;

CREATE FUNCTION public._copy_pending_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE ids uuid[]; question_ids uuid[]; old_row jsonb; new_row jsonb; kind text:='game';
BEGIN
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME IN('games','user_logos') THEN
  ids:=ARRAY[(old_row->>'id')::uuid,(new_row->>'id')::uuid];
  IF TG_TABLE_NAME='user_logos' THEN kind:='logo'; END IF;
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
CREATE TRIGGER copy_pending_game BEFORE UPDATE OR DELETE ON public.games FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_logo BEFORE UPDATE OR DELETE ON public.user_logos FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_question BEFORE INSERT OR UPDATE OR DELETE ON public.questions FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_answer BEFORE INSERT OR UPDATE OR DELETE ON public.answers FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();
CREATE TRIGGER copy_pending_runtime BEFORE INSERT OR UPDATE OR DELETE ON public.game_state FOR EACH ROW EXECUTE FUNCTION public._copy_pending_guard();

CREATE FUNCTION public._copy_discard(p_offer uuid,p_status text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.resource_copy_offers;
BEGIN
 IF p_status NOT IN('declined','expired') THEN RAISE EXCEPTION 'invalid_copy_decision'; END IF;
 SELECT * INTO item FROM public.resource_copy_offers WHERE id=p_offer FOR UPDATE;
 IF NOT FOUND OR item.status<>'pending' THEN RETURN; END IF;
 -- The authoritative state changes before deleting children, within one transaction.
 UPDATE public.resource_copy_offers SET status=p_status,decided_at=clock_timestamp(),game_id=NULL,logo_id=NULL WHERE id=p_offer;
 IF item.game_id IS NOT NULL THEN DELETE FROM public.games WHERE id=item.game_id AND owner_id=item.recipient_id; END IF;
 IF item.logo_id IS NOT NULL THEN DELETE FROM public.user_logos WHERE id=item.logo_id AND user_id=item.recipient_id; END IF;
END $$;
REVOKE ALL ON FUNCTION public._copy_discard(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._copy_game_send(p_source uuid,p_recipient uuid,p_payload jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); source public.games; existing public.resource_copy_offers; canonical jsonb;
 fingerprint text; expected_type text; offer_id uuid:=gen_random_uuid(); imported jsonb; gid uuid; label text; blocked_until timestamptz;
BEGIN
 IF actor IS NULL OR p_recipient IS NULL OR actor=p_recipient OR p_request IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 PERFORM 1 FROM auth.users u WHERE u.id IN(actor,p_recipient) ORDER BY u.id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE u.id IN(actor,p_recipient) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>2 THEN RETURN jsonb_build_object('ok',false,'error','auth_required'); END IF;
 canonical:=public._game_package_normalize(p_payload);
 fingerprint:=encode(sha256(convert_to(canonical::text,'UTF8')),'hex');
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=actor AND request_id=p_request AND recipient_id=p_recipient FOR UPDATE;
 IF FOUND THEN
  IF existing.source_id IS DISTINCT FROM p_source OR existing.resource_kind<>'game' OR existing.payload_hash IS DISTINCT FROM fingerprint THEN RETURN jsonb_build_object('ok',false,'error','request_conflict'); END IF;
  RETURN jsonb_build_object('ok',true,'already',true,'offer_id',existing.id);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(actor,p_recipient)::text||':'||GREATEST(actor,p_recipient)::text,329));
 PERFORM 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL
  AND ((requester_id=actor AND addressee_id=p_recipient) OR (requester_id=p_recipient AND addressee_id=actor)) FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_friend'); END IF;
 SELECT * INTO source FROM public.games WHERE id=p_source AND owner_id=actor FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF source.type::text NOT IN('prepared','poll_text','poll_points') OR source.status::text NOT IN('draft','ready') THEN RETURN jsonb_build_object('ok',false,'error','not_exportable'); END IF;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE game_id=p_source AND status='pending') THEN RETURN jsonb_build_object('ok',false,'error','received_copy_pending'); END IF;
 expected_type:=CASE WHEN source.type::text<>'prepared' AND source.status::text='ready' THEN 'prepared' ELSE source.type::text END;
 IF canonical#>>'{game,type}' IS DISTINCT FROM expected_type OR canonical#>>'{game,name}' IS DISTINCT FROM coalesce(nullif(trim(source.name),''),'Gra') THEN RETURN jsonb_build_object('ok',false,'error','source_changed'); END IF;
 SELECT max(decided_at+interval '30 days') INTO blocked_until FROM public.resource_copy_offers
  WHERE sender_identity=actor AND source_id=p_source AND recipient_id=p_recipient AND status='declined';
 IF blocked_until>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','declined_cooldown','cooldown_until',blocked_until); END IF;
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=actor AND source_id=p_source AND recipient_id=p_recipient AND status='pending' FOR UPDATE;
 IF FOUND THEN
  IF existing.created_at+interval '5 days'>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','already_sent'); END IF;
  PERFORM public._copy_discard(existing.id,'expired');
 END IF;
 imported:=public._game_import_package(canonical,p_recipient,offer_id);
 IF imported->>'ok' IS DISTINCT FROM 'true' THEN RETURN imported; END IF;
 gid:=(imported->>'id')::uuid;
 SELECT coalesce(nullif(p.username,''),u.email) INTO label FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=actor;
 UPDATE public.games SET received_from_label=label,received_from_identity=actor WHERE id=gid AND owner_id=p_recipient;
 INSERT INTO public.resource_copy_offers(id,recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,request_id,payload_hash,game_id)
  VALUES(offer_id,p_recipient,actor,actor,label,p_source,'game',expected_type,canonical#>>'{game,name}',p_request,fingerprint,gid);
 INSERT INTO public.resource_copy_history(sender_id,game_id,offer_id,recipient_identity,recipient_label)
  SELECT actor,p_source,offer_id,p_recipient,coalesce(nullif(p.username,''),u.email) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=p_recipient;
 RETURN jsonb_build_object('ok',true,'already',false,'offer_id',offer_id);
END $$;
REVOKE ALL ON FUNCTION public._copy_game_send(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._copy_decide(p_offer uuid,p_decision text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); item public.resource_copy_offers; target uuid;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'error','auth_required'); END IF;
 IF p_decision NOT IN('accept','decline') THEN RETURN jsonb_build_object('ok',false,'error','invalid_decision'); END IF;
 PERFORM 1 FROM auth.users WHERE id=actor FOR NO KEY UPDATE NOWAIT;
 SELECT * INTO item FROM public.resource_copy_offers WHERE id=p_offer AND recipient_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF item.status IN('declined','expired') THEN RETURN jsonb_build_object('ok',false,'error',item.status); END IF;
 IF item.status='accepted' AND p_decision='decline' THEN RETURN jsonb_build_object('ok',false,'error','already_accepted'); END IF;
 IF item.status='pending' AND item.created_at+interval '5 days'<=clock_timestamp() THEN
  PERFORM public._copy_discard(item.id,'expired'); RETURN jsonb_build_object('ok',false,'error','expired');
 END IF;
 IF p_decision='decline' THEN PERFORM public._copy_discard(item.id,'declined'); RETURN jsonb_build_object('ok',true); END IF;
 target:=CASE item.resource_kind WHEN 'game' THEN item.game_id ELSE item.logo_id END;
 IF target IS NULL THEN RETURN jsonb_build_object('ok',false,'error','previously_removed'); END IF;
 UPDATE public.resource_copy_offers SET status='accepted',decided_at=coalesce(decided_at,clock_timestamp()) WHERE id=item.id;
 RETURN jsonb_build_object('ok',true,'id',target,'already',item.status='accepted');
END $$;
REVOKE ALL ON FUNCTION public._copy_decide(uuid,text) FROM PUBLIC,anon,authenticated;
COMMIT;
