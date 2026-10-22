-- Migracja 429: cofnięcie usunięcia tagów (te same id, przypisania).
-- Lokalna baza wg docs/sql/local-db.md: psql ... -f tests/sql/qb-restore-tags-429.sql
\set ON_ERROR_STOP 1
begin;
grant select, insert, update, delete on all tables in schema public to authenticated;
\ir ../../supabase/migrations/2026-10-20_427_qb_atomic_ops.sql
\ir ../../supabase/migrations/2026-10-20_429_qb_restore_tags.sql
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000429a1','owner429@example.test');
insert into public.profiles(id,username,email) values ('00000000-0000-4000-8000-0000000429a1','owner429','owner429@example.test') on conflict (id) do nothing;
insert into public.question_bases(id,owner_id,name) values ('00000000-0000-4000-8000-000000042900','00000000-0000-4000-8000-0000000429a1','B429');
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000429a1',true);
do $$
declare b uuid := '00000000-0000-4000-8000-000000042900'; q1 uuid; q2 uuid; t uuid; snap jsonb;
begin
  q1 := public.qb_create_question(b, null, '{"text":"Jeden","answers":[]}');
  q2 := public.qb_create_question(b, null, '{"text":"Dwa","answers":[]}');
  t := (public.qb_save_tag(b, null, 'stary', '#123456')->>'id')::uuid;
  perform public.qb_set_tag_links(b, array[t], array[q1, q2], null, true);

  snap := public.qb_delete_tags(b, array[t]);
  -- pytanie q2 znika w międzyczasie: jego przypisanie jest pomijane
  delete from public.qb_questions where id = q2;
  perform public.qb_restore_tags(b, snap);
  if (select name || color from public.qb_tags where id = t) <> 'stary#123456' then raise exception 'tag nie wrócił'; end if;
  if (select count(*) from public.qb_question_tags where tag_id = t) <> 1 then raise exception 'przypisania'; end if;

  -- nazwa zajęta przez nowy tag: qb:duplicate
  snap := public.qb_delete_tags(b, array[t]);
  perform public.qb_save_tag(b, null, 'STARY', null);
  begin
    perform public.qb_restore_tags(b, snap);
    raise exception 'brak odmowy duplikatu';
  exception when others then if sqlerrm <> 'qb:duplicate' then raise; end if; end;
end $$;
select 'qb-restore-tags-429 OK';
rollback;
