-- Migration 308: strony logo przeniesione z /logo-editor/ na /logo/
-- (lista) i /logo/editor-text|draw|image/ (edytory). Bez przekierowań
-- ze starych adresów (docs/nawigacja-mapa-plan.md, „Bez fallbacków”), więc:
--
-- 1. Obraz demo „DEMO - Logo Obraz” ma adres zapisany w danych
--    (payload.source.imageUrl) — przenosimy go na /logo/assets/.
-- 2. Aktywność stron: nazwa strony to pierwszy segment adresu, czyli teraz
--    „logo” zamiast „logo-editor” (web/shared/js/core/activity.js).
--    Kontekst blokady edycji logo („logo-editor” w edit_locks) bez zmian —
--    to nazwa edytora, nie adres.
BEGIN;

UPDATE public.demo_template_data
SET payload = replace(payload::text, '/logo-editor/assets/demo-image.png', '/logo/assets/demo-image.png')::jsonb
WHERE payload::text LIKE '%/logo-editor/assets/demo-image.png%';

UPDATE public.user_logos
SET payload = replace(payload::text, '/logo-editor/assets/demo-image.png', '/logo/assets/demo-image.png')::jsonb
WHERE payload::text LIKE '%/logo-editor/assets/demo-image.png%';

UPDATE public.site_activity SET page = 'logo' WHERE page = 'logo-editor';

CREATE OR REPLACE FUNCTION public.site_activity_ping(p_tab_id uuid,p_page text,p_game_id uuid DEFAULT NULL,p_visible boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid := auth.uid(); gid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF p_tab_id IS NULL OR p_page IS NULL OR p_page NOT IN
 ('home','games','control','editor','game-settings','bases','base-explorer','logo','polls','polls-hub','subscriptions','account','marketplace','manual','connect-device') THEN RAISE EXCEPTION 'invalid_page'; END IF;
 IF p_game_id IS NOT NULL AND p_page IN ('control','editor','game-settings','polls') THEN
   SELECT id INTO gid FROM public.games WHERE id=p_game_id AND owner_id=uid;
 END IF;
 -- One row per tab, bounded lifetime. No historical log.
 DELETE FROM public.site_activity WHERE last_seen_at < now()-interval '1 day';
 DELETE FROM public.site_activity_hours WHERE bucket < now()-interval '90 days';
 INSERT INTO public.site_activity_hours(bucket,user_id) VALUES(date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',uid) ON CONFLICT DO NOTHING;
 INSERT INTO public.site_activity(user_id,tab_id,page,game_id,visible,last_seen_at)
 VALUES(uid,p_tab_id,p_page,gid,coalesce(p_visible,true),now())
 ON CONFLICT(user_id,tab_id) DO UPDATE SET page=excluded.page,game_id=excluded.game_id,visible=excluded.visible,last_seen_at=excluded.last_seen_at;
END $$;

COMMIT;
