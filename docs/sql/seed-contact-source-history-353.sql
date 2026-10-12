BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
('aaaaaaaa-3533-0000-0000-000000000001','owner353history@example.invalid','{"username":"owner353history"}'),
('bbbbbbbb-3533-0000-0000-000000000002','recipient353history@example.invalid','{"username":"recipient353history"}'),
('dddddddd-3533-0000-0000-000000000004','known353history@example.invalid','{"username":"known353history"}');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_email,status) VALUES('eeeeeeee-3533-0000-0000-000000000005','aaaaaaaa-3533-0000-0000-000000000001','recipient353history@example.invalid','active');
INSERT INTO public.poll_subscriptions(id,owner_id,subscriber_user_id,status) VALUES('eeeeeeee-3533-0000-0000-000000000006','aaaaaaaa-3533-0000-0000-000000000001','dddddddd-3533-0000-0000-000000000004','pending');
INSERT INTO public.games(id,owner_id,name,type,status,share_key_poll) VALUES('ffffffff-3533-0000-0000-000000000007','aaaaaaaa-3533-0000-0000-000000000001','Historical source353','poll_text','poll_open','history353');
INSERT INTO public.poll_tasks(id,owner_id,recipient_user_id,game_id,poll_type,share_key_poll) VALUES('ffffffff-3533-0000-0000-000000000008','aaaaaaaa-3533-0000-0000-000000000001','bbbbbbbb-3533-0000-0000-000000000002','ffffffff-3533-0000-0000-000000000007','poll_text','history353');
COMMIT;
