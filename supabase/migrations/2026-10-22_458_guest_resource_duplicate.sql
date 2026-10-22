-- 458 (decyzja właściciela 2026-10-22): gość może POWIELAĆ własne gry, bazy
-- i logo; WYSYŁANIE kopii (send) nadal tylko między kontami zarejestrowanymi.
-- Dotąd wszystkie etapy klonowania wymagały konta zarejestrowanego
-- (_poll_identity_regular), więc Powiel gościa kończył się auth_required.
-- Zmiana: dla action='duplicate' wystarczy istniejący użytkownik auth.users
-- (gość jest kontem anonimowym); dla 'send' bez zmian (aktor i odbiorca
-- zarejestrowani; finish_send nie jest zmieniane). _resource_clone_read
-- sprawdza tylko istnienie aktora -- wołają go wyłącznie begin/write po
-- własnym sprawdzeniu tożsamości zależnym od akcji.
-- Limity: tworzenie gier/baz/logo nie ma limitu liczby na konto (ani dla
-- gościa), więc Powiel nie omija żadnego limitu.

CREATE OR REPLACE FUNCTION "public"."_resource_clone_begin"("p_actor" "uuid", "p_owner" "uuid", "p_kind" "text", "p_source" "uuid", "p_action" "text", "p_request" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE item public.resource_clone_jobs; snapshot jsonb; target uuid;
BEGIN
 IF p_actor IS NULL OR p_owner IS NULL OR p_source IS NULL OR p_request IS NULL OR p_kind IS NULL OR p_action IS NULL OR
  p_kind NOT IN('game','base','logo') OR p_action NOT IN('duplicate','send') OR
  (p_action='duplicate' AND p_actor<>p_owner) OR (p_action='send' AND (p_actor=p_owner OR p_kind='base')) THEN RAISE EXCEPTION 'invalid_copy_action'; END IF;
 PERFORM 1 FROM auth.users u WHERE id IN(p_actor,p_owner) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,p_owner) AND (p_action='duplicate' OR public._poll_identity_regular(u.id,to_jsonb(u))))<>(CASE WHEN p_actor=p_owner THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'auth_required'; END IF;
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
 PERFORM public._resource_clone_send_allowed(p_kind,p_action,snapshot);
 INSERT INTO public.resource_clone_jobs(actor_id,actor_identity,recipient_id,source_id,resource_kind,action,request_id,source_snapshot)
  VALUES(p_actor,p_actor,p_owner,p_source,p_kind,p_action,p_request,snapshot) RETURNING * INTO item;
 RETURN jsonb_build_object('id',item.id,'status',item.status,'snapshot',snapshot,'recipient_id',item.recipient_id,'actor_id',item.actor_identity);
END $$;

CREATE OR REPLACE FUNCTION "public"."_resource_clone_read"("p_actor" "uuid", "p_kind" "text", "p_source" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE root jsonb; snapshot jsonb; templates jsonb; inherited_demo boolean;
BEGIN
 IF p_actor IS NULL OR p_kind IS NULL OR p_kind NOT IN('game','base','logo') OR p_source IS NULL THEN RAISE EXCEPTION 'invalid_copy_source'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor FOR NO KEY UPDATE NOWAIT;
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
 IF p_kind='game' AND root->>'status' NOT IN('draft','ready','poll_open','poll_stopped') THEN RAISE EXCEPTION 'not_exportable'; END IF;
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

CREATE OR REPLACE FUNCTION "public"."_resource_clone_write"("p_actor" "uuid", "p_owner" "uuid", "p_kind" "text", "p_action" "text", "p_source" "uuid", "p_request" "uuid", "p_definition" "jsonb", "p_demo" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE receipt public.resource_clone_receipts; copy_id uuid:=gen_random_uuid(); target uuid; hash text; imported jsonb;
 catmap jsonb; tagmap jsonb; qmap jsonb; packet_name text; typ text; source_snapshot jsonb;
BEGIN
 IF p_actor IS NULL OR p_owner IS NULL OR p_source IS NULL OR p_request IS NULL OR p_definition IS NULL OR
  p_kind IS NULL OR p_action IS NULL OR p_demo IS NULL OR p_kind NOT IN('game','base','logo') OR p_action NOT IN('duplicate','send') OR
  (p_action='duplicate' AND p_actor<>p_owner) OR (p_action='send' AND (p_actor=p_owner OR p_kind='base')) THEN RAISE EXCEPTION 'invalid_copy_action'; END IF;
 PERFORM 1 FROM auth.users u WHERE id IN(p_actor,p_owner) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,p_owner) AND (p_action='duplicate' OR public._poll_identity_regular(u.id,to_jsonb(u))))<>(CASE WHEN p_actor=p_owner THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'auth_required'; END IF;
 hash:=encode(sha256(convert_to(p_definition::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.resource_clone_receipts WHERE creator_identity=p_actor AND recipient_id=p_owner AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF receipt.source_id<>p_source OR receipt.resource_kind<>p_kind OR receipt.action<>p_action OR receipt.definition_hash<>hash OR receipt.demo_origin IS DISTINCT FROM p_demo THEN RAISE EXCEPTION 'request_conflict'; END IF;
  target:=CASE p_kind WHEN 'game' THEN receipt.game_id WHEN 'base' THEN receipt.base_id ELSE receipt.logo_id END;
  IF target IS NULL THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('ok',true,'id',target,'already',true);
 END IF;
 source_snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);
 PERFORM public._resource_clone_send_allowed(p_kind,p_action,source_snapshot);
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

CREATE OR REPLACE FUNCTION "public"."_resource_clone_finish_duplicate"("p_actor" "uuid", "p_job" "uuid", "p_definition" "jsonb", "p_demo" boolean, "p_storage_base" "text", "p_suffix" "text" DEFAULT 'kopia'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE item public.resource_clone_jobs; target uuid; result jsonb; hash text; ref text; original_name text; name_key text[]; named_definition jsonb;
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor;
 IF NOT FOUND OR item.action<>'duplicate' THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor FOR NO KEY UPDATE NOWAIT;
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
END $_$;

-- Uprawnienia jak w 365 (CREATE OR REPLACE je zachowuje; powtórzone jawnie).
REVOKE ALL ON FUNCTION public._resource_clone_read(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._resource_clone_write(uuid,uuid,text,text,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._resource_clone_begin(uuid,uuid,text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._resource_clone_finish_duplicate(uuid,uuid,jsonb,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._resource_clone_begin(uuid,uuid,text,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._resource_clone_finish_duplicate(uuid,uuid,jsonb,boolean,text,text) TO service_role;
