-- Local clone source contract; not a migration or a public endpoint.
BEGIN;
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('slot',slot,'lang',lang,'payload',payload) ORDER BY slot,lang),'[]') INTO templates FROM public.demo_template_data
  WHERE (p_kind='game' AND payload ? 'game') OR (p_kind='logo' AND slot LIKE 'logo_%');
 RETURN snapshot||jsonb_build_object('demo_origin',inherited_demo,'demo_templates',templates);
END $$;
REVOKE ALL ON FUNCTION public._resource_clone_read(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
