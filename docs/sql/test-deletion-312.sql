-- Test lokalny migracji 312 (docs/sql/local-db.md). Uruchomienie po załadowaniu schematu i migracji.
-- psql -h <dir> -p <port> -U postgres -d fam -v ON_ERROR_STOP=1 -f docs/sql/test-deletion-312.sql
\set ON_ERROR_STOP on
BEGIN;
alter table public.mail_queue disable trigger trg_mail_queue_cooldown_guard;
insert into public.mail_cooldown_policies(action_key,scope,cooldown_seconds) values ('poll:share','pair',60) on conflict do nothing;
create temp table res(name text, ok boolean);
grant all on res to public;

insert into auth.users(id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a312@test.pl'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b312@test.pl');
insert into public.profiles(id,email,username) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a312@test.pl','a312'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b312@test.pl','b312')
on conflict (id) do update set email=excluded.email;

-- gra A z ankietą (otwarta), pytanie i głosy B oraz anonimowy
insert into public.games(id,owner_id,name,type,status) values ('a1a1a1a1-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Gra A','poll_text','poll_open');
insert into public.questions(id,game_id,ord,text) values ('c1c1c1c1-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001',1,'Pytanie');
insert into public.poll_sessions(id,game_id,question_ord,question_id) values ('d1d1d1d1-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001',1,'c1c1c1c1-0000-0000-0000-000000000001');
insert into public.poll_text_entries(game_id,poll_session_id,question_id,voter_token,answer_raw,answer_norm,voter_user_id) values
 ('a1a1a1a1-0000-0000-0000-000000000001','d1d1d1d1-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000001','tokenB-12345678','kot','kot','bbbbbbbb-0000-0000-0000-000000000002'),
 ('a1a1a1a1-0000-0000-0000-000000000001','d1d1d1d1-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000001','tokenX-12345678','pies','pies',null);
-- gra B
insert into public.games(id,owner_id,name) values ('b1b1b1b1-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Gra B');
-- dane po e-mailu B
insert into public.poll_subscriptions(owner_id,subscriber_email) values ('aaaaaaaa-0000-0000-0000-000000000001','b312@test.pl');
insert into public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll) values ('aaaaaaaa-0000-0000-0000-000000000001','B312@test.pl','a1a1a1a1-0000-0000-0000-000000000001','poll_text','k1');
insert into public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key,created_by) values ('b312@test.pl','s','x','poll:share','email:x','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key,created_by) values ('inny@test.pl','s','x','poll:share','email:y','bbbbbbbb-0000-0000-0000-000000000002');
insert into public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key,created_by) values ('keep@test.pl','s','x','poll:share','email:z','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.mail_function_logs(function_name,event,recipient_email) values ('f','e','b312@test.pl');
insert into public.email_unsub_tokens(email) values ('b312@test.pl');
insert into public.email_intents(email,intent,status) values ('b312@test.pl','signup','pending');
insert into public.email_cooldowns(email_hash,action_key) values (md5('b312@test.pl'),'k');
insert into public.mail_cooldowns(action_key,target_key,next_allowed_at) values ('poll:share','pair:aaaaaaaa-0000-0000-0000-000000000001:email:'||md5('b312@test.pl'),now());
insert into public.contact_reports(ticket_number,email,subject,message) values ('T312','b312@test.pl','s','wiadomosc test');
insert into public.contact_reports(ticket_number,email,subject,message) values ('T312b','a312@test.pl','s','wiadomosc test');

-- 1) usunięcie gry A z OTWARTĄ ankietą: najpierw ze świeżą cudzą blokadą -> odmowa
insert into public.edit_locks(resource_type,resource_id,holder_tab_id,holder_user_id,holder_context) values ('game','a1a1a1a1-0000-0000-0000-000000000001','tab','bbbbbbbb-0000-0000-0000-000000000002','control');
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',true);
insert into res select 'game z blokadą: odmowa', (public.delete_resource_checked('game','a1a1a1a1-0000-0000-0000-000000000001')->>'reason')='locked'
  and exists(select 1 from public.games where id='a1a1a1a1-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','',true);

-- 2) konto B usunięte (nadrzędne: blokada B nie przeszkadza)
select public.delete_user_everything('bbbbbbbb-0000-0000-0000-000000000002');
insert into res select 'głosy B w ankiecie A zostają (2 wpisy)', (select count(*) from public.poll_text_entries where game_id='a1a1a1a1-0000-0000-0000-000000000001')=2;
insert into res select 'głos B ma voter_user_id NULL', (select count(*) from public.poll_text_entries where voter_user_id is not null)=0;
insert into res select 'gra B usunięta', not exists(select 1 from public.games where id='b1b1b1b1-0000-0000-0000-000000000001');
insert into res select 'subskrypcja po e-mailu B usunięta', not exists(select 1 from public.poll_subscriptions where lower(subscriber_email)='b312@test.pl');
insert into res select 'poll_task po e-mailu B usunięty', not exists(select 1 from public.poll_tasks where lower(recipient_email)='b312@test.pl');
insert into res select 'mail_queue do/od B usunięte, cudze zostają', (select count(*) from public.mail_queue)=1 and exists(select 1 from public.mail_queue where to_email='keep@test.pl');
insert into res select 'logi, tokeny, intents, cooldowny B usunięte',
  not exists(select 1 from public.mail_function_logs where recipient_email='b312@test.pl')
  and not exists(select 1 from public.email_unsub_tokens where email='b312@test.pl')
  and not exists(select 1 from public.email_intents where email='b312@test.pl')
  and not exists(select 1 from public.email_cooldowns where email_hash=md5('b312@test.pl'))
  and not exists(select 1 from public.mail_cooldowns where target_key like '%'||md5('b312@test.pl')||'%');
insert into res select 'contact_reports B usunięte, A zostaje', (select count(*) from public.contact_reports)=1 and exists(select 1 from public.contact_reports where email='a312@test.pl');
insert into res select 'konto B usunięte', not exists(select 1 from auth.users where id='bbbbbbbb-0000-0000-0000-000000000002') and not exists(select 1 from public.edit_locks where holder_user_id='bbbbbbbb-0000-0000-0000-000000000002');

-- 3) gra A z otwartą ankietą, blokada zniknęła wraz z kontem B -> usunięcie przechodzi
insert into public.poll_tasks(owner_id,recipient_email,game_id,poll_type,share_key_poll,token) values ('aaaaaaaa-0000-0000-0000-000000000001','c312@test.pl','a1a1a1a1-0000-0000-0000-000000000001','poll_text','k1','11111111-1111-1111-1111-111111111111');
insert into public.mail_queue(to_email,subject,html,cooldown_action_key,cooldown_target_key,created_by) values ('c312@test.pl','s','<a href="https://x/poll-go?t=11111111-1111-1111-1111-111111111111">','poll:share','email:c','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.shared_devices(owner_id,recipient_id,device_type,game_id) values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','host','a1a1a1a1-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',true);
insert into res select 'game poll_open bez blokady: ok', (public.delete_resource_checked('game','a1a1a1a1-0000-0000-0000-000000000001')->>'ok')::boolean;
insert into res select 'gra, głosy, sesje, taski usunięte', not exists(select 1 from public.games where id='a1a1a1a1-0000-0000-0000-000000000001') and not exists(select 1 from public.poll_text_entries) and not exists(select 1 from public.poll_tasks);
insert into res select 'mail z linkiem zaproszenia usunięty, inny zostaje', not exists(select 1 from public.mail_queue where to_email='c312@test.pl') and exists(select 1 from public.mail_queue where to_email='keep@test.pl');
insert into res select 'shared_devices gry usunięte', not exists(select 1 from public.shared_devices);

select name, case when ok then 'OK' else 'BŁĄD' end as wynik from res;
ROLLBACK;
