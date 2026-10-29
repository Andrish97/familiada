--365: additive common clone engine for Games/Bases/Logo.
-- Existing routes keep working; private RPCs are used only by the authenticated Worker.
BEGIN;

-- draft-copy-send-365.sql
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

-- draft-resource-demo-origin-365.sql
CREATE TABLE public.resource_demo_origins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 game_id uuid UNIQUE REFERENCES public.games(id) ON DELETE CASCADE,
 base_id uuid UNIQUE REFERENCES public.question_bases(id) ON DELETE CASCADE,
 logo_id uuid UNIQUE REFERENCES public.user_logos(id) ON DELETE CASCADE,
 CHECK(num_nonnulls(game_id,base_id,logo_id)=1)
);
ALTER TABLE public.resource_demo_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_demo_origins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_demo_origins FROM PUBLIC,anon,authenticated;
INSERT INTO public.resource_demo_origins(owner_id,game_id) SELECT owner_id,id FROM public.games WHERE is_demo;
INSERT INTO public.resource_demo_origins(owner_id,base_id) SELECT owner_id,id FROM public.question_bases WHERE is_demo;
INSERT INTO public.resource_demo_origins(owner_id,logo_id) SELECT user_id,id FROM public.user_logos WHERE is_demo;
CREATE FUNCTION public._resource_demo_origin_mark() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.is_demo THEN
  IF TG_TABLE_NAME='games' THEN INSERT INTO public.resource_demo_origins(owner_id,game_id) VALUES(NEW.owner_id,NEW.id) ON CONFLICT(game_id) DO NOTHING;
  ELSIF TG_TABLE_NAME='question_bases' THEN INSERT INTO public.resource_demo_origins(owner_id,base_id) VALUES(NEW.owner_id,NEW.id) ON CONFLICT(base_id) DO NOTHING;
  ELSE INSERT INTO public.resource_demo_origins(owner_id,logo_id) VALUES(NEW.user_id,NEW.id) ON CONFLICT(logo_id) DO NOTHING; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._resource_demo_origin_mark() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER clone_demo_origin AFTER INSERT OR UPDATE OF is_demo ON public.games FOR EACH ROW EXECUTE FUNCTION public._resource_demo_origin_mark();
CREATE TRIGGER clone_demo_origin AFTER INSERT OR UPDATE OF is_demo ON public.question_bases FOR EACH ROW EXECUTE FUNCTION public._resource_demo_origin_mark();
CREATE TRIGGER clone_demo_origin AFTER INSERT OR UPDATE OF is_demo ON public.user_logos FOR EACH ROW EXECUTE FUNCTION public._resource_demo_origin_mark();

-- draft-resource-clone-source-365.sql
CREATE TABLE public.resource_clone_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 creator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 creator_identity uuid NOT NULL, request_id uuid NOT NULL, source_id uuid NOT NULL,
 resource_kind text NOT NULL CHECK(resource_kind IN('game','base','logo')),
 action text NOT NULL CHECK(action IN('duplicate','send')),
 demo_origin boolean NOT NULL DEFAULT false, definition_hash text NOT NULL,
 game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
 base_id uuid REFERENCES public.question_bases(id) ON DELETE SET NULL,
 logo_id uuid REFERENCES public.user_logos(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(game_id,base_id,logo_id)<=1),
 CHECK(game_id IS NULL OR resource_kind='game'),CHECK(base_id IS NULL OR resource_kind='base'),CHECK(logo_id IS NULL OR resource_kind='logo'),
 CHECK((action='duplicate' AND creator_identity=recipient_id) OR (action='send' AND creator_identity<>recipient_id AND resource_kind<>'base')),
 UNIQUE(creator_identity,recipient_id,request_id)
);
ALTER TABLE public.resource_clone_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_clone_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_clone_receipts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_read(p_actor uuid,p_kind text,p_source uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE root jsonb; snapshot jsonb; templates jsonb; inherited_demo boolean;
BEGIN
 IF p_actor IS NULL OR p_kind IS NULL OR p_kind NOT IN('game','base','logo') OR p_source IS NULL THEN RAISE EXCEPTION 'invalid_copy_source'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'auth_required'; END IF;
 -- Parent locks prevent new child FK insertions while reading the definition.
 IF p_kind='game' THEN
  SELECT jsonb_build_object('id',g.id,'name',g.name,'type',g.type,'status',g.status,'is_demo',g.is_demo) INTO root
   FROM public.games g WHERE id=p_source AND owner_id=p_actor FOR UPDATE NOWAIT;
 ELSIF p_kind='base' THEN
  SELECT jsonb_build_object('id',b.id,'name',b.name,'is_demo',b.is_demo) INTO root
   FROM public.question_bases b WHERE id=p_source AND owner_id=p_actor FOR UPDATE NOWAIT;
 ELSE
  SELECT jsonb_build_object('id',l.id,'name',l.name,'type',l.type,'payload',l.payload,'is_demo',l.is_demo) INTO root
   FROM public.user_logos l WHERE id=p_source AND user_id=p_actor FOR UPDATE NOWAIT;
 END IF;
 IF root IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers o WHERE status='pending' AND
  CASE p_kind WHEN 'game' THEN o.game_id WHEN 'logo' THEN o.logo_id END=p_source) THEN RAISE EXCEPTION 'received_copy_pending'; END IF;
 IF p_kind='game' AND root->>'status' NOT IN('draft','ready') THEN RAISE EXCEPTION 'not_exportable'; END IF;
 IF p_kind='game' AND root->>'type' NOT IN('prepared','poll_text','poll_points') THEN RAISE EXCEPTION 'not_exportable'; END IF;
 IF EXISTS(SELECT 1 FROM public.edit_locks l WHERE heartbeat_at>clock_timestamp()-public.edit_lock_ttl() AND (
  (l.resource_type=p_kind AND l.resource_id=p_source) OR
  (p_kind='logo' AND l.resource_type='logos' AND l.resource_id=p_actor) OR
  (p_kind='base' AND (
   (l.resource_type='base_question' AND l.resource_id IN(SELECT id FROM public.qb_questions WHERE base_id=p_source)) OR
   (l.resource_type='base_folder' AND l.resource_id IN(SELECT id FROM public.qb_categories WHERE base_id=p_source)) OR
   (l.resource_type='base_tag' AND l.resource_id IN(SELECT id FROM public.qb_tags WHERE base_id=p_source))))
 )) THEN RAISE EXCEPTION 'resource_in_use'; END IF;
 IF p_kind='game' THEN
  PERFORM 1 FROM public.questions WHERE game_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.answers a JOIN public.questions q ON q.id=a.question_id WHERE q.game_id=p_source ORDER BY a.id FOR SHARE OF a NOWAIT;
  SELECT jsonb_build_object('game',root,'questions',coalesce(jsonb_agg(jsonb_build_object('text',q.text,'answers',coalesce((
   SELECT jsonb_agg(jsonb_build_object('text',a.text,'fixed_points',a.fixed_points) ORDER BY a.ord,a.id)
    FROM public.answers a WHERE a.question_id=q.id),'[]'::jsonb)) ORDER BY q.ord,q.id),'[]'::jsonb)) INTO snapshot
   FROM public.questions q WHERE q.game_id=p_source;
 ELSIF p_kind='base' THEN
  PERFORM 1 FROM public.qb_categories WHERE base_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.qb_tags WHERE base_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.qb_questions WHERE base_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.qb_question_tags e JOIN public.qb_questions q ON q.id=e.question_id WHERE q.base_id=p_source ORDER BY e.question_id,e.tag_id FOR SHARE OF e NOWAIT;
  PERFORM 1 FROM public.qb_category_tags e JOIN public.qb_categories c ON c.id=e.category_id WHERE c.base_id=p_source ORDER BY e.category_id,e.tag_id FOR SHARE OF e NOWAIT;
  snapshot:=jsonb_build_object('base',root,
   'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'name',name,'ord',ord) ORDER BY ord,id) FROM public.qb_categories WHERE base_id=p_source),'[]'),
   'tags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'ord',ord) ORDER BY ord,id) FROM public.qb_tags WHERE base_id=p_source),'[]'),
   'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'ord',ord,'payload',payload) ORDER BY ord,id) FROM public.qb_questions WHERE base_id=p_source),'[]'),
   'question_tags',coalesce((SELECT jsonb_agg(jsonb_build_object('question_id',e.question_id,'tag_id',e.tag_id) ORDER BY e.question_id,e.tag_id) FROM public.qb_question_tags e JOIN public.qb_questions q ON q.id=e.question_id WHERE q.base_id=p_source),'[]'),
   'category_tags',coalesce((SELECT jsonb_agg(jsonb_build_object('category_id',e.category_id,'tag_id',e.tag_id) ORDER BY e.category_id,e.tag_id) FROM public.qb_category_tags e JOIN public.qb_categories c ON c.id=e.category_id WHERE c.base_id=p_source),'[]'));
 ELSE snapshot:=jsonb_build_object('logo',root); END IF;
 SELECT coalesce(bool_or(demo_origin),false) INTO inherited_demo FROM public.resource_clone_receipts
  WHERE recipient_id=p_actor AND CASE p_kind WHEN 'game' THEN game_id WHEN 'base' THEN base_id ELSE logo_id END=p_source;
 inherited_demo:=inherited_demo OR EXISTS(SELECT 1 FROM public.resource_demo_origins WHERE CASE p_kind WHEN 'game' THEN game_id WHEN 'base' THEN base_id ELSE logo_id END=p_source);
 SELECT coalesce(jsonb_agg(jsonb_build_object('slot',slot,'lang',lang,'payload',payload) ORDER BY slot,lang),'[]') INTO templates FROM public.demo_template_data
  WHERE (p_kind='game' AND payload ? 'game') OR (p_kind='logo' AND slot LIKE 'logo_%');
 RETURN snapshot||jsonb_build_object('demo_origin',inherited_demo,'demo_templates',templates);
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_read(uuid,text,uuid) FROM PUBLIC,anon,authenticated;

-- draft-resource-clone-write-365.sql
CREATE OR REPLACE FUNCTION public._resource_clone_write(p_actor uuid,p_owner uuid,p_kind text,p_action text,p_source uuid,p_request uuid,p_definition jsonb,p_demo boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE receipt public.resource_clone_receipts; copy_id uuid:=gen_random_uuid(); target uuid; hash text; imported jsonb;
 catmap jsonb; tagmap jsonb; qmap jsonb; packet_name text; typ text; source_snapshot jsonb;
BEGIN
 IF p_actor IS NULL OR p_owner IS NULL OR p_source IS NULL OR p_request IS NULL OR p_definition IS NULL OR
  p_kind IS NULL OR p_action IS NULL OR p_demo IS NULL OR p_kind NOT IN('game','base','logo') OR p_action NOT IN('duplicate','send') OR
  (p_action='duplicate' AND p_actor<>p_owner) OR (p_action='send' AND (p_actor=p_owner OR p_kind='base')) THEN RAISE EXCEPTION 'invalid_copy_action'; END IF;
 PERFORM 1 FROM auth.users u WHERE id IN(p_actor,p_owner) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,p_owner) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>(CASE WHEN p_actor=p_owner THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'auth_required'; END IF;
 hash:=encode(sha256(convert_to(p_definition::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.resource_clone_receipts WHERE creator_identity=p_actor AND recipient_id=p_owner AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF receipt.source_id<>p_source OR receipt.resource_kind<>p_kind OR receipt.action<>p_action OR receipt.definition_hash<>hash OR receipt.demo_origin IS DISTINCT FROM p_demo THEN RAISE EXCEPTION 'request_conflict'; END IF;
  target:=CASE p_kind WHEN 'game' THEN receipt.game_id WHEN 'base' THEN receipt.base_id ELSE receipt.logo_id END;
  IF target IS NULL THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('ok',true,'id',target,'already',true);
 END IF;
 source_snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);
 IF (source_snapshot#>>ARRAY[p_kind,'is_demo'])::boolean OR (source_snapshot->>'demo_origin')::boolean THEN
  IF p_demo IS DISTINCT FROM true THEN RAISE EXCEPTION 'invalid_demo_provenance'; END IF;
 END IF;
 IF p_action='send' AND coalesce(p_demo,false) THEN RAISE EXCEPTION 'demo_not_sendable'; END IF;
 IF p_action='send' AND NOT EXISTS(SELECT 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL AND
  ((requester_id=p_actor AND addressee_id=p_owner) OR (requester_id=p_owner AND addressee_id=p_actor))) THEN RAISE EXCEPTION 'not_friend'; END IF;
 IF p_kind='game' THEN
  imported:=public._game_import_package(p_definition,p_owner,copy_id);
  IF imported->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'clone_import_failed'; END IF;
  target:=(imported->>'id')::uuid;
 ELSIF p_kind='base' THEN
  IF jsonb_typeof(p_definition->'base') IS DISTINCT FROM 'object' OR jsonb_typeof(p_definition->'questions') IS DISTINCT FROM 'array' OR
   jsonb_typeof(p_definition->'categories') IS DISTINCT FROM 'array' OR jsonb_typeof(p_definition->'tags') IS DISTINCT FROM 'array' OR
   jsonb_typeof(p_definition->'question_tags') IS DISTINCT FROM 'array' OR jsonb_typeof(p_definition->'category_tags') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_definition->'categories') x GROUP BY x->>'id' HAVING count(*)>1) OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(p_definition->'tags') x GROUP BY x->>'id' HAVING count(*)>1) OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(p_definition->'questions') x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  packet_name:=left(trim(p_definition#>>'{base,name}'),80);
  IF coalesce(packet_name,'')='' THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  INSERT INTO public.question_bases(owner_id,name) VALUES(p_owner,packet_name) RETURNING id INTO target;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO catmap FROM jsonb_array_elements(p_definition->'categories') x;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO tagmap FROM jsonb_array_elements(p_definition->'tags') x;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO qmap FROM jsonb_array_elements(p_definition->'questions') x;
  INSERT INTO public.qb_categories(id,base_id,parent_id,name,ord)
   SELECT (catmap->>(x->>'id'))::uuid,target,(catmap->>(x->>'parent_id'))::uuid,left(x->>'name',80),coalesce((x->>'ord')::int,0)
    FROM jsonb_array_elements(p_definition->'categories') x;
  INSERT INTO public.qb_tags(id,base_id,name,color,ord)
   SELECT (tagmap->>(x->>'id'))::uuid,target,left(x->>'name',40),left(x->>'color',24),coalesce((x->>'ord')::int,0)
    FROM jsonb_array_elements(p_definition->'tags') x;
  INSERT INTO public.qb_questions(id,base_id,category_id,ord,payload,updated_by)
   SELECT (qmap->>(x->>'id'))::uuid,target,(catmap->>(x->>'category_id'))::uuid,coalesce((x->>'ord')::int,0),coalesce(x->'payload','{}'),p_owner
    FROM jsonb_array_elements(p_definition->'questions') x;
  INSERT INTO public.qb_question_tags(question_id,tag_id)
   SELECT DISTINCT (qmap->>(x->>'question_id'))::uuid,(tagmap->>(x->>'tag_id'))::uuid
    FROM jsonb_array_elements(p_definition->'question_tags') x WHERE qmap ? (x->>'question_id') AND tagmap ? (x->>'tag_id');
  INSERT INTO public.qb_category_tags(category_id,tag_id)
   SELECT DISTINCT (catmap->>(x->>'category_id'))::uuid,(tagmap->>(x->>'tag_id'))::uuid
    FROM jsonb_array_elements(p_definition->'category_tags') x WHERE catmap ? (x->>'category_id') AND tagmap ? (x->>'tag_id');
 ELSE
  packet_name:=left(trim(p_definition->>'name'),80);typ:=p_definition->>'type';
  IF coalesce(packet_name,'')='' OR typ NOT IN('GLYPH_30x10','PIX_150x70') OR jsonb_typeof(p_definition->'payload') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  INSERT INTO public.user_logos(user_id,name,type,payload) VALUES(p_owner,packet_name,typ,p_definition->'payload') RETURNING id INTO target;
 END IF;
 INSERT INTO public.resource_clone_receipts(id,recipient_id,creator_id,creator_identity,request_id,source_id,resource_kind,action,demo_origin,definition_hash,game_id,base_id,logo_id)
  VALUES(copy_id,p_owner,p_actor,p_actor,p_request,p_source,p_kind,p_action,coalesce(p_demo,false),hash,
   CASE WHEN p_kind='game' THEN target END,CASE WHEN p_kind='base' THEN target END,CASE WHEN p_kind='logo' THEN target END);
 RETURN jsonb_build_object('ok',true,'id',target,'already',false);
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_write(uuid,uuid,text,text,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;

-- draft-resource-clone-staging-365.sql
CREATE TABLE public.resource_clone_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, actor_identity uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source_id uuid NOT NULL, resource_kind text NOT NULL CHECK(resource_kind IN('game','base','logo')),
 action text NOT NULL CHECK(action IN('duplicate','send')), request_id uuid NOT NULL,
 source_snapshot jsonb, status text NOT NULL DEFAULT 'preparing' CHECK(status IN('preparing','complete','removed','expired')),
 game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
 base_id uuid REFERENCES public.question_bases(id) ON DELETE SET NULL,
 logo_id uuid REFERENCES public.user_logos(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz, definition_hash text,
 UNIQUE(actor_identity,recipient_id,request_id), CHECK(num_nonnulls(game_id,base_id,logo_id)<=1),
 CHECK((action='duplicate' AND actor_identity=recipient_id) OR (action='send' AND actor_identity<>recipient_id AND resource_kind<>'base'))
);
ALTER TABLE public.resource_clone_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_clone_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_clone_jobs FROM PUBLIC,anon,authenticated;
CREATE TABLE public.resource_clone_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.resource_clone_jobs(id) ON DELETE CASCADE,
 reference_hash text NOT NULL, reference text NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('storage','embedded','demo_asset')),
 source_path text, mime text NOT NULL CHECK(mime IN('image/png','image/jpeg','image/gif','image/webp')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 etag text, content_hash text, destination_path text NOT NULL,
 UNIQUE(job_id,reference_hash),UNIQUE(destination_path)
);
ALTER TABLE public.resource_clone_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_clone_assets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_clone_assets FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._logo_clone_image_refs(p_source jsonb) RETURNS SETOF text LANGUAGE sql IMMUTABLE AS $$
 WITH RECURSIVE nodes(value) AS (
  SELECT p_source->'fabricData'
  UNION ALL
  SELECT child.value FROM nodes n CROSS JOIN LATERAL (
   SELECT value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}' END)
   UNION ALL
   SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]' END)
  ) child WHERE jsonb_typeof(child.value) IN('object','array')
 ), refs(value) AS (
  SELECT CASE WHEN p_source->>'imageData' ~* '^data:image/' THEN p_source->>'imageData' ELSE p_source->>'imageUrl' END
  UNION ALL
  SELECT e.value#>>'{}' FROM nodes n CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}' END) e
   WHERE e.key='src' AND jsonb_typeof(e.value)='string'
 ) SELECT DISTINCT value FROM refs WHERE value IS NOT NULL AND value<>'';
$$;
REVOKE ALL ON FUNCTION public._logo_clone_image_refs(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_begin(p_actor uuid,p_owner uuid,p_kind text,p_source uuid,p_action text,p_request uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_clone_jobs; snapshot jsonb; target uuid;
BEGIN
 IF p_actor IS NULL OR p_owner IS NULL OR p_source IS NULL OR p_request IS NULL OR p_kind IS NULL OR p_action IS NULL OR
  p_kind NOT IN('game','base','logo') OR p_action NOT IN('duplicate','send') OR
  (p_action='duplicate' AND p_actor<>p_owner) OR (p_action='send' AND (p_actor=p_owner OR p_kind='base')) THEN RAISE EXCEPTION 'invalid_copy_action'; END IF;
 PERFORM 1 FROM auth.users u WHERE id IN(p_actor,p_owner) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,p_owner) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>(CASE WHEN p_actor=p_owner THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE actor_identity=p_actor AND recipient_id=p_owner AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF item.source_id<>p_source OR item.resource_kind<>p_kind OR item.action<>p_action THEN RAISE EXCEPTION 'request_conflict'; END IF;
  target:=CASE p_kind WHEN 'game' THEN item.game_id WHEN 'base' THEN item.base_id ELSE item.logo_id END;
  IF item.status IN('removed','expired') OR (item.status='complete' AND target IS NULL) THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('id',item.id,'status',item.status,'target_id',target,'snapshot',item.source_snapshot,'recipient_id',item.recipient_id,'actor_id',item.actor_identity);
 END IF;
 IF p_action='send' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_actor,p_owner)::text||':'||GREATEST(p_actor,p_owner)::text,329));
  PERFORM 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL AND
   ((requester_id=p_actor AND addressee_id=p_owner) OR (requester_id=p_owner AND addressee_id=p_actor)) FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_friend'; END IF;
 END IF;
 snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);
 INSERT INTO public.resource_clone_jobs(actor_id,actor_identity,recipient_id,source_id,resource_kind,action,request_id,source_snapshot)
  VALUES(p_actor,p_actor,p_owner,p_source,p_kind,p_action,p_request,snapshot) RETURNING * INTO item;
 RETURN jsonb_build_object('id',item.id,'status',item.status,'snapshot',snapshot,'recipient_id',item.recipient_id,'actor_id',item.actor_identity);
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_begin(uuid,uuid,text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_asset_register(p_actor uuid,p_job uuid,p_reference text,p_kind text,p_mime text,p_size integer,p_etag text,p_content_hash text,p_source_path text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_clone_jobs; asset public.resource_clone_assets; fingerprint text; ext text; aid uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor FOR UPDATE;
 IF NOT FOUND OR item.actor_id IS NULL OR item.status<>'preparing' OR item.resource_kind<>'logo' OR item.created_at+interval '1 hour'<=clock_timestamp() THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public._logo_clone_image_refs(item.source_snapshot#>'{logo,payload,source}') ref WHERE ref=p_reference) THEN RAISE EXCEPTION 'invalid_copy_image_reference'; END IF;
 fingerprint:=encode(sha256(convert_to(p_reference,'UTF8')),'hex');
 SELECT * INTO asset FROM public.resource_clone_assets WHERE job_id=p_job AND reference_hash=fingerprint;
 IF FOUND THEN
  IF asset.source_kind IS DISTINCT FROM p_kind OR asset.mime IS DISTINCT FROM p_mime OR asset.byte_size IS DISTINCT FROM p_size OR asset.etag IS DISTINCT FROM p_etag OR
   asset.content_hash IS DISTINCT FROM p_content_hash OR asset.source_path IS DISTINCT FROM p_source_path THEN RAISE EXCEPTION 'copy_image_source_changed'; END IF;
  RETURN to_jsonb(asset)||jsonb_build_object('copy_id',item.id,'recipient_id',item.recipient_id,'source_owner_id',item.actor_identity,'asset_id',asset.id);
 END IF;
 IF p_kind='storage' AND (p_source_path IS NULL OR p_source_path NOT LIKE item.actor_identity::text||'/%' OR p_etag IS NULL OR p_etag !~ '^[a-f0-9]{32}$') THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
 IF p_kind IN('embedded','demo_asset') AND (p_content_hash IS NULL OR p_content_hash !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
 ext:=CASE p_mime WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/gif' THEN 'gif' WHEN 'image/webp' THEN 'webp' END;
 IF ext IS NULL THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
 INSERT INTO public.resource_clone_assets(id,job_id,reference_hash,reference,source_kind,source_path,mime,byte_size,etag,content_hash,destination_path)
  VALUES(aid,p_job,fingerprint,p_reference,p_kind,p_source_path,p_mime,p_size,p_etag,p_content_hash,item.recipient_id::text||'/copies/'||item.id::text||'/'||aid::text||'.'||ext) RETURNING * INTO asset;
 RETURN to_jsonb(asset)||jsonb_build_object('copy_id',item.id,'recipient_id',item.recipient_id,'source_owner_id',item.actor_identity,'asset_id',asset.id);
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_asset_register(uuid,uuid,text,text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public._resource_clone_cleanup(p_owner uuid,p_job uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.resource_clone_jobs WHERE id=p_job AND recipient_id=p_owner AND status='complete' AND logo_id IS NOT NULL) THEN RETURN; END IF;
 INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
  VALUES('user-logos',p_owner::text||'/copies/'||p_job::text,true,'logo',p_job) ON CONFLICT DO NOTHING;
 PERFORM public.storage_cleanup_kick();
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_cleanup(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_duplicate_name(p_kind text,p_owner uuid,p_name text,p_suffix text) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate text; ending text; number integer:=1;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('game','base','logo') OR p_suffix IS NULL OR p_suffix NOT IN('kopia','copy','копія') THEN RAISE EXCEPTION 'invalid_copy_name'; END IF;
 LOOP
  ending:=' '||p_suffix||CASE WHEN number=1 THEN '' ELSE ' '||number::text END;
  candidate:=trim(rtrim(left(trim(coalesce(p_name,'')),80-char_length(ending)))||ending);
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE p_kind='game' AND owner_id=p_owner AND name=candidate
   UNION ALL SELECT 1 FROM public.question_bases WHERE p_kind='base' AND owner_id=p_owner AND name=candidate
   UNION ALL SELECT 1 FROM public.user_logos WHERE p_kind='logo' AND user_id=p_owner AND name=candidate) THEN RETURN candidate; END IF;
  number:=number+1;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_duplicate_name(text,uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_finish_duplicate(p_actor uuid,p_job uuid,p_definition jsonb,p_demo boolean,p_storage_base text,p_suffix text DEFAULT 'kopia')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_clone_jobs; target uuid; result jsonb; hash text; ref text; original_name text; name_key text[]; named_definition jsonb;
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor;
 IF NOT FOUND OR item.action<>'duplicate' THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job FOR UPDATE NOWAIT;
 name_key:=CASE WHEN item.resource_kind='logo' THEN ARRAY['name'] ELSE ARRAY[item.resource_kind,'name'] END;
 named_definition:=p_definition #- name_key;
 hash:=encode(sha256(convert_to(named_definition::text,'UTF8')),'hex');
 target:=CASE item.resource_kind WHEN 'game' THEN item.game_id WHEN 'base' THEN item.base_id ELSE item.logo_id END;
 IF item.status='complete' THEN
  IF item.definition_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'request_conflict'; END IF;
  IF target IS NULL THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('ok',true,'id',target,'already',true);
 END IF;
 IF item.status IN('removed','expired') THEN RAISE EXCEPTION 'previously_removed'; END IF;
 IF item.created_at+interval '1 hour'<=clock_timestamp() THEN
  UPDATE public.resource_clone_jobs SET status='expired',source_snapshot=NULL WHERE id=p_job;
  IF item.resource_kind='logo' THEN PERFORM public._resource_clone_cleanup(item.recipient_id,item.id); END IF;
  RETURN jsonb_build_object('ok',false,'error','expired');
 END IF;
 IF item.resource_kind='logo' THEN
  IF p_storage_base IS NULL OR p_storage_base !~ '^https://[a-zA-Z0-9.-]+$' THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
  FOR ref IN SELECT public._logo_clone_image_refs(p_definition#>'{payload,source}') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.resource_clone_assets a JOIN storage.objects o ON o.bucket_id='user-logos' AND o.name=a.destination_path
    WHERE a.job_id=p_job AND ref=p_storage_base||'/storage/v1/object/public/user-logos/'||a.destination_path AND
     o.metadata->>'mimetype'=a.mime AND (o.metadata->>'size')::bigint=a.byte_size AND
     (a.source_kind<>'storage' OR trim(both '"' from o.metadata->>'eTag')=a.etag)) THEN RAISE EXCEPTION 'unmaterialized_copy_image'; END IF;
  END LOOP;
 END IF;
 original_name:=item.source_snapshot#>>ARRAY[item.resource_kind,'name'];
 IF coalesce(trim(original_name),'')='' THEN
  original_name:=CASE WHEN p_definition#>>name_key=p_suffix THEN '' ELSE regexp_replace(p_definition#>>name_key,' '||p_suffix||'( [0-9]+)?$','') END;
 END IF;
 named_definition:=jsonb_set(p_definition,name_key,to_jsonb(public._resource_clone_duplicate_name(item.resource_kind,item.recipient_id,original_name,p_suffix)));
 result:=public._resource_clone_write(item.actor_identity,item.recipient_id,item.resource_kind,'duplicate',item.source_id,item.request_id,named_definition,p_demo);
 target:=(result->>'id')::uuid;
 UPDATE public.resource_clone_jobs SET status='complete',source_snapshot=NULL,completed_at=clock_timestamp(),definition_hash=hash,
  game_id=CASE WHEN resource_kind='game' THEN target END,base_id=CASE WHEN resource_kind='base' THEN target END,logo_id=CASE WHEN resource_kind='logo' THEN target END WHERE id=p_job;
 -- The file manifest remains tied to the result; the copied bytes are not
 -- duplicated in a database snapshot after the resource has been published.
 UPDATE public.resource_clone_assets SET reference='' WHERE job_id=p_job;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_finish_duplicate(uuid,uuid,jsonb,boolean,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._resource_clone_job_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.resource_kind='logo' AND OLD.status<>'complete' THEN
  INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
   VALUES('user-logos',OLD.recipient_id::text||'/copies/'||OLD.id::text,true,'logo',OLD.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_job_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER clone_job_cleanup BEFORE DELETE ON public.resource_clone_jobs FOR EACH ROW EXECUTE FUNCTION public._resource_clone_job_delete();
CREATE TRIGGER clone_job_cleanup_kick AFTER DELETE ON public.resource_clone_jobs FOR EACH STATEMENT EXECUTE FUNCTION public._storage_cleanup_kick_trigger();

CREATE FUNCTION public._resource_clone_logo_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
  SELECT 'user-logos',recipient_id::text||'/copies/'||id::text,true,'logo',OLD.id FROM public.resource_clone_jobs WHERE logo_id=OLD.id ON CONFLICT DO NOTHING;
 UPDATE public.resource_clone_jobs SET status='removed',source_snapshot=NULL WHERE logo_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_logo_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER clone_logo_cleanup BEFORE DELETE ON public.user_logos FOR EACH ROW EXECUTE FUNCTION public._resource_clone_logo_delete();
CREATE FUNCTION public._resource_clone_gc() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_clone_jobs; processed integer:=0;
BEGIN
 FOR item IN SELECT * FROM public.resource_clone_jobs WHERE status='preparing' AND (created_at+interval '1 hour'<=clock_timestamp() OR actor_id IS NULL) FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.resource_clone_jobs SET status='expired',source_snapshot=NULL WHERE id=item.id;
  IF item.resource_kind='logo' THEN PERFORM public._resource_clone_cleanup(item.recipient_id,item.id); END IF;
  processed:=processed+1;
 END LOOP;
 -- A late service upload can outlive the account/job cascade. The owner UUID,
 -- not the email or a new account, determines that these files are orphaned.
 INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
  SELECT DISTINCT 'user-logos',split_part(o.name,'/',1)||'/copies/'||split_part(o.name,'/',3),true,'user',split_part(o.name,'/',1)::uuid
   FROM storage.objects o WHERE o.bucket_id='user-logos' AND
    o.name ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/copies/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}[.](png|jpg|gif|webp)$' AND
    NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=split_part(o.name,'/',1)::uuid) ON CONFLICT DO NOTHING;
 IF processed>0 OR EXISTS(SELECT 1 FROM public.storage_cleanup_queue WHERE attempts<20) THEN PERFORM public.storage_cleanup_kick(); END IF;
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_gc() FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public._resource_clone_begin(uuid,uuid,text,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._resource_clone_asset_register(uuid,uuid,text,text,text,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public._resource_clone_finish_duplicate(uuid,uuid,jsonb,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public._resource_clone_cleanup(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._resource_clone_gc() TO service_role;
SELECT cron.schedule('resource-clone-gc','*/10 * * * *','SELECT public._resource_clone_gc();');
COMMIT;
