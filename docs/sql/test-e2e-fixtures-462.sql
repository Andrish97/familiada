-- Test lokalny migracji 462 (E25: fikstury e2e przyjmują tożsamości e2e).
-- Po schemacie, 460–462: psql ... -v ON_ERROR_STOP=1 -f docs/sql/test-e2e-fixtures-462.sql
\set ON_ERROR_STOP on
BEGIN;
insert into auth.users(id,email) values
 ('46200000-0000-4000-8000-000000000001','e2e+standard11@familiada.online'),
 ('46200000-0000-4000-8000-000000000002','e2e+standard12@familiada.online'),
 ('46200000-0000-4000-8000-0000000000aa','obcy462@example.com');
insert into public.profiles(id,email,username) values
 ('46200000-0000-4000-8000-000000000001','e2e+standard11@familiada.online','e2e.standard11'),
 ('46200000-0000-4000-8000-000000000002','e2e+standard12@familiada.online','e2e.standard12'),
 ('46200000-0000-4000-8000-0000000000aa','obcy462@example.com','obcy462')
 on conflict (id) do update set email=excluded.email, username=excluded.username;
select public.e2e_identity_bind('e2e.standard11','46200000-0000-4000-8000-000000000001');
select public.e2e_identity_bind('e2e.standard12','46200000-0000-4000-8000-000000000002');
insert into public.email_unsub_tokens(email, suppressed_at) values ('e2e+noaccount04@familiada.online', now())
  on conflict do nothing;

grant usage on schema auth to authenticated;
select set_config('request.jwt.claim.sub','46200000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$ declare j jsonb; begin
  j := public.e2e_friendships_cleanup('46200000-0000-4000-8000-000000000002');
  if (j->>'ok')::boolean is not true then raise exception '462: friendships e2e %', j; end if;
  j := public.e2e_friendships_cleanup('46200000-0000-4000-8000-0000000000aa');
  if (j->>'ok')::boolean is not false then raise exception '462: friendships z obcym %', j; end if;
  j := public.e2e_poll_subscriptions_cleanup('46200000-0000-4000-8000-000000000002');
  if (j->>'ok')::boolean is not true then raise exception '462: poll subs %', j; end if;
  j := public.e2e_shared_devices_cleanup('46200000-0000-4000-8000-000000000002');
  if (j->>'ok')::boolean is not true then raise exception '462: shared devices %', j; end if;
  j := public.e2e_poll_mail_budget_cleanup('e2e+noaccount04@familiada.online');
  if (j->>'ok')::boolean is not true then raise exception '462: budget noaccount %', j; end if;
  j := public.e2e_poll_mail_budget_cleanup('obcy462@example.com');
  if (j->>'ok')::boolean is not false then raise exception '462: budget obcy %', j; end if;
  j := public.e2e_subscriber_email_cleanup('e2e+noaccount04@familiada.online');
  if (j->>'ok')::boolean is not true then raise exception '462: subscriber cleanup %', j; end if;
  j := public.e2e_registered_subscriber_fixture('46200000-0000-4000-8000-000000000002', false);
  if (j->>'ok')::boolean is not true then raise exception '462: registered fixture %', j; end if;
  j := public.e2e_registered_subscriber_fixture('46200000-0000-4000-8000-0000000000aa', false);
  if (j->>'ok')::boolean is not false then raise exception '462: fixture z obcym %', j; end if;
  j := public.e2e_subscriber_mail_flag('e2e+noaccount04@familiada.online', true);
  if (j->>'ok')::boolean is not true or j->>'previous_suppressed_at' is null then raise exception '462: mail flag %', j; end if;
  j := public.e2e_subscriber_mail_flag('e2e+standard12@familiada.online', true);
  if (j->>'ok')::boolean is not false then raise exception '462: mail flag tylko noaccount %', j; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.poll_subscriptions where owner_id='46200000-0000-4000-8000-000000000001'
                 and subscriber_email='e2e+standard12@familiada.online') then raise exception '462: brak subskrypcji'; end if;
  if not public._e2e_account_email('E2E+standard11@familiada.online') or public._e2e_account_email('e2e+noaccount04@familiada.online')
     or not public._e2e_any_email('e2e+noaccount04@familiada.online') or public._e2e_any_email('obcy462@example.com')
    then raise exception '462: pomocnicze'; end if;
end $$;
select '462 OK' as result;
ROLLBACK;
