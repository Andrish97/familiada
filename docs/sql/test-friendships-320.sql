-- Test lokalny migracji 320 (docs/sql/local-db.md): znajomi, zadania, plakietki.
-- Uruchomienie po załadowaniu schematu i migracji (z katalogu głównego repo,
-- bo skrypt dołącza migrację ponownie, żeby sprawdzić kopię i idempotencję):
--   psql -h /var/tmp/pgfam -p 5499 -U postgres -d fam -v ON_ERROR_STOP=1 -f docs/sql/test-friendships-320.sql
-- Skrypt sam sprząta (kasuje swoich użytkowników; friendships znikają kaskadą).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- Wstępne sprzątanie po przerwanym przebiegu
delete from public.mail_cooldowns where target_key like '%-3200-0000-%';
delete from public.shared_devices where owner_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.base_share_tasks where owner_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.poll_tasks where owner_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.poll_subscriptions where owner_id in ('aaaaaaaa-3200-0000-0000-000000000001','ffffffff-3200-0000-0000-000000000006','99999999-3200-0000-0000-000000000007','dddddddd-3200-0000-0000-000000000004');
delete from public.site_activity where user_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.site_activity_hours where user_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.games where id='a1a1a1a1-3200-0000-0000-000000000001';
delete from public.question_bases where id='b1b1b1b1-3200-0000-0000-000000000001';
delete from public.profiles where id::text like '%-3200-0000-%';
delete from auth.users where id::text like '%-3200-0000-%';

create temp table res(name text, ok boolean);
create temp table r(k text, v jsonb);
grant all on res to public;
grant all on r to public;

-- Użytkownicy: A,B,C,D,E,F,G,H + para kont testowych T1,T2 (e2e cleanup)
insert into auth.users(id,email) values
 ('aaaaaaaa-3200-0000-0000-000000000001','a320@test.pl'),
 ('bbbbbbbb-3200-0000-0000-000000000002','b320@test.pl'),
 ('cccccccc-3200-0000-0000-000000000003','c320@test.pl'),
 ('dddddddd-3200-0000-0000-000000000004','d320@test.pl'),
 ('eeeeeeee-3200-0000-0000-000000000005','e320@test.pl'),
 ('ffffffff-3200-0000-0000-000000000006','f320@test.pl'),
 ('99999999-3200-0000-0000-000000000007','g320@test.pl'),
 ('88888888-3200-0000-0000-000000000008','h320@test.pl'),
 ('77777777-3200-0000-0000-000000000009','test1@familiada.online'),
 ('66666666-3200-0000-0000-000000000010','test2@familiada.online');
insert into public.profiles(id,email,username) values
 ('aaaaaaaa-3200-0000-0000-000000000001','a320@test.pl','a320'),
 ('bbbbbbbb-3200-0000-0000-000000000002','b320@test.pl','b320'),
 ('cccccccc-3200-0000-0000-000000000003','c320@test.pl','c320'),
 ('dddddddd-3200-0000-0000-000000000004','d320@test.pl','d320'),
 ('eeeeeeee-3200-0000-0000-000000000005','e320@test.pl','e320'),
 ('ffffffff-3200-0000-0000-000000000006','f320@test.pl','f320'),
 ('99999999-3200-0000-0000-000000000007','g320@test.pl','g320'),
 ('88888888-3200-0000-0000-000000000008','h320@test.pl','h320'),
 ('77777777-3200-0000-0000-000000000009','test1@familiada.online','tst320x'),
 ('66666666-3200-0000-0000-000000000010','test2@familiada.online','tst320y')
on conflict (id) do update set email=excluded.email, username=excluded.username;

-- Dane zasobów (jako postgres): gra A, baza A
insert into public.games(id,owner_id,name,type,status) values
 ('a1a1a1a1-3200-0000-0000-000000000001','aaaaaaaa-3200-0000-0000-000000000001','Gra A 320','poll_text','poll_open');
insert into public.question_bases(id,owner_id,name) values
 ('b1b1b1b1-3200-0000-0000-000000000001','aaaaaaaa-3200-0000-0000-000000000001','Baza A 320');

-- ===== 1. zaproś -> przyjmij -> lista =====
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-3200-0000-0000-000000000001',false);
insert into r select 'inv_ab', public.friends_invite('b320');
insert into r select 'inv_ab_again', public.friends_invite('B320@test.pl');
insert into r select 'inv_self', public.friends_invite('a320');
insert into r select 'inv_unknown', public.friends_invite('nikt320');
insert into r select 'inv_unknown_mail', public.friends_invite('nikt320@x.pl');
insert into res select 'zaproszenie ok + mail_allowed + token + to',
  (v->>'ok')::bool and (v->>'mail_allowed')::bool and v->>'token' is not null and v->>'to'='b320@test.pl' and not (v->>'accepted')::bool
  from r where k='inv_ab';
insert into res select 'ponowne zaproszenie -> already', v->>'err'='already' from r where k='inv_ab_again';
insert into res select 'self', v->>'err'='self' from r where k='inv_self';
insert into res select 'unknown_user (nazwa) bez has_email_only', v->>'err'='unknown_user' and (v->>'has_email_only')::bool = false from r where k='inv_unknown';
insert into res select 'unknown_user (e-mail) has_email_only', v->>'err'='unknown_user' and (v->>'has_email_only')::bool from r where k='inv_unknown_mail';
insert into res select 'A: lista = 1 outgoing',
  (select count(*)=1 and min(direction)='outgoing' and min(label)='b320' and min(status)='pending' and min(email_send_count)=1 from public.friends_list());
insert into r select 'resend1', public.friends_resend((select id from public.friends_list() limit 1));
insert into res select 'friends_resend: pierwszy ok, link go?f=, to', (v->>'ok')::bool and v->>'link' like 'go?f=%' and v->>'to'='b320@test.pl' from r where k='resend1';
insert into res select 'friends_resend: licznik maili = 2', (select email_send_count=2 from public.friends_list());
insert into r select 'resend2', public.friends_resend((select id from public.friends_list() limit 1));
insert into res select 'friends_resend: drugi -> cooldown', v->>'err'='cooldown' from r where k='resend2';

-- token_info: zalogowany adresat, obcy i anon
reset role; select set_config('request.jwt.claim.sub','',false);
create temp table tk as select token from public.friendships where requester_id='aaaaaaaa-3200-0000-0000-000000000001' and addressee_id='bbbbbbbb-3200-0000-0000-000000000002';
grant all on tk to public;
set role anon;
insert into r select 'tok_anon', public.friends_token_info((select token from tk));
reset role;
insert into res select 'token_info anon: etykieta + addressee_matches_me=false',
  (v->>'ok')::bool and v->>'status'='pending' and v->>'requester_label'='a320' and not (v->>'addressee_matches_me')::bool from r where k='tok_anon';
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-3200-0000-0000-000000000002',false);
insert into r select 'tok_b', public.friends_token_info((select token from public.friendships where addressee_id='bbbbbbbb-3200-0000-0000-000000000002' limit 1));
insert into res select 'token_info adresat: addressee_matches_me', (v->>'addressee_matches_me')::bool from r where k='tok_b';
insert into res select 'token_info nieznany token', public.friends_token_info(gen_random_uuid())->>'err'='not_found';

-- B: widzi incoming, plakietka, akceptuje
insert into res select 'B: lista = incoming od a320', (select count(*)=1 and min(direction)='incoming' and min(label)='a320' from public.friends_list());
insert into res select 'B: badges friends_pending=1', (public.badges_get()->>'friends_pending')::int = 1;
insert into res select 'B nie może cofnąć (cancel) cudzego zaproszenia', public.friends_cancel((select id from public.friends_list() limit 1))->>'err'='not_found';
insert into r select 'acc_b', public.friends_accept((select id from public.friends_list() limit 1));
insert into res select 'B accept ok', (v->>'ok')::bool from r where k='acc_b';
insert into res select 'B: lista = friend', (select count(*)=1 and min(direction)='friend' and min(accepted_at) is not null from public.friends_list());
insert into res select 'B: badges friends_pending=0', (public.badges_get()->>'friends_pending')::int = 0;
reset role;
insert into res select 'are_friends(A,B) oba kierunki', public.are_friends('aaaaaaaa-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002') and public.are_friends('bbbbbbbb-3200-0000-0000-000000000002','aaaaaaaa-3200-0000-0000-000000000001');
insert into res select 'are_friends(A,C) = false', not public.are_friends('aaaaaaaa-3200-0000-0000-000000000001','cccccccc-3200-0000-0000-000000000003');

-- ===== 2. zadania i plakietki dla B =====
insert into public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status,created_at) values
 ('aaaaaaaa-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002','a1a1a1a1-3200-0000-0000-000000000001','poll_text','k320a','pending',now()-interval '1 hour');
insert into public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status,done_at) values
 ('aaaaaaaa-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002','a1a1a1a1-3200-0000-0000-000000000001','poll_text','k320b','done',now()-interval '1 day'),
 ('aaaaaaaa-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002','a1a1a1a1-3200-0000-0000-000000000001','poll_text','k320c','done',now()-interval '10 days');
insert into public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status,cancelled_at) values
 ('aaaaaaaa-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002','a1a1a1a1-3200-0000-0000-000000000001','poll_text','k320d','cancelled',now());
insert into public.base_share_tasks(owner_id,base_id,recipient_user_id,role,status) values
 ('aaaaaaaa-3200-0000-0000-000000000001','b1b1b1b1-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002','viewer','pending');
insert into public.shared_devices(owner_id,recipient_id,device_type,game_id,game_name) values
 ('aaaaaaaa-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002','host','a1a1a1a1-3200-0000-0000-000000000001','Gra A 320');
insert into public.shared_devices(owner_id,recipient_id,device_type,game_id,game_name,expires_at) values
 ('aaaaaaaa-3200-0000-0000-000000000001','bbbbbbbb-3200-0000-0000-000000000002','buzzer','a1a1a1a1-3200-0000-0000-000000000001','Wygasłe',now()-interval '1 hour');
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-3200-0000-0000-000000000002',false);
insert into res select 'tasks_list: poll todo=1, done=1 (10-dniowe i anulowane pominięte)',
  (select count(*) filter (where state='todo')=1 and count(*) filter (where state='done')=1 and count(*)=2 from public.tasks_list('poll'));
insert into res select 'tasks_list: poll ma tytuł, od kogo, token, poll_type, game_id',
  (select bool_and(title='Gra A 320' and owner_label='a320' and token is not null and poll_type='poll_text' and game_id is not null and kind='poll') from public.tasks_list('poll'));
insert into res select 'tasks_list: base todo z rolą i tytułem',
  (select count(*)=1 and min(state)='todo' and min(role)='viewer' and min(title)='Baza A 320' and min(owner_label)='a320' from public.tasks_list('base'));
insert into res select 'tasks_list: device todo, wygasłe pominięte',
  (select count(*)=1 and min(state)='todo' and min(device_type)='host' and min(game_id::text) is not null from public.tasks_list('device'));
insert into res select 'tasks_list: bez filtra = 4 wiersze', (select count(*)=4 from public.tasks_list());
insert into res select 'badges_get: tasks_pending = ankieta + baza (bez urządzeń) = 2',
  (public.badges_get()->>'tasks_pending')::int = 2;
-- obcy nie widzi zadań B
select set_config('request.jwt.claim.sub','eeeeeeee-3200-0000-0000-000000000005',false);
insert into res select 'E: tasks_list pusta, badges 0/0', (select count(*)=0 from public.tasks_list()) and public.badges_get() = '{"tasks_pending":0,"friends_pending":0}'::jsonb;

-- ===== 3. RLS: obcy nie widzi wiersza =====
insert into res select 'RLS: obcy (E) nie widzi żadnego wiersza friendships', (select count(*)=0 from public.friendships);
do $$ begin
  begin
    insert into public.friendships(requester_id,addressee_id) values ('eeeeeeee-3200-0000-0000-000000000005','cccccccc-3200-0000-0000-000000000003');
    insert into res values ('RLS: bezpośredni INSERT zablokowany', false);
  exception when insufficient_privilege then
    insert into res values ('RLS: bezpośredni INSERT zablokowany', true);
  end;
end $$;
select set_config('request.jwt.claim.sub','aaaaaaaa-3200-0000-0000-000000000001',false);
insert into res select 'RLS: A widzi swój wiersz', (select count(*)=1 from public.friendships);
select set_config('request.jwt.claim.sub','bbbbbbbb-3200-0000-0000-000000000002',false);
insert into res select 'RLS: B (adresat) widzi swój wiersz', (select count(*)=1 from public.friendships);
do $$ begin
  begin
    update public.friendships set status='pending';
    insert into res values ('RLS: bezpośredni UPDATE zablokowany', false);
  exception when insufficient_privilege then
    insert into res values ('RLS: bezpośredni UPDATE zablokowany', true);
  end;
end $$;

-- ===== 4. usuń znajomego (remove): oczekujące zadania znikają, przyjęte udostępnienia zostają =====
insert into r select 'remove_b', public.friends_remove((select id from public.friends_list() limit 1));
reset role;
insert into res select 'remove ok, friendships puste dla pary', (select v->>'ok'='true' from r where k='remove_b') and (select count(*)=0 from public.friendships where addressee_id='bbbbbbbb-3200-0000-0000-000000000002');
insert into res select 'remove: oczekujące poll_tasks/base_share_tasks usunięte, zrobione zostają',
  (select count(*)=3 from public.poll_tasks where recipient_user_id='bbbbbbbb-3200-0000-0000-000000000002' and status in ('done','cancelled'))
  and (select count(*)=0 from public.poll_tasks where recipient_user_id='bbbbbbbb-3200-0000-0000-000000000002' and status in ('pending','opened'))
  and (select count(*)=0 from public.base_share_tasks where recipient_user_id='bbbbbbbb-3200-0000-0000-000000000002');
insert into res select 'remove: shared_devices zostaje', (select count(*)=2 from public.shared_devices where recipient_id='bbbbbbbb-3200-0000-0000-000000000002');
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-3200-0000-0000-000000000001',false);
insert into r select 'reinv_ab', public.friends_invite('b320');
insert into res select 'ponowne zaproszenie po usunięciu -> cooldown (friend:invite 5 dni)', v->>'err'='cooldown' and v->>'reason'='invite' and v->>'cooldown_until' is not null from r where k='reinv_ab';

-- ===== 5. odrzuć -> blokada 30 dni =====
reset role;
insert into public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status) values
 ('aaaaaaaa-3200-0000-0000-000000000001','cccccccc-3200-0000-0000-000000000003','a1a1a1a1-3200-0000-0000-000000000001','poll_text','k320e','pending');
insert into public.base_share_tasks(owner_id,base_id,recipient_user_id,role,status) values
 ('aaaaaaaa-3200-0000-0000-000000000001','b1b1b1b1-3200-0000-0000-000000000001','cccccccc-3200-0000-0000-000000000003','viewer','opened');
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-3200-0000-0000-000000000001',false);
insert into r select 'inv_ac', public.friends_invite('c320@test.pl');
select set_config('request.jwt.claim.sub','cccccccc-3200-0000-0000-000000000003',false);
insert into r select 'rej_c', public.friends_reject((select id from public.friends_list() limit 1));
insert into res select 'reject ok i wiersz usunięty', (select v->>'ok'='true' from r where k='rej_c') and (select count(*)=0 from public.friends_list());
select set_config('request.jwt.claim.sub','aaaaaaaa-3200-0000-0000-000000000001',false);
insert into r select 'reinv_ac', public.friends_invite('c320');
insert into res select 'po odrzuceniu: cooldown reason=after_reject', v->>'err'='cooldown' and v->>'reason'='after_reject' from r where k='reinv_ac';
reset role;
insert into res select 'reject: oczekujące zadania A->C usunięte', (select count(*)=0 from public.poll_tasks where recipient_user_id='cccccccc-3200-0000-0000-000000000003') and (select count(*)=0 from public.base_share_tasks where recipient_user_id='cccccccc-3200-0000-0000-000000000003');
insert into res select 'reject: rezerwacja friend:invite_after_reject ~30 dni',
  (select next_allowed_at > now()+interval '29 days' from public.mail_cooldowns where action_key='friend:invite_after_reject' and target_key='pair:aaaaaaaa-3200-0000-0000-000000000001:cccccccc-3200-0000-0000-000000000003');
-- odrzucający może zaprosić zapraszającego (blokada jednokierunkowa)
set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-3200-0000-0000-000000000003',false);
insert into r select 'inv_ca', public.friends_invite('a320');
insert into res select 'C może zaprosić A mimo blokady A->C', (v->>'ok')::bool from r where k='inv_ca';
-- cancel przez zapraszającego
insert into r select 'cancel_ca', public.friends_cancel((select id from public.friends_list() limit 1));
insert into res select 'cancel ok', (v->>'ok')::bool from r where k='cancel_ca';

-- ===== 6. zaproszenie krzyżowe -> od razu aktywne =====
select set_config('request.jwt.claim.sub','dddddddd-3200-0000-0000-000000000004',false);
insert into r select 'inv_de', public.friends_invite('e320');
select set_config('request.jwt.claim.sub','eeeeeeee-3200-0000-0000-000000000005',false);
insert into r select 'inv_ed', public.friends_invite('d320');
insert into res select 'krzyżowe: accepted=true, status active, mail_allowed=false',
  (v->>'ok')::bool and (v->>'accepted')::bool and v->>'status'='active' and not (v->>'mail_allowed')::bool from r where k='inv_ed';
insert into res select 'krzyżowe: lista E = friend; jeden wiersz na parę',
  (select count(*)=1 and min(direction)='friend' from public.friends_list());
reset role;
insert into res select 'krzyżowe: w tabeli 1 wiersz pary', (select count(*)=1 from public.friendships where least(requester_id,addressee_id)='dddddddd-3200-0000-0000-000000000004' and greatest(requester_id,addressee_id)='eeeeeeee-3200-0000-0000-000000000005');
insert into res values ('unikalna para nieuporządkowana (odwrotny INSERT odrzucony)', false);
do $$ begin
  begin
    insert into public.friendships(requester_id,addressee_id) values ('eeeeeeee-3200-0000-0000-000000000005','dddddddd-3200-0000-0000-000000000004');
    update res set ok=false where name like 'unikalna para%';
  exception when unique_violation then
    update res set ok=true where name like 'unikalna para%';
  end;
  begin
    insert into public.friendships(requester_id,addressee_id) values ('eeeeeeee-3200-0000-0000-000000000005','eeeeeeee-3200-0000-0000-000000000005');
    insert into res values ('CHECK różnych osób', false);
  exception when check_violation then
    insert into res values ('CHECK różnych osób', true);
  end;
end $$;

-- ===== 7. kopia z subskrypcji (jednorazowa, idempotentna) =====
-- F subskrybuje A aktywnie i A subskrybuje F aktywnie? Para A-F: A->F aktywna, F->A oczekująca (wygrywa aktywna).
-- G -> F oczekująca; subskrypcja po samym e-mailu (bez konta) nie jest kopiowana; anulowana nie jest kopiowana.
insert into public.poll_subscriptions(owner_id,subscriber_user_id,status,accepted_at,email_sent_at,email_send_count) values
 ('ffffffff-3200-0000-0000-000000000006','aaaaaaaa-3200-0000-0000-000000000001','pending',null,now(),1);
insert into public.poll_subscriptions(owner_id,subscriber_user_id,status,accepted_at,email_sent_at,email_send_count) values
 ('aaaaaaaa-3200-0000-0000-000000000001','ffffffff-3200-0000-0000-000000000006','active',now()-interval '3 days',now()-interval '4 days',2);
insert into public.poll_subscriptions(owner_id,subscriber_user_id,status,email_sent_at,email_send_count) values
 ('99999999-3200-0000-0000-000000000007','ffffffff-3200-0000-0000-000000000006','pending',now(),1);
insert into public.poll_subscriptions(owner_id,subscriber_email,status) values
 ('aaaaaaaa-3200-0000-0000-000000000001','ktos320@x.pl','active');
insert into public.poll_subscriptions(owner_id,subscriber_user_id,status,cancelled_at) values
 ('dddddddd-3200-0000-0000-000000000004','88888888-3200-0000-0000-000000000008','cancelled',now());
\i supabase/migrations/2026-10-10_320_friendships.sql
create temp table cnt1 as select count(*) n from public.friendships;
\i supabase/migrations/2026-10-10_320_friendships.sql
insert into res select 'kopia idempotentna (druga migracja nie dodaje wierszy)', (select n from cnt1) = (select count(*) from public.friendships);
insert into res select 'kopia: para A-F = aktywna z tokenem i licznikiem z subskrypcji A->F',
  exists (select 1 from public.friendships f join public.poll_subscriptions s on s.token=f.token
          where f.requester_id='aaaaaaaa-3200-0000-0000-000000000001' and f.addressee_id='ffffffff-3200-0000-0000-000000000006'
            and f.status='active' and f.accepted_at is not null and f.email_send_count=2 and f.email_sent_at=s.email_sent_at)
  and (select count(*)=1 from public.friendships where least(requester_id,addressee_id)='aaaaaaaa-3200-0000-0000-000000000001' and greatest(requester_id,addressee_id)='ffffffff-3200-0000-0000-000000000006');
insert into res select 'kopia: G->F oczekująca z tokenem subskrypcji',
  exists (select 1 from public.friendships f join public.poll_subscriptions s on s.token=f.token
          where f.requester_id='99999999-3200-0000-0000-000000000007' and f.addressee_id='ffffffff-3200-0000-0000-000000000006' and f.status='pending');
insert into res select 'kopia: bez e-mail-only i bez anulowanych',
  (select count(*)=0 from public.friendships where addressee_id='88888888-3200-0000-0000-000000000008')
  and (select count(*)=0 from public.friendships f where f.requester_id='aaaaaaaa-3200-0000-0000-000000000001' and f.addressee_id is null);
insert into res select 'kopia: stare subskrypcje zostają', (select count(*)=5 from public.poll_subscriptions where owner_id in ('aaaaaaaa-3200-0000-0000-000000000001','ffffffff-3200-0000-0000-000000000006','99999999-3200-0000-0000-000000000007','dddddddd-3200-0000-0000-000000000004'));

-- ===== 8. friend_invites_from_subscriptions (po e-mailu, bez maila, z blokadą) =====
-- H zakłada konto na e-mail h320@test.pl; A i G mają subskrypcje po e-mailu. Blokada po odrzuceniu G->H.
insert into public.poll_subscriptions(owner_id,subscriber_email,status) values
 ('aaaaaaaa-3200-0000-0000-000000000001','h320@test.pl','active'),
 ('99999999-3200-0000-0000-000000000007','H320@test.pl','pending');
insert into public.mail_cooldowns(action_key,target_key,next_allowed_at) values
 ('friend:invite_after_reject','pair:99999999-3200-0000-0000-000000000007:88888888-3200-0000-0000-000000000008',now()+interval '10 days');
set role authenticated;
select set_config('request.jwt.claim.sub','88888888-3200-0000-0000-000000000008',false);
insert into r select 'fis1', public.friend_invites_from_subscriptions();
insert into r select 'fis2', public.friend_invites_from_subscriptions();
insert into res select 'friend_invites_from_subscriptions: 1 utworzone (A), G zablokowany, powtórka 0',
  (select v->>'created'='1' from r where k='fis1') and (select v->>'created'='0' from r where k='fis2');
insert into res select 'H: incoming od a320 bez maila (email_send_count=0)',
  (select count(*)=1 and min(label)='a320' and min(direction)='incoming' and min(email_send_count)=0 from public.friends_list());
insert into res select 'H: badges friends_pending=1', (public.badges_get()->>'friends_pending')::int=1;
-- poll_claim_email_records NIE podpięta: subskrypcje po e-mailu poll_claim wciąż przepina (zachowanie bez zmian) — tasks_list woła claim
insert into res select 'tasks_list jako H nie psuje się (wywołuje claim)', (select count(*)>=0 from public.tasks_list());

-- ===== 9. e2e_friendships_cleanup =====
select set_config('request.jwt.claim.sub','77777777-3200-0000-0000-000000000009',false);
insert into r select 'inv_t', public.friends_invite('tst320y');
insert into r select 'clean_ab', public.e2e_friendships_cleanup('66666666-3200-0000-0000-000000000010');
insert into res select 'e2e cleanup: kasuje parę i friend:* dla pary',
  (select v->>'ok'='true' and (v->>'deleted')::int=1 and (v->>'mail_cooldowns_deleted')::int>=1 from r where k='clean_ab')
  and (select count(*)=0 from public.friends_list());
select set_config('request.jwt.claim.sub','aaaaaaaa-3200-0000-0000-000000000001',false);
insert into r select 'clean_bad', public.e2e_friendships_cleanup('bbbbbbbb-3200-0000-0000-000000000002');
insert into res select 'e2e cleanup: odmowa dla kont nietestowych', v->>'error'='test accounts required' from r where k='clean_bad';
reset role;

-- ===== 10. site_activity_ping przyjmuje nowe strony =====
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-3200-0000-0000-000000000001',false);
select public.site_activity_ping(gen_random_uuid(),'friends');
select public.site_activity_ping(gen_random_uuid(),'subscribers');
select public.site_activity_ping(gen_random_uuid(),'tasks');
do $$ begin
  begin
    perform public.site_activity_ping(gen_random_uuid(),'nie-ma-takiej');
    insert into res values ('site_activity_ping: zła strona odrzucona', false);
  exception when others then
    insert into res values ('site_activity_ping: zła strona odrzucona', sqlerrm='invalid_page');
  end;
end $$;
insert into res select 'site_activity_ping: friends/subscribers/tasks przyjęte', true;
reset role;

-- ===== wynik =====
\o
\set QUIET off
select case when ok then 'OK  ' else 'FAIL' end as wynik, name from res order by ok, name;
select count(*) filter (where not ok) as nieudane, count(*) as razem from res;

-- Sprzątanie (friendships i reszta zależna z kaskadą po profiles)
delete from public.mail_cooldowns where target_key like '%-3200-0000-%';
delete from public.shared_devices where owner_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.base_share_tasks where owner_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.poll_tasks where owner_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.poll_subscriptions where owner_id in ('aaaaaaaa-3200-0000-0000-000000000001','ffffffff-3200-0000-0000-000000000006','99999999-3200-0000-0000-000000000007','dddddddd-3200-0000-0000-000000000004');
delete from public.site_activity where user_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.site_activity_hours where user_id='aaaaaaaa-3200-0000-0000-000000000001';
delete from public.games where id='a1a1a1a1-3200-0000-0000-000000000001';
delete from public.question_bases where id='b1b1b1b1-3200-0000-0000-000000000001';
delete from public.profiles where id::text like '%-3200-0000-%';
delete from auth.users where id::text like '%-3200-0000-%';
select count(*) as zostalo_friendships from public.friendships;
