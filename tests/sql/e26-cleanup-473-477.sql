-- Migracje 473–477 (E26, sprzątanie bazy): dane starego formularza trafiają do
-- reports/messages, poprawione funkcje działają, usunięte obiekty znikają.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql sprzed 473):
--   psql ... -f tests/sql/e26-cleanup-473-477.sql
\set ON_ERROR_STOP 1
begin;

-- Dane sprzed migracji
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000026a1','owner26@example.test'),
 ('00000000-0000-4000-8000-0000000026b2','author26@example.test');
insert into public.profiles(id,username,email) values
 ('00000000-0000-4000-8000-0000000026a1','owner26','owner26@example.test'),
 ('00000000-0000-4000-8000-0000000026b2','author26','author26@example.test')
 on conflict (id) do nothing;
insert into public.games(id,owner_id,name) values
 ('00000000-0000-4000-8000-0000000026c1','00000000-0000-4000-8000-0000000026a1','G26');
-- stare zgłoszenie z odpowiedzią i wątkiem; drugie z numerem, który już jest w reports
insert into public.contact_reports(id,ticket_number,created_at,updated_at,email,subject,message,lang,status,user_id,reply_message,replied_at)
 values ('00000000-0000-4000-8000-0000000026d1','OLD-26-1','2026-03-12 10:00+00','2026-03-13 10:00+00',' Author26@example.test ','Temat A','Treść zgłoszenia A','pl','replied','00000000-0000-4000-8000-0000000026b2','Odpowiedź A','2026-03-13 09:00+00'),
        ('00000000-0000-4000-8000-0000000026d2','DUP-26','2026-03-14 10:00+00','2026-03-14 10:00+00','other26@example.test','Temat B','Treść zgłoszenia B','en','closed',null,null,null);
insert into public.contact_report_messages(report_id,direction,body,from_email,created_at) values
 ('00000000-0000-4000-8000-0000000026d1','inbound','Dopisek autora',null,'2026-03-13 12:00+00'),
 ('00000000-0000-4000-8000-0000000026d1','outbound','Druga odpowiedź','admin@familiada.online','2026-03-13 13:00+00');
insert into public.reports(id,ticket_number,status,subject,lang) values
 ('00000000-0000-4000-8000-0000000026e1','DUP-26','open','Nowe zgłoszenie','pl');
-- stare zapamiętane urządzenie
insert into public.shared_devices(owner_id,recipient_id,device_type,game_id,expires_at)
 values ('00000000-0000-4000-8000-0000000026a1','00000000-0000-4000-8000-0000000026b2','host','00000000-0000-4000-8000-0000000026c1',now()+interval '1 hour');
-- stan gry z jedną migawką
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000026a1',true);
select rev from public.game_state_write('00000000-0000-4000-8000-0000000026c1','devices_display','devices',p_lock_ms => 0);
select rev from public.game_state_write('00000000-0000-4000-8000-0000000026c1','devices_display','devices',p_lock_ms => 0);
do $$ begin
  if (select count(*) from public.game_state_history) <> 1 then raise exception 'przygotowanie: brak migawki przed 474'; end if;
end $$;

\ir ../../supabase/migrations/2026-10-23_473_e26_cleanup_dead_objects.sql
\ir ../../supabase/migrations/2026-10-23_474_e26_drop_game_state_history.sql
\ir ../../supabase/migrations/2026-10-23_475_e26_drop_e21_repair.sql
\ir ../../supabase/migrations/2026-10-23_476_e26_drop_shared_devices.sql
\ir ../../supabase/migrations/2026-10-23_477_e26_move_contact_reports.sql

-- Usunięte obiekty
do $$
declare n text;
begin
  foreach n in array array['game_gen_queue','game_state_history','e21_demo_templates_before','e21_repair_runs',
                           'shared_devices','contact_reports','contact_report_messages',
                           'questions_game_ord_uq','questions_game_idx','poll_votes_session_idx',
                           'games_keys_host_idx','mail_function_logs_request_idx','mail_function_logs_queue_idx'] loop
    if to_regclass('public.' || n) is not null then raise exception 'zostało: %', n; end if;
  end loop;
  foreach n in array array['rpc_example','poll_vote','get_poll_bundle','can_access_base','get_game_by_key',
                           'game_state_undo','e21_data_repair','fam_clip_words','submit_contact_report',
                           'cron_embed_missing_market_games','contact_reports_set_updated_at','touch_state_at'] loop
    if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = n) then
      raise exception 'została funkcja: %', n;
    end if;
  end loop;
  if exists (select 1 from pg_policies where tablename = 'games' and policyname = 'games_select_by_keys') then
    raise exception 'została polityka games_select_by_keys';
  end if;
  if exists (select 1 from pg_constraint where conname = 'questions_game_ord_unique') then
    raise exception 'został duplikat questions_game_ord_unique';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'questions_game_ord_uniq') then
    raise exception 'zniknął jedyny UNIQUE (game_id, ord)';
  end if;
  if to_regclass('public.mail_function_logs_recipient_created_idx') is null then
    raise exception 'brak indeksu pod zapytanie e2e';
  end if;
  if exists (select 1 from public.app_config where key in ('edge_url','edge_service_role_jwt')) then
    raise exception 'zostały klucze app_config starej ścieżki embeddingów';
  end if;
end $$;

-- B1: zapis stanu dalej działa i podbija rev
do $$
declare v bigint;
begin
  -- (wersja bez p_lock_ms jest nieosiągalna z nazwanymi argumentami frontu —
  -- persist.js zawsze podaje p_lock_ms; sprawdzana tylko kompilacja w 474)
  v := (public.game_state_write('00000000-0000-4000-8000-0000000026c1','devices_display','devices',p_expected_rev => 2, p_lock_ms => 0)).rev;
  if v <> 3 then raise exception 'game_state_write: rev % zamiast 3', v; end if;
  v := (public.game_state_write('00000000-0000-4000-8000-0000000026c1','devices_display','devices',p_expected_rev => 3, p_lock_ms => 0)).rev;
  if v <> 4 then raise exception 'game_state_write (lock): rev % zamiast 4', v; end if;
end $$;

-- B3: lista zadań i sprzątanie po grze działają bez shared_devices
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000026b2',true);
do $$ begin
  if exists (select 1 from public.tasks_list() where kind = 'device') then raise exception 'tasks_list: część device'; end if;
  if (public.e2e_shared_devices_cleanup('00000000-0000-4000-8000-0000000026a1')) ? 'deleted' then
    raise exception 'e2e_shared_devices_cleanup: stary klucz deleted';
  end if;
end $$;

-- B4: przeniesione zgłoszenia
do $$
declare r record; n integer;
begin
  select * into r from public.reports where id = '00000000-0000-4000-8000-0000000026d1';
  if r.ticket_number <> 'OLD-26-1' or r.status <> 'open' or r.subject <> 'Temat A' or r.created_at <> '2026-03-12 10:00+00' then
    raise exception 'zgłoszenie A: %', row_to_json(r);
  end if;
  select * into r from public.reports where id = '00000000-0000-4000-8000-0000000026d2';
  if r.ticket_number = 'DUP-26' or r.status <> 'closed' or r.lang <> 'en' then raise exception 'zgłoszenie B (kolizja numeru): %', row_to_json(r); end if;
  if (select ticket_number from public.reports where id = '00000000-0000-4000-8000-0000000026e1') <> 'DUP-26' then
    raise exception 'istniejące zgłoszenie zmieniło numer';
  end if;
  select count(*) into n from public.messages where report_id = '00000000-0000-4000-8000-0000000026d1';
  if n <> 4 then raise exception 'zgłoszenie A: % wiadomości zamiast 4', n; end if;
  select * into r from public.messages where report_id = '00000000-0000-4000-8000-0000000026d1' order by created_at limit 1;
  if r.source <> 'form' or r.direction <> 'inbound' or r.from_email <> 'author26@example.test' or r.body <> 'Treść zgłoszenia A' or not r.is_read then
    raise exception 'pierwsza wiadomość A: %', row_to_json(r);
  end if;
  if not exists (select 1 from public.messages where report_id = '00000000-0000-4000-8000-0000000026d1' and source = 'compose'
                 and direction = 'outbound' and to_email = 'author26@example.test' and body = 'Odpowiedź A' and created_at = '2026-03-13 09:00+00') then
    raise exception 'brak odpowiedzi A';
  end if;
  if not exists (select 1 from public.messages where report_id = '00000000-0000-4000-8000-0000000026d1' and source = 'email'
                 and direction = 'inbound' and from_email = 'author26@example.test' and body = 'Dopisek autora') then
    raise exception 'brak dopisku z wątku';
  end if;
  if (select count(*) from public.messages where report_id = '00000000-0000-4000-8000-0000000026d2') <> 1 then
    raise exception 'zgłoszenie B: liczba wiadomości';
  end if;
  -- panel: lista zgłoszeń i skrzynka
  if not exists (select 1 from public.list_reports('all', 50, 0) where ticket_number = 'OLD-26-1') then
    raise exception 'list_reports nie widzi przeniesionego';
  end if;
  perform * from public.list_messages('inbox', 50, 0);
  perform * from public.list_messages('reports', 50, 0);
end $$;

-- B4 + decyzja 2026-10-07: usunięcie konta kasuje jego zgłoszenia całe
do $$ begin
  perform public._delete_user_data('00000000-0000-4000-8000-0000000026b2');
  if exists (select 1 from public.reports where id = '00000000-0000-4000-8000-0000000026d1') then
    raise exception 'zgłoszenie autora zostało po usunięciu konta';
  end if;
  if exists (select 1 from public.messages where report_id = '00000000-0000-4000-8000-0000000026d1') then
    raise exception 'wiadomości zgłoszenia zostały';
  end if;
  if not exists (select 1 from public.reports where id = '00000000-0000-4000-8000-0000000026d2') then
    raise exception 'usunięto cudze zgłoszenie';
  end if;
end $$;

-- sprzątanie po grze i wygaśnięcie sesji Control bez shared_devices
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000026a1',true);
select public.delete_resource_checked('game','00000000-0000-4000-8000-0000000026c1') is not null as usunieto_gre;
-- pozostałe poprawione funkcje wykonują się (plpgsql sprawdza nazwy dopiero przy wywołaniu)
select public.control_runtime_expire_one('00000000-0000-4000-8000-0000000026ff') as wygasla;
select public.control_game_cancel_for_settings('00000000-0000-4000-8000-0000000026ff') is not null as anulowano;
select public._e2e_reset_email('nobody26@example.test');

rollback;
\echo 'e26-cleanup-473-477: OK'
