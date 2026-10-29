\set ON_ERROR_STOP 1
-- 502: import motywów — dostęp z panelu, odczyt tylko własnych, sprzątanie pliku.
BEGIN;
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); r jsonb; t1 uuid; n int;
BEGIN
 IF has_function_privilege('anon','my_display_themes()','EXECUTE') THEN RAISE EXCEPTION 'my_themes_anon'; END IF;
 IF has_function_privilege('authenticated','admin_theme_import_access_set(text,boolean)','EXECUTE')
  OR has_function_privilege('authenticated','admin_theme_import_access_list()','EXECUTE') THEN RAISE EXCEPTION 'admin_exposed'; END IF;
 IF has_table_privilege('authenticated','user_display_themes','INSERT') OR has_table_privilege('authenticated','user_display_themes','DELETE')
  OR has_table_privilege('authenticated','theme_import_access','INSERT') THEN RAISE EXCEPTION 'tables_writable'; END IF;
 IF NOT (SELECT public FROM storage.buckets WHERE id='user-themes') THEN RAISE EXCEPTION 'bucket_not_public'; END IF;

 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(a,'theme-a@example.invalid','{}'),(b,'theme-b@example.invalid','{}'),(g,'theme-g@example.invalid','{}');
 INSERT INTO profiles(id,email,username,is_guest) VALUES(a,'theme-a@example.invalid','motywA',false),(b,'theme-b@example.invalid','motywB',false),(g,'theme-g@example.invalid','gosc',true)
  ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username,is_guest=excluded.is_guest;

 r:=admin_theme_import_access_set('MOTYWA',true);
 IF NOT (r->>'ok')::boolean OR (r->>'user_id')::uuid<>a THEN RAISE EXCEPTION 'grant_by_username %',r; END IF;
 r:=admin_theme_import_access_set('theme-b@example.invalid',true);
 IF (r->>'user_id')::uuid<>b THEN RAISE EXCEPTION 'grant_by_email %',r; END IF;
 IF admin_theme_import_access_set('gosc',true)->>'error'<>'guest' THEN RAISE EXCEPTION 'guest_granted'; END IF;
 IF admin_theme_import_access_set('nikt',true)->>'error'<>'not_found' THEN RAISE EXCEPTION 'unknown_granted'; END IF;
 PERFORM admin_theme_import_access_set('motywA',true);
 IF jsonb_array_length(admin_theme_import_access_list())<>2 THEN RAISE EXCEPTION 'list_count'; END IF;

 INSERT INTO user_display_themes(owner_id,name,size_bytes,background,background_label) VALUES(a,'Motyw A',100,'#102030','{"pl":"Obręcz","en":"Rim","uk":"Обідок"}') RETURNING id INTO t1;
 INSERT INTO user_display_themes(owner_id,name,size_bytes) VALUES(b,'Motyw B',100);

 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SET LOCAL ROLE authenticated;
 r:=my_display_themes();
 IF NOT (r->>'can_import')::boolean OR jsonb_array_length(r->'themes')<>1 OR r#>>'{themes,0,name}'<>'Motyw A' OR r#>>'{themes,0,background_label,pl}'<>'Obręcz' THEN RAISE EXCEPTION 'own_themes %',r; END IF;
 SELECT count(*) INTO n FROM user_display_themes; IF n<>1 THEN RAISE EXCEPTION 'rls_select %',n; END IF;
 RESET ROLE;

 PERFORM admin_theme_import_access_set('motywA',false);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SET LOCAL ROLE authenticated;
 r:=my_display_themes();
 IF (r->>'can_import')::boolean OR jsonb_array_length(r->'themes')<>1 THEN RAISE EXCEPTION 'revoked_keeps_themes %',r; END IF;
 RESET ROLE;

 DELETE FROM user_display_themes WHERE id=t1;
 IF NOT EXISTS(SELECT 1 FROM storage_cleanup_queue WHERE bucket='user-themes' AND path=t1::text||'.json') THEN RAISE EXCEPTION 'cleanup_not_queued'; END IF;
 DELETE FROM auth.users WHERE id=b;
 IF EXISTS(SELECT 1 FROM user_display_themes WHERE owner_id=b) OR EXISTS(SELECT 1 FROM theme_import_access WHERE user_id=b) THEN RAISE EXCEPTION 'cascade'; END IF;
 IF (SELECT count(*) FROM storage_cleanup_queue WHERE bucket='user-themes')<>2 THEN RAISE EXCEPTION 'cascade_cleanup'; END IF;
 RAISE NOTICE 'display-theme-import-503 OK';
END $$;
ROLLBACK;
