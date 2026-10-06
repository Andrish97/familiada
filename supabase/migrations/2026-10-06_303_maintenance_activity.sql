-- Additive, short-lived operational presence; no browsing history or answer text.
BEGIN;
CREATE TABLE public.site_activity (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 tab_id uuid NOT NULL,
 page text NOT NULL,
 game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
 visible boolean NOT NULL DEFAULT true,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,tab_id)
);
CREATE INDEX site_activity_seen_idx ON public.site_activity(last_seen_at);
ALTER TABLE public.site_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_activity FROM PUBLIC,anon,authenticated;

-- Deduplication by user/hour allows true unique-user daily and weekly totals.
CREATE TABLE public.site_activity_hours (
 bucket timestamptz NOT NULL,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 PRIMARY KEY(bucket,user_id)
);
ALTER TABLE public.site_activity_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_activity_hours FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.site_activity_ping(p_tab_id uuid,p_page text,p_game_id uuid DEFAULT NULL,p_visible boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid := auth.uid(); gid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF p_tab_id IS NULL OR p_page IS NULL OR p_page NOT IN
 ('home','games','control','control2','editor','game-settings','game-settings2','bases','base-explorer','logo-editor','polls','polls-hub','subscriptions','account','marketplace','manual','connect-device') THEN RAISE EXCEPTION 'invalid_page'; END IF;
 IF p_game_id IS NOT NULL AND p_page IN ('control','control2','editor','game-settings','game-settings2','polls') THEN
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
REVOKE ALL ON FUNCTION public.site_activity_ping(uuid,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.site_activity_ping(uuid,text,uuid,boolean) TO authenticated;

CREATE FUNCTION public.get_maintenance_activity() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH pages AS (
 SELECT a.*,coalesce(p.username,p.email,'Użytkownik') AS username FROM public.site_activity a
 JOIN public.profiles p ON p.id=a.user_id WHERE a.last_seen_at>now()-interval '90 seconds' AND NOT EXISTS(SELECT 1 FROM public.stats_excluded_users e WHERE e.user_id=a.user_id)
 ), locks AS (
 SELECT l.*,coalesce(p.username,p.email,'Użytkownik') AS username,
 CASE WHEN l.resource_type='game' THEN g.name ELSE NULL END AS resource_name
 FROM public.edit_locks l LEFT JOIN public.profiles p ON p.id=l.holder_user_id
 LEFT JOIN public.games g ON l.resource_type='game' AND g.id=l.resource_id
 WHERE l.heartbeat_at>now()-interval '25 seconds' AND NOT EXISTS(SELECT 1 FROM public.stats_excluded_users e WHERE e.user_id=l.holder_user_id)
 ), devices AS (
 SELECT game_id,max(last_seen_at) AS last_seen_at,jsonb_agg(DISTINCT device_type::text) AS devices
 FROM public.device_presence WHERE last_seen_at>now()-interval '25 seconds' GROUP BY game_id
 ), sessions AS (
 SELECT DISTINCT ON(game_id) * FROM public.game_sessions ORDER BY game_id,started_at DESC,id
 ), candidates AS (
 SELECT game_id FROM devices
 UNION SELECT game_id FROM pages WHERE game_id IS NOT NULL AND page IN ('control','control2')
 UNION SELECT game_id FROM sessions WHERE ended_at IS NULL AND status IN ('started','playing','final') AND last_seen_at>now()-interval '15 minutes'
 UNION SELECT resource_id FROM locks WHERE resource_type='game' AND holder_context='control'
 ), games AS (
 SELECT g.id AS game_id,g.owner_id AS user_id,coalesce(p.username,p.email,'Użytkownik') AS username,g.name,
 coalesce((SELECT max(CASE WHEN a.page='control2' THEN 2 ELSE 1 END) FROM pages a WHERE a.game_id=g.id AND a.page IN ('control','control2')),s.control_version,1) AS control_version,
 s.status,s.ended_at,s.last_seen_at AS session_seen_at,
 CASE WHEN s.control_version=2 OR EXISTS(SELECT 1 FROM pages a WHERE a.game_id=g.id AND a.page='control2') THEN st.step::text ELSE NULL END AS step,
 CASE WHEN s.control_version=2 OR EXISTS(SELECT 1 FROM pages a WHERE a.game_id=g.id AND a.page='control2') THEN st.phase::text ELSE NULL END AS phase,
 coalesce(d.devices,'[]'::jsonb) AS devices,d.last_seen_at AS devices_seen_at,
 EXISTS(SELECT 1 FROM pages a WHERE a.game_id=g.id AND a.page IN ('control','control2')) AS operator_online,
 EXISTS(SELECT 1 FROM locks l WHERE l.resource_type='game' AND l.resource_id=g.id AND l.holder_context='control') AS control_lock
 FROM candidates c JOIN public.games g ON g.id=c.game_id LEFT JOIN public.profiles p ON p.id=g.owner_id
 LEFT JOIN sessions s ON s.game_id=g.id LEFT JOIN devices d ON d.game_id=g.id LEFT JOIN public.game_state st ON st.game_id=g.id
 WHERE NOT EXISTS(SELECT 1 FROM public.stats_excluded_users e WHERE e.user_id=g.owner_id)
 ), history_rows AS (SELECT * FROM public.site_activity_hours h WHERE NOT EXISTS(SELECT 1 FROM public.stats_excluded_users e WHERE e.user_id=h.user_id))
 SELECT jsonb_build_object('generated_at',now(),
 'pages',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM pages ORDER BY last_seen_at DESC LIMIT 500) x),'[]'::jsonb),
 'locks',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM locks ORDER BY heartbeat_at DESC LIMIT 500) x),'[]'::jsonb),
 'games',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM games ORDER BY name,game_id LIMIT 500) x),'[]'::jsonb),
 'history',jsonb_build_object(
 'hour',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT b AS bucket,count(DISTINCT h.user_id) AS users FROM generate_series(greatest((SELECT min(bucket) FROM history_rows),date_trunc('hour',now())-interval '47 hours'),date_trunc('hour',now()),interval '1 hour') b LEFT JOIN history_rows h ON h.bucket=b WHERE EXISTS(SELECT 1 FROM history_rows) GROUP BY b ORDER BY b) x),'[]'::jsonb),
 'day',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT b AT TIME ZONE 'Europe/Warsaw' AS bucket,count(DISTINCT h.user_id) AS users FROM generate_series(greatest((SELECT date_trunc('day',min(bucket) AT TIME ZONE 'Europe/Warsaw') FROM history_rows),date_trunc('day',now() AT TIME ZONE 'Europe/Warsaw')-interval '29 days'),date_trunc('day',now() AT TIME ZONE 'Europe/Warsaw'),interval '1 day') b LEFT JOIN history_rows h ON date_trunc('day',h.bucket AT TIME ZONE 'Europe/Warsaw')=b WHERE EXISTS(SELECT 1 FROM history_rows) GROUP BY b ORDER BY b) x),'[]'::jsonb),
 'week',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT b AT TIME ZONE 'Europe/Warsaw' AS bucket,count(DISTINCT h.user_id) AS users FROM generate_series(greatest((SELECT date_trunc('week',min(bucket) AT TIME ZONE 'Europe/Warsaw') FROM history_rows),date_trunc('week',now() AT TIME ZONE 'Europe/Warsaw')-interval '12 weeks'),date_trunc('week',now() AT TIME ZONE 'Europe/Warsaw'),interval '1 week') b LEFT JOIN history_rows h ON date_trunc('week',h.bucket AT TIME ZONE 'Europe/Warsaw')=b WHERE EXISTS(SELECT 1 FROM history_rows) GROUP BY b ORDER BY b) x),'[]'::jsonb),
 'since',(SELECT min(bucket) FROM history_rows),'timezone','Europe/Warsaw'),
 'truncated',(SELECT count(*)>500 FROM pages) OR (SELECT count(*)>500 FROM locks) OR (SELECT count(*)>500 FROM games));
$$;
REVOKE ALL ON FUNCTION public.get_maintenance_activity() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_maintenance_activity() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
