-- Migracja 455 (P2: B7, B8, N5): nazwa -> e-mail tylko dla service_role,
-- udostępnienia bez adresu odbiorcy, strona potwierdzenia bez stanu konta.
-- Lokalna baza wg docs/sql/local-db.md (schema.sql + migracja 455).
\set ON_ERROR_STOP 1
begin;
\set a '45500000-0000-4000-8000-00000000000a'
\set b '45500000-0000-4000-8000-00000000000b'
\set c '45500000-0000-4000-8000-00000000000c'
\set base '45500000-0000-4000-8000-0000000000ba'
insert into auth.users(id,email,email_confirmed_at) values
  (:'a','a455@example.com',now()),(:'b','b455@example.com',now()),(:'c','c455@example.com',now());
insert into public.profiles(id,username,email) values (:'a','wlasciciel455','a455@example.com'),(:'b','odbiorca455','b455@example.com'),(:'c','znajomy455','c455@example.com')
  on conflict (id) do update set username=excluded.username, email=excluded.email;
insert into public.question_bases(id,owner_id,name) values (:'base',:'a','Baza 455');
insert into public.friendships(requester_id,addressee_id,status) values (:'a',:'c','active');
insert into public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) values
  ('base:share','pair',3600,true),('friend:invite','pair',3600,true),('friend:resend','pair',3600,true),
  ('base:share_after_reject','pair',3600,true),('friend:invite_after_reject','pair',3600,true) on conflict do nothing;
insert into public.email_intents(email,intent,status,cooldown_until) values
  ('x455@example.com','signup','pending',now()),('y455@example.com','signup','expired',now()),('z455@example.com','signup','confirmed',now());

-- Prawa: przeglądarka (anon/authenticated) nie zamienia nazwy na e-mail.
do $$ declare f text; begin
  foreach f in array array['public.profile_login_to_email(text)','public.email_get_status(text)','public.email_resend_prepare(text,text)',
    'public.get_unsub_info_for_task_emails(uuid,text[])','public._base_share_create(uuid,uuid,base_share_role,boolean,text)',
    'public._mail_original361_friends_invite(text)','public._control_share_recipient_lookup(uuid,text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception '455: % nadal wykonywalna z przeglądarki', f; end if;
    if not has_function_privilege('service_role', f, 'execute') then raise exception '455: % bez service_role', f; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.base_share_by_user(uuid,text,base_share_role)', 'execute') then
    raise exception '455: base_share_by_user niedostępna'; end if;
  if public.profile_login_to_email('Odbiorca455') <> 'b455@example.com' then raise exception '455: profile_login_to_email (service)'; end if;
  if public.get_email_intent_status('X455@example.com') is not null then raise exception '455: pending widoczny'; end if;
  if public.get_email_intent_status('z455@example.com') is not null then raise exception '455: confirmed widoczny'; end if;
  if public.get_email_intent_status('y455@example.com') is distinct from 'expired' then raise exception '455: expired niewidoczny'; end if;
end $$;

grant usage on schema auth to authenticated;
grant select on all tables in schema public to authenticated;
select set_config('request.jwt.claim.sub', :'a', true);
set local role authenticated;
do $$ declare r record; p jsonb; j jsonb; begin
  -- Udostępnienie po nazwie: sukces bez adresu e-mail odbiorcy.
  select * into r from public.base_share_by_user('45500000-0000-4000-8000-0000000000ba', 'Odbiorca455', 'viewer');
  if not r.ok then raise exception '455: base_share_by_user % ', r.err; end if;
  if r.mail_to is not null then raise exception '455: mail_to zwrócony (%)', r.mail_to; end if;
  if r.mail_link is null or r.mail_link !~ '^/go/[?]b=' then raise exception '455: brak linku (mail włączony): %', r.mail_link; end if;
  -- Znajomy: przez tę samą funkcję, adres w panelu widoczny tylko dla znajomego.
  select * into r from public.base_share_to_friend('45500000-0000-4000-8000-0000000000ba', '45500000-0000-4000-8000-00000000000c', 'editor');
  if not r.ok or r.mail_to is not null then raise exception '455: base_share_to_friend % %', r.err, r.mail_to; end if;
  p := public.base_share_panel('45500000-0000-4000-8000-0000000000ba');
  if p::text like '%b455@example.com%' then raise exception '455: panel ujawnia adres odbiorcy po nazwie: %', p; end if;
  if not p::text like '%c455@example.com%' then raise exception '455: panel ukrywa adres znajomego: %', p; end if;
  select x into j from jsonb_array_elements(p->'outgoing') x where x->>'recipient_user_id'='45500000-0000-4000-8000-00000000000b';
  if j->>'label' <> 'odbiorca455' or j ? 'email' and j->>'email' is not null then raise exception '455: wiersz odbiorcy %', j; end if;
  -- Ponowne wysłanie: bez adresu.
  j := public.base_share_resend((select id from public.base_share_tasks where recipient_user_id='45500000-0000-4000-8000-00000000000b'));
  if j ? 'mail_to' then raise exception '455: base_share_resend zwraca mail_to: %', j; end if;
  -- Zaproszenie do znajomych po nazwie: bez adresu.
  j := public.friends_invite('odbiorca455');
  if j ? 'to' then raise exception '455: friends_invite zwraca adres: %', j; end if;
  if (j->>'ok')::boolean is not true then raise exception '455: friends_invite %', j; end if;
  -- Bezpośrednie wywołanie funkcji wewnętrznej: odmowa.
  begin
    perform public._mail_original361_friends_invite('odbiorca455');
    raise exception '455: funkcja wewnętrzna wykonana';
  exception when insufficient_privilege then null; end;
  begin
    perform public.profile_login_to_email('odbiorca455');
    raise exception '455: profile_login_to_email wykonana';
  exception when insufficient_privilege then null; end;
  raise notice 'login-share-without-email-455: OK';
end $$;
rollback;
