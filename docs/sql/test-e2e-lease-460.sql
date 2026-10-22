-- Test lokalny migracji 460 (E25: tożsamości e2e, lease, czyszczenie, kwarantanna,
-- wykluczenia). docs/sql/local-db.md; po schemacie i migracji 460:
-- psql -h <dir> -p <port> -U postgres -d fam -v ON_ERROR_STOP=1 -f docs/sql/test-e2e-lease-460.sql
\set ON_ERROR_STOP on
BEGIN;

do $$ declare n int; begin
  select count(*) into n from public.e2e_identities where role='standard'; if n<>40 then raise exception '460: standard %', n; end if;
  select count(*) into n from public.e2e_identities where role='noaccount'; if n<>10 then raise exception '460: noaccount %', n; end if;
  select count(*) into n from public.e2e_identities where role='disposable'; if n<>6 then raise exception '460: disposable %', n; end if;
  select count(*) into n from public.e2e_identities where role='dedicated'; if n<>6 then raise exception '460: dedicated %', n; end if;
  select count(*) into n from public.e2e_identities where role='resource'; if n<>3 then raise exception '460: resource %', n; end if;
  if (select purpose from public.e2e_identities where name='e2e.dedicated01') is distinct from 'e20-gallery' then
    raise exception '460: dedicated01 bez e20-gallery'; end if;
end $$;

-- konta: standard01..03, dedicated01 (z danymi)
insert into auth.users(id,email,raw_app_meta_data) values
 ('46000000-0000-4000-8000-000000000001','e2e+standard01@familiada.online','{"e2e_role":"standard"}'),
 ('46000000-0000-4000-8000-000000000002','e2e+standard02@familiada.online','{}'),
 ('46000000-0000-4000-8000-000000000003','e2e+standard03@familiada.online','{}'),
 ('46000000-0000-4000-8000-0000000000d1','e2e+dedicated01@familiada.online','{}'),
 ('46000000-0000-4000-8000-0000000000aa','zwykly460@example.com','{}');
insert into public.profiles(id,email,username) values
 ('46000000-0000-4000-8000-000000000001','e2e+standard01@familiada.online','e2e.standard01'),
 ('46000000-0000-4000-8000-000000000002','e2e+standard02@familiada.online','e2e.standard02'),
 ('46000000-0000-4000-8000-000000000003','e2e+standard03@familiada.online','e2e.standard03'),
 ('46000000-0000-4000-8000-0000000000d1','e2e+dedicated01@familiada.online','e2e.dedicated01'),
 ('46000000-0000-4000-8000-0000000000aa','zwykly460@example.com','zwykly460')
 on conflict (id) do update set email=excluded.email, username=excluded.username;
select public.e2e_identity_bind('e2e.standard01','46000000-0000-4000-8000-000000000001');
select public.e2e_identity_bind('e2e.standard02','46000000-0000-4000-8000-000000000002');
select public.e2e_identity_bind('e2e.standard03','46000000-0000-4000-8000-000000000003');
select public.e2e_identity_bind('e2e.dedicated01','46000000-0000-4000-8000-0000000000d1');

-- dane do wyczyszczenia (także relacje z kontem spoza puli)
insert into public.games(id,owner_id,name) values
 ('46000000-0000-4000-8000-00000000a001','46000000-0000-4000-8000-000000000001','Gra 460 s1'),
 ('46000000-0000-4000-8000-00000000a002','46000000-0000-4000-8000-000000000002','Gra 460 s2'),
 ('46000000-0000-4000-8000-00000000a0d1','46000000-0000-4000-8000-0000000000d1','Gra 460 dedicated');
insert into public.friendships(requester_id,addressee_id,decision_user_id,status) values
 ('46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-0000000000aa','46000000-0000-4000-8000-000000000001','active');
insert into public.edit_locks(resource_type,resource_id,holder_tab_id,holder_user_id,holder_context) values
 ('game','46000000-0000-4000-8000-00000000a001','tab','46000000-0000-4000-8000-000000000001','editor'),
 ('game','46000000-0000-4000-8000-00000000a0d1','tab','46000000-0000-4000-8000-0000000000d1','editor');
insert into public.e2e_emails(recipient,subject) values
 ('e2e+standard01@familiada.online','s1'), ('e2e+noaccount01@familiada.online','n1'),
 ('e2e+dedicated01@familiada.online','d1'), ('e2e+disposable01.new@familiada.online','x');

do $$ declare j jsonb; k jsonb; n int; begin
  -- wypożyczenie kompletu: 2 standard (LRU = 01, 02 -- 03 też nieużywane, kolejność po nazwie)
  j := public.e2e_lease('runA','w0','{"standard":2,"noaccount":1,"resources":["mail"]}');
  if (j->>'ok')::boolean is not true then raise exception '460: lease A %', j; end if;
  if jsonb_array_length(j->'identities') <> 4 then raise exception '460: lease A count %', j; end if;
  if not exists (select 1 from jsonb_array_elements(j->'identities') x where x->>'name'='e2e.standard01')
    then raise exception '460: lease A bez standard01 %', j; end if;
  -- czyszczenie: dane konta i skrzynka znikają, relacja z obcym kontem też
  if exists (select 1 from public.games where owner_id in ('46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000002'))
    then raise exception '460: gry nie wyczyszczone'; end if;
  if exists (select 1 from public.friendships where requester_id='46000000-0000-4000-8000-000000000001')
    then raise exception '460: znajomi nie wyczyszczeni'; end if;
  if exists (select 1 from public.edit_locks where holder_user_id='46000000-0000-4000-8000-000000000001')
    then raise exception '460: blokada nie zdjęta'; end if;
  if exists (select 1 from public.e2e_emails where recipient in ('e2e+standard01@familiada.online','e2e+noaccount01@familiada.online'))
    then raise exception '460: skrzynka nie wyczyszczona'; end if;
  if not exists (select 1 from public.profiles where id='46000000-0000-4000-8000-000000000001')
    or not exists (select 1 from auth.users where id='46000000-0000-4000-8000-000000000001')
    then raise exception '460: konto usunięte zamiast wyczyszczone'; end if;
  if not exists (select 1 from public.profiles where id='46000000-0000-4000-8000-0000000000aa')
    then raise exception '460: obce konto naruszone'; end if;

  -- wyłączność: drugi przebieg nie dostaje tych samych kont; za dużo = busy (bez czyszczenia)
  k := public.e2e_lease('runB','w0','{"standard":39}');
  if k->>'error' <> 'busy' then raise exception '460: B 39 powinno być busy %', k; end if;
  k := public.e2e_lease('runB','w0','{"standard":38}');
  if (k->>'ok')::boolean is not true then raise exception '460: B 38 %', k; end if;
  if exists (select 1 from public.e2e_leases a join public.e2e_leases b on a.name=b.name and a.run_id<>b.run_id)
    then raise exception '460: podwójne wypożyczenie'; end if;
  k := public.e2e_lease('runC','w0','{"standard":1}');
  if k->>'error' <> 'busy' or jsonb_array_length(k->'holders') <> 2 then raise exception '460: C busy/holders %', k; end if;

  -- zasoby: mail 2 sztuki (A ma jedną), trzecia busy; nieznany zasób
  k := public.e2e_lease('runC','w0','{"resources":["mail"]}');
  if (k->>'ok')::boolean is not true then raise exception '460: mail 2 %', k; end if;
  k := public.e2e_lease('runD','w0','{"resources":["mail"]}');
  if k->>'error' <> 'busy' then raise exception '460: mail 3 %', k; end if;
  k := public.e2e_lease('runD','w0','{"resources":["gpu"]}');
  if k->>'error' <> 'unknown_resource' then raise exception '460: unknown %', k; end if;

  -- skrzynka: tylko wypożyczający przebieg
  if not public.e2e_lease_owns('runA','e2e+noaccount01@familiada.online') then raise exception '460: owns A'; end if;
  if public.e2e_lease_owns('runB','e2e+noaccount01@familiada.online') then raise exception '460: owns B'; end if;

  -- zwolnienie i wygaśnięcie
  n := public.e2e_lease_release('runB');
  if n <> 38 then raise exception '460: release B %', n; end if;
  update public.e2e_leases set expires_at = now() - interval '1 second' where run_id='runC';
  k := public.e2e_lease('runE','w0','{"standard":38}');
  if (k->>'ok')::boolean is not true then raise exception '460: E po wygaśnięciu %', k; end if;
  if public.e2e_lease_renew('runE') <> 38 then raise exception '460: renew'; end if;
  perform public.e2e_lease_release('runE');
  perform public.e2e_lease_release('runA');
  if exists (select 1 from public.e2e_leases where run_id in ('runA','runE')) then raise exception '460: release'; end if;
end $$;

-- kwarantanna: czyszczenie standard03 nie przechodzi (gra, której nie da się usunąć)
insert into public.games(id,owner_id,name) values
 ('46000000-0000-4000-8000-00000000b003','46000000-0000-4000-8000-000000000003','BOOM 460');
create function pg_temp.boom460() returns trigger language plpgsql as $$
begin if old.name = 'BOOM 460' then raise exception 'boom460'; end if; return old; end $$;
create trigger boom460 before delete on public.games for each row execute function pg_temp.boom460();

do $$ declare k jsonb; begin
  k := public.e2e_lease('runQ','w0','{"standard":40}');
  if k->>'error' <> 'busy' then raise exception '460: Q 40 powinno być busy po kwarantannie %', k; end if;
  if (select quarantined_at is null from public.e2e_identities where name='e2e.standard03')
    then raise exception '460: standard03 bez kwarantanny'; end if;
  if (select quarantine_reason from public.e2e_identities where name='e2e.standard03') not like '%boom460%'
    then raise exception '460: powód kwarantanny'; end if;
  k := public.e2e_lease('runQ','w0','{"standard":39}');
  if (k->>'ok')::boolean is not true then raise exception '460: Q 39 %', k; end if;
  if exists (select 1 from jsonb_array_elements(k->'identities') x where x->>'name'='e2e.standard03')
    then raise exception '460: kwarantannowe wydane'; end if;
  perform public.e2e_lease_release('runQ');
  k := public.e2e_quarantine_retry('e2e.standard03');
  if (k->>'ok')::boolean is not false then raise exception '460: retry przed poprawką %', k; end if;
end $$;
drop trigger boom460 on public.games;
do $$ declare k jsonb; begin
  k := public.e2e_quarantine_retry('e2e.standard03');
  if (k->>'ok')::boolean is not true then raise exception '460: retry po poprawce %', k; end if;
  if (select quarantined_at is not null from public.e2e_identities where name='e2e.standard03')
    then raise exception '460: kwarantanna nie zdjęta'; end if;
  k := public.e2e_lease('runQ','w0','{"standard":40}');
  if (k->>'ok')::boolean is not true then raise exception '460: Q 40 po retry %', k; end if;
  perform public.e2e_lease_release('runQ');
end $$;

-- dedicated: po czynności, dane zostają, blokady i skrzynka znikają; wyłączność
do $$ declare k jsonb; begin
  k := public.e2e_lease('runG','w0','{"dedicated":"e20-gallery"}');
  if (k->>'ok')::boolean is not true or k->'identities'->0->>'name' <> 'e2e.dedicated01' then raise exception '460: G %', k; end if;
  if not exists (select 1 from public.games where id='46000000-0000-4000-8000-00000000a0d1') then raise exception '460: dane dedicated usunięte'; end if;
  if exists (select 1 from public.edit_locks where holder_user_id='46000000-0000-4000-8000-0000000000d1') then raise exception '460: blokada dedicated'; end if;
  if exists (select 1 from public.e2e_emails where recipient='e2e+dedicated01@familiada.online') then raise exception '460: skrzynka dedicated'; end if;
  k := public.e2e_lease('runH','w0','{"dedicated":["e20-gallery"]}');
  if k->>'error' <> 'busy' then raise exception '460: H busy %', k; end if;
  k := public.e2e_lease('runH','w0','{"dedicated":"nieprzypisane"}');
  if k->>'error' <> 'dedicated_unassigned' then raise exception '460: unassigned %', k; end if;
  perform public.e2e_lease_release('runG');
end $$;

-- disposable: wariant .new należy do tej samej tożsamości i jest czyszczony
do $$ declare k jsonb; begin
  if (public.e2e_identity('e2e+disposable01.new@familiada.online')).name is distinct from 'e2e.disposable01' then raise exception '460: identity .new'; end if;
  if (public.e2e_identity('E2E+Noaccount01@familiada.online ')).name is distinct from 'e2e.noaccount01' then raise exception '460: identity case'; end if;
  if (public.e2e_identity('e2e+noaccount01.new@familiada.online')).name is not null then raise exception '460: .new tylko disposable'; end if;
  if (public.e2e_identity('e2e+zzz01@familiada.online')).name is not null then raise exception '460: nieznany'; end if;
  k := public.e2e_lease('runX','w0','{"disposable":1}');
  if (k->>'ok')::boolean is not true then raise exception '460: disposable %', k; end if;
  if exists (select 1 from public.e2e_emails where recipient='e2e+disposable01.new@familiada.online') then raise exception '460: .new nie wyczyszczone'; end if;
  perform public.e2e_lease_release('runX');
end $$;

-- wykluczenia: tożsamość albo e2e_role; zwykłe konto nie
do $$ begin
  if (select reason from public.stats_exclusions_effective where user_id='46000000-0000-4000-8000-000000000002') is distinct from 'test:standard'
    then raise exception '460: wykluczenie po tożsamości'; end if;
  if (select reason from public.stats_exclusions_effective where user_id='46000000-0000-4000-8000-0000000000d1') is distinct from 'test:dedicated'
    then raise exception '460: wykluczenie dedicated'; end if;
  if exists (select 1 from public.stats_exclusions_effective where user_id='46000000-0000-4000-8000-0000000000aa')
    then raise exception '460: zwykłe konto wykluczone'; end if;
end $$;

-- nazwy i adresy: e2e.* tylko dla tożsamości; noaccount bez konta
do $$ begin
  begin
    update public.profiles set username='e2e.standard09' where id='46000000-0000-4000-8000-0000000000aa';
    raise exception '460: obcy dostał e2e.standard09';
  exception when unique_violation then null; end;
  begin
    insert into auth.users(id,email) values ('46000000-0000-4000-8000-0000000000bb','e2e+noaccount02@familiada.online');
    insert into public.profiles(id,email,username) values ('46000000-0000-4000-8000-0000000000bb','e2e+noaccount02@familiada.online','nobody460');
    raise exception '460: konto na noaccount';
  exception when check_violation then null; end;
  begin
    insert into public.e2e_emails(recipient,subject) values ('e2e+standard01@example.com','x');
    raise exception '460: obca domena w skrzynce';
  exception when check_violation then null; end;
end $$;

-- usuwanie konta nadal usuwa konto (po wydzieleniu _delete_user_data)
do $$ begin
  perform public.delete_user_everything('46000000-0000-4000-8000-0000000000aa');
  if exists (select 1 from auth.users where id='46000000-0000-4000-8000-0000000000aa')
    or exists (select 1 from public.profiles where id='46000000-0000-4000-8000-0000000000aa')
    then raise exception '460: delete_user_everything nie usunęło konta'; end if;
end $$;

select '460 OK' as result;
ROLLBACK;
