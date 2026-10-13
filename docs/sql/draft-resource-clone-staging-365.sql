-- Local staging for the common server planner. Not a migration/public API.
BEGIN;
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

CREATE FUNCTION public._resource_clone_finish_duplicate(p_actor uuid,p_job uuid,p_definition jsonb,p_demo boolean,p_storage_base text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE item public.resource_clone_jobs; target uuid; result jsonb; hash text; ref text;
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor;
 IF NOT FOUND OR item.action<>'duplicate' THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job FOR UPDATE NOWAIT;
 hash:=encode(sha256(convert_to(p_definition::text,'UTF8')),'hex');
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
 result:=public._resource_clone_write(item.actor_identity,item.recipient_id,item.resource_kind,'duplicate',item.source_id,item.request_id,p_definition,p_demo);
 target:=(result->>'id')::uuid;
 UPDATE public.resource_clone_jobs SET status='complete',source_snapshot=NULL,completed_at=clock_timestamp(),definition_hash=hash,
  game_id=CASE WHEN resource_kind='game' THEN target END,base_id=CASE WHEN resource_kind='base' THEN target END,logo_id=CASE WHEN resource_kind='logo' THEN target END WHERE id=p_job;
 -- The file manifest remains tied to the result; the copied bytes are not
 -- duplicated in a database snapshot after the resource has been published.
 UPDATE public.resource_clone_assets SET reference='' WHERE job_id=p_job;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_finish_duplicate(uuid,uuid,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;

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
COMMIT;
