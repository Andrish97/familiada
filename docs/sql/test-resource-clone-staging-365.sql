BEGIN;
INSERT INTO auth.users(id,email,is_anonymous,email_confirmed_at,raw_user_meta_data) VALUES
 ('aaaaaaaa-3656-1000-0000-000000000001','stage365@example.invalid',false,now(),'{"username":"stage365"}'),
 ('aaaaaaaa-3656-1000-0000-000000000002','otherstage365@example.invalid',false,now(),'{"username":"otherstage365"}');
DO $$
DECLARE actor uuid:='aaaaaaaa-3656-1000-0000-000000000001'; other_user uuid:='aaaaaaaa-3656-1000-0000-000000000002';
 source_id uuid; stage_job uuid; source_url text; packet jsonb; job jsonb; asset jsonb; result jsonb; target uuid; other_job uuid; expected_prefix text;
 request_id uuid:=gen_random_uuid(); etag text:=repeat('a',32);
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 source_url:='https://storage.example/storage/v1/object/public/user-logos/'||actor::text||'/source.png';
 INSERT INTO public.user_logos(user_id,name,type,payload) VALUES(actor,'Staging logo','PIX_150x70',
  jsonb_build_object('w',150,'h',70,'format','1bit','bits_b64','AA==','source',jsonb_build_object('mode','DRAW','imageUrl',source_url,
   'fabricData',jsonb_build_object('objects',jsonb_build_array(jsonb_build_object('type','group','objects',jsonb_build_array(jsonb_build_object('src',source_url)))))))) RETURNING id INTO source_id;
 job:=public._resource_clone_begin(actor,actor,'logo',source_id,'duplicate',request_id);stage_job:=(job->>'id')::uuid;
 IF (public._resource_clone_begin(actor,actor,'logo',source_id,'duplicate',request_id)->>'id') IS DISTINCT FROM stage_job::text THEN RAISE EXCEPTION 'begin retry created another job'; END IF;
 IF (SELECT count(*) FROM public._logo_clone_image_refs(job#>'{snapshot,logo,payload,source}'))<>1 THEN RAISE EXCEPTION 'nested duplicate image was not deduplicated'; END IF;
 asset:=public._resource_clone_asset_register(actor,stage_job,source_url,'storage','image/png',3,etag,NULL,actor::text||'/source.png');
 IF (public._resource_clone_asset_register(actor,stage_job,source_url,'storage','image/png',3,etag,NULL,actor::text||'/source.png')->>'asset_id') IS DISTINCT FROM asset->>'asset_id' THEN RAISE EXCEPTION 'asset retry changed destination'; END IF;
 BEGIN PERFORM public._resource_clone_asset_register(actor,stage_job,source_url,'storage','image/png',4,etag,NULL,actor::text||'/source.png');RAISE EXCEPTION 'file signature changed within job';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'copy_image_source_changed' THEN RAISE; END IF; END;
 BEGIN PERFORM public._resource_clone_asset_register(actor,stage_job,'https://foreign/image','storage','image/png',3,etag,NULL,actor::text||'/source.png');RAISE EXCEPTION 'unknown source image accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_copy_image_reference' THEN RAISE; END IF; END;
 BEGIN PERFORM public._resource_clone_asset_register(other_user,stage_job,source_url,'storage','image/png',3,etag,NULL,actor::text||'/source.png');RAISE EXCEPTION 'foreign actor got asset';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_copy_job' THEN RAISE; END IF; END;
 packet:=jsonb_set((job#>'{snapshot,logo}')-ARRAY['id','is_demo'],'{name}','"Staging logo kopia"');
 -- A receiver record must never retain the original URL, or publish before
 -- its own files exist with the registered signature.
 BEGIN PERFORM public._resource_clone_finish_duplicate(actor,stage_job,packet,false,'https://storage.example');RAISE EXCEPTION 'source URL published';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'unmaterialized_copy_image' THEN RAISE; END IF; END;
 packet:=jsonb_set(packet,'{payload,source,imageUrl}',to_jsonb('https://storage.example/storage/v1/object/public/user-logos/'||(asset->>'destination_path')));
 packet:=jsonb_set(packet,'{payload,source,fabricData,objects,0,objects,0,src}',packet#>'{payload,source,imageUrl}');
 BEGIN PERFORM public._resource_clone_finish_duplicate(actor,stage_job,packet,false,'https://storage.example');RAISE EXCEPTION 'missing file published';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'unmaterialized_copy_image' THEN RAISE; END IF; END;
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('user-logos',asset->>'destination_path',jsonb_build_object('mimetype','image/png','size',3,'eTag',etag));
 result:=public._resource_clone_finish_duplicate(actor,stage_job,packet,false,'https://storage.example');target:=(result->>'id')::uuid;
 IF (public._resource_clone_finish_duplicate(actor,stage_job,packet,false,'https://storage.example')->>'id') IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'finish retry made another resource'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.resource_clone_jobs WHERE id=stage_job AND source_snapshot IS NULL AND logo_id=target AND status='complete') THEN RAISE EXCEPTION 'completed snapshot was retained or unbound'; END IF;
 PERFORM public._resource_clone_cleanup(actor,stage_job);
 expected_prefix:=actor::text||'/copies/'||stage_job::text;
 IF EXISTS(SELECT 1 FROM public.storage_cleanup_queue WHERE path=expected_prefix) THEN RAISE EXCEPTION 'installed resource file queued for deletion'; END IF;
 DELETE FROM public.user_logos WHERE id=source_id;
 IF (public._resource_clone_begin(actor,actor,'logo',source_id,'duplicate',request_id)->>'target_id') IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'job replay depended on source'; END IF;
 DELETE FROM public.user_logos WHERE id=target;
 IF NOT EXISTS(SELECT 1 FROM public.storage_cleanup_queue WHERE path=expected_prefix AND is_folder AND owner_id=target) THEN RAISE EXCEPTION 'nested asset folder not queued on logo deletion'; END IF;
 BEGIN PERFORM public._resource_clone_begin(actor,actor,'logo',source_id,'duplicate',request_id);RAISE EXCEPTION 'deleted copy restored';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'previously_removed' THEN RAISE; END IF; END;
 -- Incomplete jobs use the same receiver subtree. Parent deletion and a late
 -- upload response both queue its folder without touching an installed copy.
 INSERT INTO public.user_logos(user_id,name,type,payload) VALUES(actor,'Incomplete','GLYPH_30x10','{"layers":[{"rows":[]}],"source":{"mode":"TEXT"}}') RETURNING id INTO source_id;
 job:=public._resource_clone_begin(actor,actor,'logo',source_id,'duplicate',gen_random_uuid());other_job:=(job->>'id')::uuid;
 PERFORM public.delete_user_everything(actor);
 IF EXISTS(SELECT 1 FROM public.resource_clone_jobs WHERE recipient_id=actor) OR EXISTS(SELECT 1 FROM public.resource_clone_assets a WHERE a.job_id=stage_job) THEN RAISE EXCEPTION 'account deletion left staging'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.storage_cleanup_queue WHERE path=actor::text||'/copies/'||other_job::text AND is_folder) THEN RAISE EXCEPTION 'unfinished folder not queued'; END IF;
 PERFORM public._resource_clone_cleanup(actor,other_job);
 IF NOT EXISTS(SELECT 1 FROM public.storage_cleanup_queue WHERE path=actor::text||'/copies/'||other_job::text AND is_folder) THEN RAISE EXCEPTION 'late upload cleanup missing'; END IF;
 RAISE NOTICE 'Staging365: stable intent/assets, source references, own Storage proof, one result, detached snapshot, nested folder cleanup, parent deletion and late cleanup passed';
END $$;
ROLLBACK;
