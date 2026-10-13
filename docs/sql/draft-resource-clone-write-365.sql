-- Local common clone writer. Inputs are canonical definitions from the trusted
-- server planner, not arbitrary request bodies. No public endpoint/migration.
BEGIN;
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
COMMIT;
