-- Wersjonowane demo: zmiana wzorca i aktualizacja wyłącznie zgodnych kopii.
BEGIN;
CREATE TABLE public.admin_demo_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 lang text NOT NULL CHECK(lang IN ('pl','en','uk')), slot text NOT NULL,
 old_payload jsonb NOT NULL, new_payload jsonb NOT NULL, old_definition jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.admin_demo_targets (
 update_id uuid NOT NULL REFERENCES public.admin_demo_updates ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('game','logo','base')), resource_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','updated','edited','removed','failed')),
 next_run_at timestamptz NOT NULL DEFAULT now(), message text NOT NULL DEFAULT '',
 PRIMARY KEY(update_id,kind,resource_id)
);

CREATE FUNCTION public._demo_base_canonical(p jsonb) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 WITH RECURSIVE cats AS (
  SELECT c,c->>'id' id, jsonb_build_array(jsonb_build_array(coalesce(c->>'ord','0'),c->>'name')) path FROM jsonb_array_elements(coalesce(p->'categories','[]')) c WHERE coalesce(c->>'parent_id','')=''
  UNION ALL SELECT c,c->>'id',parent.path||jsonb_build_array(jsonb_build_array(coalesce(c->>'ord','0'),c->>'name')) FROM jsonb_array_elements(coalesce(p->'categories','[]')) c JOIN cats parent ON c->>'parent_id'=parent.id
 ), tags AS (SELECT t,t->>'id' id,jsonb_build_array(t->>'name',t->>'color',coalesce(t->>'ord','0')) val FROM jsonb_array_elements(coalesce(p->'tags','[]')) t)
 SELECT jsonb_build_object('name',p#>>'{base,name}',
 'categories',coalesce((SELECT jsonb_agg(path ORDER BY path::text) FROM cats),'[]'),
 'tags',coalesce((SELECT jsonb_agg(val ORDER BY val::text) FROM tags),'[]'),
 'questions',coalesce((SELECT jsonb_agg(val ORDER BY val::text) FROM (
  SELECT jsonb_build_object('category',c.path,'ord',coalesce(q->>'ord','0'),'payload',q->'payload','tags',coalesce((SELECT jsonb_agg(t.val ORDER BY t.val::text) FROM jsonb_array_elements(coalesce(p->'question_tags','[]')) e JOIN tags t ON t.id=e->>'tag_id' WHERE e->>'question_id'=q->>'id'),'[]')) val
   FROM jsonb_array_elements(coalesce(p->'questions','[]')) q LEFT JOIN cats c ON c.id=q->>'category_id') s),'[]'),
 'category_tags',coalesce((SELECT jsonb_agg(jsonb_build_array(c.path,t.val) ORDER BY c.path::text,t.val::text) FROM jsonb_array_elements(coalesce(p->'category_tags','[]')) e JOIN cats c ON c.id=e->>'category_id' JOIN tags t ON t.id=e->>'tag_id'),'[]'))
$$;

CREATE FUNCTION public._demo_template_definition(p_slot text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE typ text; state text; qs jsonb; vs jsonb;
BEGIN
 IF p_slot='base' THEN RETURN public._demo_base_canonical(p); END IF;
 IF p_slot LIKE 'logo_%' THEN RETURN jsonb_build_object('name',p->>'name','type',CASE WHEN p->>'kind'='GLYPH' THEN 'GLYPH_30x10' ELSE 'PIX_150x70' END,'payload',p->'payload'); END IF;
 typ:=CASE WHEN p_slot='prepared' THEN 'prepared' WHEN p_slot LIKE 'poll_text_%' THEN 'poll_text' ELSE 'poll_points' END;
 state:=CASE WHEN p_slot LIKE '%_open' THEN 'poll_open' WHEN p_slot LIKE '%_closed' THEN 'ready' ELSE 'draft' END;
 SELECT coalesce(jsonb_agg(jsonb_build_object('text',q->>'text','answers',coalesce((SELECT jsonb_agg(jsonb_build_object('text',left(btrim(a->>'text'),17),'fixed_points',coalesce((a->>'fixed_points')::int,0)) ORDER BY ai) FROM jsonb_array_elements(coalesce(q->'answers','[]')) WITH ORDINALITY x(a,ai)),'[]')) ORDER BY qi),'[]') INTO qs FROM jsonb_array_elements(coalesce(p->'questions','[]')) WITH ORDINALITY x(q,qi);
 WITH votes AS (
  SELECT ord::int q,a#>>'{}' text FROM jsonb_array_elements(coalesce(p->'votes','[]')) v CROSS JOIN LATERAL jsonb_array_elements(coalesce(v->'answers_raw','[]')) WITH ORDINALITY x(a,ord) WHERE p_slot='poll_text_open'
  UNION ALL
  SELECT ord::int,p->'questions'->(ord::int-1)->'answers'->(a#>>'{}')::int->>'text' FROM jsonb_array_elements(coalesce(p->'votes','[]')) v CROSS JOIN LATERAL jsonb_array_elements(coalesce(v->'picks','[]')) WITH ORDINALITY x(a,ord) WHERE p_slot='poll_points_open'
  UNION ALL
  SELECT (v->>'question')::int,CASE WHEN p_slot='poll_text_open' THEN v->>'text' ELSE p->'questions'->((v->>'question')::int-1)->'answers'->((v->>'answer')::int-1)->>'text' END
  FROM jsonb_array_elements(coalesce(p->'demo_vote_counts','[]')) v CROSS JOIN LATERAL generate_series(1,(v->>'count')::int) n
 ), grouped AS(SELECT q,text,count(*) n FROM votes GROUP BY q,text)
 SELECT coalesce(jsonb_agg(jsonb_build_object('q',q,'text',text,'count',n) ORDER BY q,text),'[]') INTO vs FROM grouped;
 RETURN jsonb_build_object('name',p#>>'{game,name}','type',typ,'status',state,'settings','{}'::jsonb,'questions',qs,'votes',vs);
END $$;

CREATE FUNCTION public._demo_current_definition(p_kind text,p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; packet jsonb;
BEGIN
 IF p_kind='logo' THEN
  SELECT jsonb_build_object('name',name,'type',type,'payload',payload) INTO result FROM user_logos WHERE id=p_id AND is_demo;
 ELSIF p_kind='game' THEN
  SELECT jsonb_build_object('name',g.name,'type',g.type,'status',g.status,'settings',g.settings,
   'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('text',q.text,'answers',coalesce((SELECT jsonb_agg(jsonb_build_object('text',a.text,'fixed_points',a.fixed_points) ORDER BY a.ord,a.id) FROM answers a WHERE a.question_id=q.id),'[]')) ORDER BY q.ord,q.id) FROM questions q WHERE q.game_id=g.id),'[]'),
   'votes',coalesce((SELECT jsonb_agg(jsonb_build_object('q',ord,'text',text,'count',n) ORDER BY ord,text) FROM (
    SELECT ord,text,count(*) n FROM (
     SELECT q.ord,e.answer_raw text FROM poll_text_entries e JOIN questions q ON q.id=e.question_id WHERE e.game_id=g.id
     UNION ALL SELECT q.ord,a.text FROM poll_votes v JOIN questions q ON q.id=v.question_id JOIN answers a ON a.id=v.answer_id WHERE v.game_id=g.id
    ) x GROUP BY ord,text) v),'[]')) INTO result FROM games g WHERE g.id=p_id AND g.is_demo;
 ELSIF p_kind='base' THEN
  SELECT jsonb_build_object('base',jsonb_build_object('name',b.name),
   'categories',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM qb_categories c WHERE base_id=p_id),'[]'),
   'tags',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM qb_tags t WHERE base_id=p_id),'[]'),
   'questions',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM qb_questions q WHERE base_id=p_id),'[]'),
   'question_tags',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM qb_question_tags e JOIN qb_questions q ON q.id=e.question_id WHERE q.base_id=p_id),'[]'),
   'category_tags',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM qb_category_tags e JOIN qb_categories c ON c.id=e.category_id WHERE c.base_id=p_id),'[]')) INTO packet FROM question_bases b WHERE b.id=p_id AND b.is_demo;
  IF packet IS NOT NULL THEN result:=public._demo_base_canonical(packet); END IF;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public._demo_write(p_kind text,p_id uuid,p_slot text,p jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q jsonb; a jsonb; v jsonb; qi integer; ai integer; vi integer; off integer; qid uuid; aid uuid; sid uuid;
 qids uuid[]:='{}'; sids uuid[]:='{}'; amap jsonb:='{}'; cmap jsonb; tmap jsonb; qmap jsonb; owner uuid;
 typ game_type; stat game_status; definition jsonb;
BEGIN
 IF p_kind='logo' THEN
  UPDATE user_logos SET name=p->>'name',type=CASE WHEN p->>'kind'='GLYPH' THEN 'GLYPH_30x10' ELSE 'PIX_150x70' END,payload=p->'payload' WHERE id=p_id;
  RETURN;
 ELSIF p_kind='base' THEN
  SELECT owner_id INTO owner FROM question_bases WHERE id=p_id;
  DELETE FROM qb_categories WHERE base_id=p_id;
  DELETE FROM qb_questions WHERE base_id=p_id;
  DELETE FROM qb_tags WHERE base_id=p_id;
  UPDATE question_bases SET name=p#>>'{base,name}' WHERE id=p_id;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO cmap FROM jsonb_array_elements(p->'categories') x;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO tmap FROM jsonb_array_elements(p->'tags') x;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO qmap FROM jsonb_array_elements(p->'questions') x;
  INSERT INTO qb_categories(id,base_id,parent_id,name,ord) SELECT (cmap->>(x->>'id'))::uuid,p_id,(cmap->>(x->>'parent_id'))::uuid,x->>'name',coalesce((x->>'ord')::int,0) FROM jsonb_array_elements(p->'categories') x;
  INSERT INTO qb_tags(id,base_id,name,color,ord) SELECT (tmap->>(x->>'id'))::uuid,p_id,x->>'name',x->>'color',coalesce((x->>'ord')::int,0) FROM jsonb_array_elements(p->'tags') x;
  INSERT INTO qb_questions(id,base_id,category_id,ord,payload,updated_by) SELECT (qmap->>(x->>'id'))::uuid,p_id,(cmap->>(x->>'category_id'))::uuid,coalesce((x->>'ord')::int,0),x->'payload',owner FROM jsonb_array_elements(p->'questions') x;
  INSERT INTO qb_question_tags(question_id,tag_id) SELECT (qmap->>(x->>'question_id'))::uuid,(tmap->>(x->>'tag_id'))::uuid FROM jsonb_array_elements(p->'question_tags') x;
  INSERT INTO qb_category_tags(category_id,tag_id) SELECT (cmap->>(x->>'category_id'))::uuid,(tmap->>(x->>'tag_id'))::uuid FROM jsonb_array_elements(p->'category_tags') x;
  RETURN;
 END IF;
 definition:=public._demo_template_definition(p_slot,p);
 typ:=(definition->>'type')::game_type;stat:=(definition->>'status')::game_status;
 UPDATE games SET status='draft' WHERE id=p_id;
 DELETE FROM poll_sessions WHERE game_id=p_id;
 DELETE FROM questions WHERE game_id=p_id;
 UPDATE games SET name=p#>>'{game,name}',type=typ WHERE id=p_id;
 FOR q,qi IN SELECT value,ordinality::int FROM jsonb_array_elements(p->'questions') WITH ORDINALITY LOOP
  INSERT INTO questions(game_id,ord,text) VALUES(p_id,qi,q->>'text') RETURNING id INTO qid;
  qids:=array_append(qids,qid);
  FOR a,ai IN SELECT value,ordinality::int FROM jsonb_array_elements(coalesce(q->'answers','[]')) WITH ORDINALITY LOOP
   INSERT INTO answers(question_id,ord,text,fixed_points) VALUES(qid,ai,left(btrim(a->>'text'),17),coalesce((a->>'fixed_points')::int,0)) RETURNING id INTO aid;
   amap:=amap||jsonb_build_object(qi::text||':'||ai::text,aid);
  END LOOP;
  IF stat='poll_open' THEN
   INSERT INTO poll_sessions(game_id,question_id,question_ord,is_open) VALUES(p_id,qid,qi,true) RETURNING id INTO sid;
   sids:=array_append(sids,sid);
  END IF;
 END LOOP;
 IF stat='poll_open' THEN
  FOR v IN SELECT value FROM jsonb_array_elements(definition->'votes') LOOP
   qi:=(v->>'q')::int;
   IF typ='poll_text' THEN
    SELECT count(*) INTO off FROM poll_text_entries WHERE game_id=p_id AND question_id=qids[qi];
    FOR vi IN 1..(v->>'count')::int LOOP
     INSERT INTO poll_text_entries(game_id,poll_session_id,question_id,voter_token,answer_raw,answer_norm)
      VALUES(p_id,sids[qi],qids[qi],'demo_seed_v'||lpad((off+vi)::text,6,'0'),v->>'text',lower(regexp_replace(btrim(v->>'text'),'\s+',' ','g')));
    END LOOP;
   ELSE
    SELECT id,ord INTO aid,ai FROM answers WHERE question_id=qids[qi] AND text=v->>'text' ORDER BY ord LIMIT 1;
    SELECT count(*) INTO off FROM poll_votes WHERE game_id=p_id AND question_id=qids[qi];
    FOR vi IN 1..(v->>'count')::int LOOP
     INSERT INTO poll_votes(game_id,question_ord,answer_ord,voter_token,poll_session_id,question_id,answer_id)
      VALUES(p_id,qi,ai,'demo_seed_v'||lpad((off+vi)::text,6,'0'),sids[qi],qids[qi],aid);
    END LOOP;
   END IF;
  END LOOP;
 END IF;
 UPDATE games SET status=stat WHERE id=p_id;
END $$;

CREATE FUNCTION public.admin_demo_preview(p_lang text,p_slot text,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old jsonb; expected jsonb; kind text; n integer;
BEGIN
 IF p_lang NOT IN ('pl','en','uk') OR p_slot NOT IN ('base','logo_text','logo_draw','logo_image','prepared','poll_text_open','poll_text_closed','poll_text_draft','poll_points_open','poll_points_closed','poll_points_draft') THEN RAISE EXCEPTION 'invalid_demo_slot'; END IF;
 SELECT payload INTO old FROM demo_template_data WHERE lang=p_lang AND slot=p_slot;
 IF old IS NULL THEN RAISE EXCEPTION 'demo_template_not_found'; END IF;
 kind:=CASE WHEN p_slot='base' THEN 'base' WHEN p_slot LIKE 'logo_%' THEN 'logo' ELSE 'game' END;
 expected:=public._demo_template_definition(p_slot,old);
 SELECT count(*) INTO n FROM (
  SELECT id FROM games WHERE is_demo AND kind='game'
  UNION ALL SELECT id FROM user_logos WHERE is_demo AND kind='logo'
  UNION ALL SELECT id FROM question_bases WHERE is_demo AND kind='base'
 ) x WHERE public._demo_current_definition(kind,x.id)=expected;
 RETURN jsonb_build_object('ok',true,'eligible',n,'revision',encode(sha256(convert_to(old::text,'UTF8')),'hex'),'kind',kind,'definition',public._demo_template_definition(p_slot,p_payload));
END $$;

CREATE FUNCTION public.admin_demo_replace(p_request uuid,p_lang text,p_slot text,p_payload jsonb,p_revision text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old jsonb; check_result jsonb; upd uuid; kind text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('admin-demo',0));
 SELECT id INTO upd FROM admin_demo_updates WHERE request_id=p_request;
 IF upd IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'id',upd,'already',true); END IF;
 SELECT payload INTO old FROM demo_template_data WHERE lang=p_lang AND slot=p_slot FOR UPDATE;
 IF old IS NULL OR encode(sha256(convert_to(old::text,'UTF8')),'hex') IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'demo_version_changed_refresh_preview'; END IF;
 check_result:=public.admin_demo_preview(p_lang,p_slot,p_payload);kind:=check_result->>'kind';
 -- Type/shape checked independently of the browser by the private API and SQL definition builder.
 IF check_result->'definition' IS NULL THEN RAISE EXCEPTION 'invalid_demo_payload'; END IF;
 INSERT INTO admin_demo_updates(request_id,lang,slot,old_payload,new_payload,old_definition) VALUES(p_request,p_lang,p_slot,old,p_payload,public._demo_template_definition(p_slot,old)) RETURNING id INTO upd;
 INSERT INTO admin_demo_targets(update_id,kind,resource_id)
  SELECT upd,kind,x.id FROM (SELECT id FROM games WHERE is_demo AND kind='game' UNION ALL SELECT id FROM user_logos WHERE is_demo AND kind='logo' UNION ALL SELECT id FROM question_bases WHERE is_demo AND kind='base') x
  WHERE public._demo_current_definition(kind,x.id)=public._demo_template_definition(p_slot,old);
 UPDATE demo_template_data SET payload=p_payload WHERE lang=p_lang AND slot=p_slot;
 RETURN jsonb_build_object('ok',true,'id',upd,'eligible',check_result->'eligible');
END $$;

CREATE FUNCTION public.admin_demo_apply_next() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target admin_demo_targets; job admin_demo_updates; current_def jsonb; owner uuid;
BEGIN
 SELECT * INTO target FROM admin_demo_targets WHERE status='queued' AND next_run_at<=now() ORDER BY update_id,resource_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO job FROM admin_demo_updates WHERE id=target.update_id;
 BEGIN
  IF target.kind='game' THEN SELECT owner_id INTO owner FROM games WHERE id=target.resource_id FOR UPDATE NOWAIT;
  ELSIF target.kind='base' THEN SELECT owner_id INTO owner FROM question_bases WHERE id=target.resource_id FOR UPDATE NOWAIT;
  ELSE SELECT user_id INTO owner FROM user_logos WHERE id=target.resource_id FOR UPDATE NOWAIT; END IF;
  current_def:=public._demo_current_definition(target.kind,target.resource_id);
  IF current_def IS NULL THEN UPDATE admin_demo_targets SET status='removed' WHERE update_id=target.update_id AND resource_id=target.resource_id; RETURN jsonb_build_object('status','removed'); END IF;
  IF current_def IS DISTINCT FROM job.old_definition THEN UPDATE admin_demo_targets SET status='edited' WHERE update_id=target.update_id AND resource_id=target.resource_id; RETURN jsonb_build_object('status','edited'); END IF;
  IF (target.kind='game' AND public._game_control_active(target.resource_id)) OR EXISTS(SELECT 1 FROM edit_locks l WHERE heartbeat_at>clock_timestamp()-public.edit_lock_ttl() AND
   ((l.resource_type=target.kind AND l.resource_id=target.resource_id) OR (target.kind='logo' AND l.resource_type='logos' AND l.resource_id=owner) OR
    (target.kind='base' AND ((l.resource_type='base_question' AND l.resource_id IN(SELECT id FROM qb_questions WHERE base_id=target.resource_id)) OR (l.resource_type='base_folder' AND l.resource_id IN(SELECT id FROM qb_categories WHERE base_id=target.resource_id)) OR (l.resource_type='base_tag' AND l.resource_id IN(SELECT id FROM qb_tags WHERE base_id=target.resource_id)))))) THEN
    RAISE lock_not_available;
  END IF;
  PERFORM public._demo_write(target.kind,target.resource_id,job.slot,job.new_payload);
  UPDATE admin_demo_targets SET status='updated',message='' WHERE update_id=target.update_id AND resource_id=target.resource_id;
  RETURN jsonb_build_object('status','updated');
 EXCEPTION WHEN lock_not_available THEN
  UPDATE admin_demo_targets SET next_run_at=now()+interval '30 seconds',message='Materiał jest używany; aktualizacja po zwolnieniu.' WHERE update_id=target.update_id AND resource_id=target.resource_id;
  RETURN jsonb_build_object('status','busy');
 WHEN OTHERS THEN
  UPDATE admin_demo_targets SET status='failed',message=left(SQLSTATE||': '||SQLERRM,200) WHERE update_id=target.update_id AND resource_id=target.resource_id;
  RETURN jsonb_build_object('status','failed');
 END;
END $$;

CREATE OR REPLACE FUNCTION public.seed_demo_for_user(p_uid uuid,p_lang text DEFAULT 'pl') RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_lang text:=lower(btrim(coalesce(p_lang,'pl'))); tpl record; rid uuid; kind text;
BEGIN
 IF v_lang NOT IN ('pl','en','uk') THEN v_lang:='pl'; END IF;
 FOR tpl IN SELECT * FROM demo_template_data WHERE demo_template_data.lang=v_lang ORDER BY slot LOOP
  IF tpl.slot='base' THEN
   kind:='base';INSERT INTO question_bases(owner_id,name,is_demo) VALUES(p_uid,tpl.payload#>>'{base,name}',true) RETURNING id INTO rid;
  ELSIF tpl.slot LIKE 'logo_%' THEN
   kind:='logo';INSERT INTO user_logos(user_id,name,type,is_demo,payload) VALUES(p_uid,tpl.payload->>'name',CASE WHEN tpl.payload->>'kind'='GLYPH' THEN 'GLYPH_30x10' ELSE 'PIX_150x70' END,true,tpl.payload->'payload') RETURNING id INTO rid;
  ELSIF tpl.slot IN ('prepared','poll_text_open','poll_text_closed','poll_text_draft','poll_points_open','poll_points_closed','poll_points_draft') THEN
   kind:='game';INSERT INTO games(owner_id,name,type,is_demo) VALUES(p_uid,tpl.payload#>>'{game,name}',CASE WHEN tpl.slot='prepared' THEN 'prepared'::game_type WHEN tpl.slot LIKE 'poll_text_%' THEN 'poll_text'::game_type ELSE 'poll_points'::game_type END,true) RETURNING id INTO rid;
  ELSE CONTINUE; END IF;
  PERFORM public._demo_write(kind,rid,tpl.slot,tpl.payload);
 END LOOP;
END $$;

DO $$ DECLARE obj record; BEGIN
 ALTER TABLE public.admin_demo_updates ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.admin_demo_targets ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.admin_demo_updates,public.admin_demo_targets FROM PUBLIC,anon,authenticated;
 GRANT ALL ON public.admin_demo_updates,public.admin_demo_targets TO service_role;
 FOR obj IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'admin_demo_%' OR proname LIKE '\_demo\_%' ESCAPE '\') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',obj.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',obj.sig);
 END LOOP;
END $$;
COMMIT;
