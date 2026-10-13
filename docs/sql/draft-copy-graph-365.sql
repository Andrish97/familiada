-- Historical local E19C prototype: superseded by creation during Send (2026-10-13).
-- Do not deploy: it creates the own game during acceptance, contrary to the new decision.
BEGIN;
CREATE TABLE public.resource_copy_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 sender_identity uuid NOT NULL,
 sender_label text NOT NULL,
 source_id uuid NOT NULL,
 resource_kind text NOT NULL CHECK(resource_kind IN('game','logo')),
 variant text NOT NULL,
 name text NOT NULL,
 payload jsonb,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 request_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','declined','accepted')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 declined_at timestamptz,
 accepted_at timestamptz,
 accepted_game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
 accepted_logo_id uuid REFERENCES public.user_logos(id) ON DELETE SET NULL,
 CHECK((resource_kind='game' AND variant IN('prepared','poll_text','poll_points')) OR
       (resource_kind='logo' AND variant IN('GLYPH_30x10','PIX_150x70'))),
 CHECK(sender_identity<>recipient_id),
 CHECK(status='accepted' OR payload IS NOT NULL),
 CHECK(payload IS NULL OR payload_hash=encode(sha256(convert_to(payload::text,'UTF8')),'hex')),
 CHECK((status='accepted')=(accepted_at IS NOT NULL)),
 CHECK(status<>'declined' OR declined_at IS NOT NULL),
 CHECK(accepted_game_id IS NULL OR resource_kind='game'),
 CHECK(accepted_logo_id IS NULL OR resource_kind='logo'),
 UNIQUE(sender_identity,request_id,recipient_id)
);
CREATE INDEX resource_copy_offers_inbox ON public.resource_copy_offers(recipient_id,resource_kind,variant,status,created_at);
CREATE INDEX resource_copy_offers_pair ON public.resource_copy_offers(sender_identity,source_id,recipient_id,declined_at);
ALTER TABLE public.resource_copy_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_copy_offers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_copy_offers FROM PUBLIC,anon,authenticated;

-- Sender history belongs to the original resource; the recipient offer does not.
CREATE TABLE public.resource_copy_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
 logo_id uuid REFERENCES public.user_logos(id) ON DELETE CASCADE,
 offer_id uuid REFERENCES public.resource_copy_offers(id) ON DELETE SET NULL,
 recipient_identity uuid NOT NULL,
 recipient_label text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(game_id,logo_id)=1)
);
CREATE INDEX resource_copy_history_resource ON public.resource_copy_history(sender_id,game_id,logo_id,sent_at);
ALTER TABLE public.resource_copy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_copy_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_copy_history FROM PUBLIC,anon,authenticated;

ALTER TABLE public.games ADD COLUMN received_from_label text;
ALTER TABLE public.games ADD COLUMN received_from_identity uuid;
ALTER TABLE public.user_logos ADD COLUMN received_from_label text;
ALTER TABLE public.user_logos ADD COLUMN received_from_identity uuid;

CREATE FUNCTION public._copy_offer_deadline(p_offer public.resource_copy_offers)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(p_offer.declined_at+interval '30 days',p_offer.created_at+interval '5 days');
$$;
REVOKE ALL ON FUNCTION public._copy_offer_deadline(public.resource_copy_offers) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._copy_offer_lock(p_id uuid,p_recipient uuid)
RETURNS public.resource_copy_offers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE offer public.resource_copy_offers;
BEGIN
 PERFORM 1 FROM auth.users u WHERE u.id=p_recipient AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO offer FROM public.resource_copy_offers WHERE id=p_id AND recipient_id=p_recipient FOR UPDATE;
 RETURN offer;
END $$;
REVOKE ALL ON FUNCTION public._copy_offer_lock(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._copy_offer_decline(p_id uuid,p_recipient uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE offer public.resource_copy_offers;
BEGIN
 offer:=public._copy_offer_lock(p_id,p_recipient);
 IF offer.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF offer.status='accepted' THEN RETURN jsonb_build_object('ok',false,'error','already_accepted'); END IF;
 IF public._copy_offer_deadline(offer)<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
 UPDATE public.resource_copy_offers SET status='declined',declined_at=coalesce(declined_at,clock_timestamp()) WHERE id=offer.id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public._copy_offer_decline(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._copy_offer_undo_decline(p_id uuid,p_recipient uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE offer public.resource_copy_offers;
BEGIN
 offer:=public._copy_offer_lock(p_id,p_recipient);
 IF offer.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF offer.status<>'declined' THEN RETURN jsonb_build_object('ok',false,'error','not_declined'); END IF;
 IF public._copy_offer_deadline(offer)<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
 UPDATE public.resource_copy_offers SET status='pending' WHERE id=offer.id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public._copy_offer_undo_decline(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._copy_game_accept(p_id uuid,p_recipient uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE offer public.resource_copy_offers; imported jsonb; gid uuid;
BEGIN
 offer:=public._copy_offer_lock(p_id,p_recipient);
 IF offer.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF offer.resource_kind<>'game' THEN RETURN jsonb_build_object('ok',false,'error','wrong_kind'); END IF;
 IF offer.status='accepted' THEN
  IF offer.accepted_game_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=offer.accepted_game_id AND owner_id=p_recipient) THEN RETURN jsonb_build_object('ok',false,'error','previously_removed'); END IF;
  RETURN jsonb_build_object('ok',true,'id',offer.accepted_game_id,'already',true);
 END IF;
 IF public._copy_offer_deadline(offer)<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
 IF offer.status='declined' THEN RETURN jsonb_build_object('ok',false,'error','declined'); END IF;
 -- The same importer and a stable offer ID: one complete own game after retries.
 imported:=public._game_import_package(offer.payload,p_recipient,offer.id);
 IF imported->>'ok' IS DISTINCT FROM 'true' THEN RETURN imported; END IF;
 gid:=(imported->>'id')::uuid;
 UPDATE public.games SET received_from_label=offer.sender_label,received_from_identity=offer.sender_identity WHERE id=gid AND owner_id=p_recipient;
 UPDATE public.resource_copy_offers SET status='accepted',accepted_at=clock_timestamp(),accepted_game_id=gid,payload=NULL WHERE id=offer.id;
 RETURN imported;
END $$;
REVOKE ALL ON FUNCTION public._copy_game_accept(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._copy_graph_cleanup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 DELETE FROM public.resource_copy_history WHERE sent_at<=clock_timestamp()-interval '30 days';
 DELETE FROM public.resource_copy_offers o WHERE status IN('pending','declined') AND public._copy_offer_deadline(o)<=clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION public._copy_graph_cleanup() FROM PUBLIC,anon,authenticated;
COMMIT;
