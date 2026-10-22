-- Migracja 457: Znajomi bez adresu drugiej strony przed przyjęciem znajomości;
-- zapraszający widzi tylko adres, który sam wpisał.
\set ON_ERROR_STOP 1
begin;
\set a '45700000-0000-4000-8000-00000000000a'
\set b '45700000-0000-4000-8000-00000000000b'
\set c '45700000-0000-4000-8000-00000000000c'
\set d '45700000-0000-4000-8000-00000000000d'
insert into auth.users(id,email,email_confirmed_at) values
  (:'a','a457@example.com',now()),(:'b','b457@example.com',now()),(:'c','c457@example.com',now()),(:'d','d457@example.com',now());
insert into public.profiles(id,username,email) values (:'a','ala457','a457@example.com'),(:'b','bob457','b457@example.com'),
  (:'c','cyryl457','c457@example.com'),(:'d','daria457','d457@example.com')
  on conflict (id) do update set username=excluded.username, email=excluded.email;
insert into public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) values
  ('friend:invite','pair',3600,true),('friend:invite_after_reject','pair',3600,true) on conflict do nothing;
insert into public.friendships(requester_id,addressee_id,decision_user_id,status) values (:'a',:'d',:'a','active');
grant usage on schema auth to authenticated;
grant select on all tables in schema public to authenticated;
select set_config('request.jwt.claim.sub', :'a', true);
set local role authenticated;
do $$ declare j jsonb; l text; begin
  j := public.friends_invite('bob457');            -- po nazwie
  if (j->>'ok')::boolean is not true then raise exception '457: invite nazwa %', j; end if;
  j := public.friends_invite('C457@example.com');  -- po adresie (wpisany przez A)
  if (j->>'ok')::boolean is not true then raise exception '457: invite e-mail %', j; end if;
  select string_agg(coalesce(f.email,'-')||'/'||coalesce(f.label,'-')||'/'||f.direction, ' ' order by f.label) into l from public.friends_list() f;
  if l not like '%-/bob457/outgoing%' then raise exception '457: lista A: %', l; end if;
  if l like '%b457@%' then raise exception '457: adres B widoczny przed przyjęciem: %', l; end if;
  if l not like '%c457@example.com/cyryl457/outgoing%' then raise exception '457: A nie widzi wpisanego adresu: %', l; end if;
  if l not like '%d457@example.com/daria457/friend%' then raise exception '457: znajomy bez adresu: %', l; end if;
  if (select count(*) from jsonb_array_elements(public.contacts_list('friends')) x where x->>'email' like 'b457%') > 0 then
    raise exception '457: contacts_list ujawnia adres'; end if;
  if (select (x->>'email_enabled')::boolean from jsonb_array_elements(public.contacts_list('friends')) x where x->>'label'='bob457') is not true then
    raise exception '457: email_enabled bez adresu'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', :'c', true);
set local role authenticated;
do $$ declare l text; begin
  select string_agg(coalesce(f.email,'-')||'/'||f.label||'/'||f.direction, ' ') into l from public.friends_list() f;
  if l is distinct from '-/ala457/incoming' then raise exception '457: lista odbiorcy C: %', l; end if;
  raise notice 'friends-hide-pending-email-457: OK';
end $$;
rollback;
