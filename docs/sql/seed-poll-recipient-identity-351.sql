\set ON_ERROR_STOP on
-- Isolated only: persisted legacy records before migration351.
INSERT INTO auth.users(id,email,is_anonymous,raw_user_meta_data) VALUES
('aaaaaaaa-3512-0000-0000-000000000001','owner351backfill@example.invalid',false,'{}'),
('bbbbbbbb-3512-0000-0000-000000000002','recipient351backfill@example.invalid',false,'{}'),
('cccccccc-3512-0000-0000-000000000003','guest351backfill@example.invalid',true,'{"is_guest":true}'),
('eeeeeeee-3512-0000-0000-000000000005','actual351backfill@example.invalid',false,'{}');
INSERT INTO public.profiles(id,email,username,is_guest) SELECT id,email,'backfill351_'||left(id::text,8),is_anonymous FROM auth.users WHERE id IN('aaaaaaaa-3512-0000-0000-000000000001','bbbbbbbb-3512-0000-0000-000000000002','cccccccc-3512-0000-0000-000000000003','eeeeeeee-3512-0000-0000-000000000005') ON CONFLICT(id) DO UPDATE SET email=excluded.email,is_guest=excluded.is_guest;
UPDATE public.profiles SET email='spoof351backfill@example.invalid' WHERE id='eeeeeeee-3512-0000-0000-000000000005';
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES
('dddddddd-3512-0000-0000-000000000004','aaaaaaaa-3512-0000-0000-000000000001','Backfill351 text','poll_text','poll_open','backfill351-text'),
('dddddddd-3512-0000-0000-000000000006','aaaaaaaa-3512-0000-0000-000000000001','Backfill351 points','poll_points','poll_open','backfill351-points');
INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll,status)
SELECT g.owner_id,'recipient351backfill@example.invalid',g.id,g.type::text,g.share_key_poll,st FROM public.games g CROSS JOIN unnest(ARRAY['pending','opened','done','declined','cancelled']) st WHERE g.id IN('dddddddd-3512-0000-0000-000000000004','dddddddd-3512-0000-0000-000000000006');
INSERT INTO public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll)
SELECT g.owner_id,e,g.id,g.type::text,g.share_key_poll FROM public.games g CROSS JOIN unnest(ARRAY['guest351backfill@example.invalid','spoof351backfill@example.invalid','unknown351backfill@example.invalid']) e WHERE g.id='dddddddd-3512-0000-0000-000000000004';
