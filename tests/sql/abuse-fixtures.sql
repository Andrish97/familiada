-- Wspólne dane sond nadużyć (abuse-probes.sql, cross-user-fuzz.sql): konta
-- A (ofiara), B (napastnik), C (znajomy A), G (gość) i zasoby A z tajnym
-- znacznikiem SEKRET_A. Wczytywane wewnątrz transakcji testu (\ir).

-- Konta: A (ofiara), B (napastnik), G (gość), C (znajomy A).
insert into auth.users(id, email, email_confirmed_at, is_anonymous) values
  ('a0000000-0000-4000-8000-00000000000a', 'probe-a@probe.test', now(), false),
  ('b0000000-0000-4000-8000-00000000000b', 'probe-b@probe.test', now(), false),
  ('c0000000-0000-4000-8000-00000000000c', 'probe-c@probe.test', now(), false),
  ('90000000-0000-4000-8000-000000000009', null, null, true);
insert into public.profiles(id, email, username, is_guest, guest_expires_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'probe-a@probe.test', 'probe_a', false, null),
  ('b0000000-0000-4000-8000-00000000000b', 'probe-b@probe.test', 'probe_b', false, null),
  ('c0000000-0000-4000-8000-00000000000c', 'probe-c@probe.test', 'probe_c', false, null),
  ('90000000-0000-4000-8000-000000000009', null, 'guest_probe', true, now() + interval '5 days');

-- Polityki odliczań maili (dane spoza schema.sql).
insert into public.mail_cooldown_policies(action_key, scope, cooldown_seconds, enforce) values
  ('auth:guest_upgrade_email', 'pair', 3600, true), ('auth:reset_password', 'pair', 3600, true)
on conflict (action_key) do nothing;

-- Gry A: przygotowana (gotowa), ankieta tekstowa w trakcie, szkic ankiety,
-- kopia ze Społeczności. Pytania i odpowiedzi z tajnym znacznikiem.
insert into public.games(id, owner_id, name, type, status) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'SEKRET_A gra', 'prepared', 'draft'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'SEKRET_A ankieta', 'poll_text', 'draft'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a', 'SEKRET_A szkic', 'poll_text', 'draft');
insert into public.questions(id, game_id, ord, text)
select ('a2000000-0000-4000-8000-' || lpad((g * 100 + n)::text, 12, '0'))::uuid,
       ('a1000000-0000-4000-8000-00000000000' || g)::uuid, n, 'SEKRET_A pytanie ' || n
from generate_series(1, 3) g, generate_series(1, 10) n;
insert into public.answers(question_id, ord, text, fixed_points)
select q.id, a, 'odp' || a, 10 from public.questions q, generate_series(1, 3) a
where q.game_id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');
update public.games set status = 'poll_open', share_key_poll = 'probekeyA' where id = 'a1000000-0000-4000-8000-000000000002';
-- Szkic B (do przenoszenia wierszy).
insert into public.games(id, owner_id, name, type, status) values
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000a', 'A szkic 2', 'prepared', 'draft');
insert into public.questions(id, game_id, ord, text) values
  ('a2000000-0000-4000-8000-000000000999', 'a1000000-0000-4000-8000-000000000004', 1, 'pytanie szkicu');

-- Społeczność: opublikowana gra A, kopia u B.
insert into public.market_games(id, author_user_id, title, lang, payload, status) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'A rynek 1', 'pl', '{}', 'published'),
  ('a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'A rynek 2', 'pl', '{}', 'published'),
  ('a3000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a', 'A rynek oczekuje', 'pl', '{}', 'pending');
insert into public.games(id, owner_id, name, type, status, source_market_id) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'kopia rynku', 'market', 'ready', 'a3000000-0000-4000-8000-000000000001');

-- Baza pytań A (z tagiem), baza B (z tagiem), logo A.
insert into public.question_bases(id, owner_id, name) values
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'SEKRET_A baza'),
  ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'baza B');
insert into public.qb_questions(id, base_id, payload) values
  ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', '{"text":"SEKRET_A q","answers":[]}'),
  ('b5000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', '{"text":"q B","answers":[]}');
insert into public.qb_tags(id, base_id, name) values
  ('a6000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'tagA');
insert into public.user_logos(id, user_id, name, type, payload) values
  ('a7000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'SEKRET_A logo', 'GLYPH_30x10', '{}');

-- Relacje A: znajomy C, baza udostępniona C, zadanie ankiety dla C,
-- subskrybent e-mail, sesja Control z blokadą edycji, kod urządzenia, motyw.
insert into public.friendships(id, requester_id, addressee_id, status, decision_user_id, accepted_at) values
  ('a8000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000c', 'active', 'c0000000-0000-4000-8000-00000000000c', now());
insert into public.question_base_shares(base_id, user_id, role) values
  ('a4000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c', 'editor');
insert into public.poll_tasks(id, owner_id, recipient_user_id, game_id, poll_type, share_key_poll, status, source_friendship_id, source_kind) values
  ('a9000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000c',
   'a1000000-0000-4000-8000-000000000002', 'poll_text', 'probekeyA', 'pending', 'a8000000-0000-4000-8000-000000000001', 'friend');
insert into public.poll_subscriptions(id, owner_id, subscriber_email, status) values
  ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'sub-a@probe.test', 'active');
insert into public.games(id, owner_id, name, type, status) values
  ('a1000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000a', 'SEKRET_A w Control', 'prepared', 'draft');
insert into public.control_runtime_sessions(id, game_id, owner_id, expires_at) values
  ('ab000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000a', now() + interval '1 hour');
insert into public.edit_locks(resource_type, resource_id, holder_tab_id, holder_user_id) values
  ('game', 'a1000000-0000-4000-8000-000000000004', 'tab-a', 'a0000000-0000-4000-8000-00000000000a');
insert into public.device_connect_codes(code, owner_id, game_id, game_name, device_type, share_key, expires_at) values
  ('424242', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002', 'SEKRET_A ankieta', 'poll_qr', 'probekeyA', now() + interval '1 hour');
insert into public.user_display_themes(id, owner_id, name, size_bytes) values
  ('ac000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'SEKRET_A motyw', 10);
