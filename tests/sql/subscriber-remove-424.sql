-- Migracja 424: usunięcie subskrybenta zostawia propozycję znajomości, kasuje
-- czekające zadania; przyjęcie znajomości usuwa subskrypcję.
-- Lokalna baza wg docs/sql/local-db.md: psql ... -f tests/sql/subscriber-remove-424.sql
\set ON_ERROR_STOP 1
begin;
\ir ../../supabase/migrations/2026-10-20_424_subscriber_remove_keeps_friend_proposal.sql
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000004a1','owner424@example.test'),
 ('00000000-0000-4000-8000-0000000004b2','sub424@example.test');
insert into public.profiles(id,username,email) values
 ('00000000-0000-4000-8000-0000000004a1','owner424','owner424@example.test'),
 ('00000000-0000-4000-8000-0000000004b2','sub424','sub424@example.test')
 on conflict (id) do nothing;
insert into public.poll_subscriptions(id,owner_id,subscriber_email,status,accepted_at)
 values ('00000000-0000-4000-8000-0000000004c1','00000000-0000-4000-8000-0000000004a1','sub424@example.test','active',now());
-- propozycja znajomości powstała z subskrypcji (jak friend_invites_from_subscriptions)
insert into public.friendships(id,requester_id,addressee_id,status,source_subscription_id)
 values ('00000000-0000-4000-8000-0000000004d1','00000000-0000-4000-8000-0000000004a1','00000000-0000-4000-8000-0000000004b2','pending','00000000-0000-4000-8000-0000000004c1');

-- właściciel usuwa subskrybenta
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000004a1',true);
do $$
declare r jsonb; f record;
begin
  r := public.polls_hub_subscriber_remove('00000000-0000-4000-8000-0000000004c1');
  if r->>'ok' <> 'true' then raise exception 'remove: %', r; end if;
  select * into f from public.friendships where id='00000000-0000-4000-8000-0000000004d1';
  if f.status <> 'pending' or f.cancelled_at is not null then raise exception 'propozycja anulowana: % %', f.status, f.cancelled_at; end if;
  if f.source_subscription_id is not null then raise exception 'propozycja nadal przypięta do subskrypcji'; end if;
  if (select status from public.poll_subscriptions where id='00000000-0000-4000-8000-0000000004c1') <> 'cancelled' then raise exception 'subskrypcja nie anulowana'; end if;
end $$;

-- osoba nadal może przyjąć propozycję
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000004b2',true);
do $$
declare r jsonb;
begin
  r := public.friends_accept('00000000-0000-4000-8000-0000000004d1');
  if r->>'ok' <> 'true' then raise exception 'accept po usunięciu subskrybenta: %', r; end if;
  if (select status from public.friendships where id='00000000-0000-4000-8000-0000000004d1') <> 'active' then raise exception 'znajomość nieaktywna'; end if;
end $$;

-- przyjęcie znajomości usuwa aktywną subskrypcję pary (bez zmian, _friend_accept_cleanup)
insert into public.poll_subscriptions(id,owner_id,subscriber_email,status,accepted_at,registered_user_id)
 values ('00000000-0000-4000-8000-0000000004c2','00000000-0000-4000-8000-0000000004b2','owner424@example.test','active',now(),'00000000-0000-4000-8000-0000000004a1');
update public.friendships set status='pending',accepted_at=null where id='00000000-0000-4000-8000-0000000004d1';
do $$
declare r jsonb;
begin
  r := public.friends_accept('00000000-0000-4000-8000-0000000004d1');
  if r->>'ok' <> 'true' then raise exception 'accept: %', r; end if;
  if exists(select 1 from public.poll_subscriptions where id='00000000-0000-4000-8000-0000000004c2') then raise exception 'subskrypcja pary została po przyjęciu'; end if;
end $$;
select 'subscriber-remove-424: OK' as wynik;
rollback;
