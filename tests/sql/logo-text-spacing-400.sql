-- Migracja 400: odstęp między słowami w logo napisowych.
-- Oczekiwane wiersze wygenerowane prawdziwym compileText() edytora logo
-- (stara wersja z main i nowa z brancha) w przeglądarce, ta sama czcionka 3x10.
-- Uruchomienie: lokalna baza wg docs/sql/local-db.md (schema.sql bez migracji 400),
-- potem z katalogu repo: psql ... -d fam -f tests/sql/logo-text-spacing-400.sql
-- Migracja wykonuje się wewnątrz transakcji testu i jest wycofywana na końcu.
\set ON_ERROR_STOP 1
begin;
insert into auth.users(id,email) values ('40000000-0000-4000-8000-0000000000aa','a400@x.pl'), ('40000000-0000-4000-8000-0000000000bb','b400@x.pl');
-- L1: przeliczone (napis ze spacją)
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-0000000000aa','L400-1','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                              ", "◢█◣ █ █ █ ███ ██◣ ◢█◣ ██◣ ◢██ ", "█ █ █ █ █   ╱   █ █ █   █ █   ", "█ █ █ █ █  ╱  ◢█◤ █ █ ◢█◤ ██◣ ", "█▗█ █ █ █ ╱   █   █ █ █   █ █ ", "◥█╲ ◥█◤ █ ███ ███ ◥█◤ ███ ◥█◤ ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "QUIZ 2026"}}');
-- L2: przeliczone (napis ze spacją)
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-0000000000aa','L400-2','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                              ", "       ◢█◣ ██◣  ◢█  ██◣       ", "       █ █ █ ◤   █    █       ", "       ███ ██◣   █  ◢█◤       ", "       █ █ █ █   █  █         ", "       █ █ ██◤  ███ ███       ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "AB  12"}}');
-- L3: przeliczone (napis ze spacją)
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-0000000000aa','L400-3','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                              ", "           ◢█◣ ██◣            ", "           █ █ █ ◤            ", "           ███ ██◣            ", "           █ █ █ █            ", "           █ █ ██◤            ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": " A B "}}');
-- L4: przeliczone (napis ze spacją)
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-0000000000aa','L400-4','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                              ", "           ◢█◣ ██◣            ", "           █ █ █ ◤            ", "           ███ ██◣            ", "           █ █ █ █            ", "           █ █ ██◤            ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "a b"}}');
-- L5: przeliczone (napis ze spacją)
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-0000000000aa','L400-5','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                    ⇗         ", "       ◢█◣ ███  █  ◢█◣        ", "       █ █ █    █  █ █        ", "       ███ ███  █⇙ █ █        ", "       █ █ █   ⇗█  █ █        ", "       █ ◤ ███  ██ ◥█◤        ", "        ⇙   ⇗                 ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "ĄĘ ŁÓ"}}');
-- L6: bez spacji -- bez zmian
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-0000000000aa','L400-6','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                              ", "  ██◣ ◢█◣ ██◣ ███ █ █ █ ◢█◣   ", "  █ █ █ █ █ █   ╱ █ █◣█ █ █   ", "  ██◤ █ █ █ █  ╱  █ █◥█ ███   ", "  █ ◣ █ █ █ █ ╱   █ █ █ █ █   ", "  █ █ ◥█◤ ██◤ ███ █ █ █ █ █   ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "RODZINA"}}');
-- L7: nowy układ za szeroki -- bez zmian
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-0000000000aa','L400-7','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                              ", " ◢█  ██◣ ███ █ █ ███ ◢██ ███  ", "  █    █   ◤ █ █ █   █     ◤  ", "  █  ◢█◤ ██◣ ███ ██◣ ██◣  ◢   ", "  █  █     █   █   █ █ █  █   ", " ███ ███ ██◤   █ ██◤ ◥█◤  █   ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "1 2 3 4 5 6 7"}}');
-- L8: wiersze nie są wynikiem starej kompilacji -- bez zmian
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-0000000000aa','L400-8','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["X                             ", "                              ", "◢█◣ █ █ █ ███ ██◣ ◢█◣ ██◣ ◢██ ", "█ █ █ █ █   ╱   █ █ █   █ █   ", "█ █ █ █ █  ╱  ◢█◤ █ █ ◢█◤ ██◣ ", "█▗█ █ █ █ ╱   █   █ █ █   █ █ ", "◥█╲ ◥█◤ █ ███ ███ ◥█◤ ███ ◥█◤ ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "QUIZ 2026"}}');
-- L9: w oczekującej ofercie kopii -- bez zmian
insert into public.user_logos(id,user_id,name,type,payload) values ('40000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-0000000000aa','L400-9','GLYPH_30x10','{"layers": [{"color": "main", "rows": ["                              ", "                              ", " █ █ █ █ ███ ██◣ ◢█◣ ██◣ ◢██  ", " ◥ ◤ █ █   ╱   █ █ █   █ █    ", "  ⧗  ◥▃◤  ╱  ◢█◤ █ █ ◢█◤ ██◣  ", " ◢ ◣  █  ╱   █   █ █ █   █ █  ", " █ █  █  ███ ███ ◥█◤ ███ ◥█◤  ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "XYZ 2026"}}');
insert into public.resource_copy_offers(recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,request_id,payload_hash,logo_id) values ('40000000-0000-4000-8000-0000000000bb','40000000-0000-4000-8000-0000000000aa','40000000-0000-4000-8000-0000000000aa','A','40000000-0000-4000-8000-000000000009','logo','GLYPH_30x10','L400-9',gen_random_uuid(),repeat('a',64),'40000000-0000-4000-8000-000000000009');
-- D1: szablon logo dla nowych kont
insert into public.demo_template_data(lang,slot,payload) values ('zz','logo_text','{"name": "Demo", "kind": "GLYPH", "payload": {"layers": [{"color": "main", "rows": ["                              ", "                              ", " █ █ █ █ ███ ██◣ ◢█◣ ██◣ ◢██  ", " ◥ ◤ █ █   ╱   █ █ █   █ █    ", "  ⧗  ◥▃◤  ╱  ◢█◤ █ █ ◢█◤ ██◣  ", " ◢ ◣  █  ╱   █   █ █ █   █ █  ", " █ █  █  ███ ███ ◥█◤ ███ ◥█◤  ", "                              ", "                              ", "                              "]}], "source": {"mode": "TEXT", "text": "XYZ 2026"}}}');
\ir ../../supabase/migrations/2026-10-20_400_logo_text_word_spacing.sql
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000001') is distinct from '["                              ", "                              ", "◢█◣ █ █ █ ███  ██◣ ◢█◣ ██◣ ◢██", "█ █ █ █ █   ╱    █ █ █   █ █  ", "█ █ █ █ █  ╱   ◢█◤ █ █ ◢█◤ ██◣", "█▗█ █ █ █ ╱    █   █ █ █   █ █", "◥█╲ ◥█◤ █ ███  ███ ◥█◤ ███ ◥█◤", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L1 (przeliczone (napis ze spacją)): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000002') is distinct from '["                              ", "                              ", "      ◢█◣ ██◣   ◢█  ██◣       ", "      █ █ █ ◤    █    █       ", "      ███ ██◣    █  ◢█◤       ", "      █ █ █ █    █  █         ", "      █ █ ██◤   ███ ███       ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L2 (przeliczone (napis ze spacją)): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000003') is distinct from '["                              ", "                              ", "           ◢█◣  ██◣           ", "           █ █  █ ◤           ", "           ███  ██◣           ", "           █ █  █ █           ", "           █ █  ██◤           ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L3 (przeliczone (napis ze spacją)): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000004') is distinct from '["                              ", "                              ", "           ◢█◣  ██◣           ", "           █ █  █ ◤           ", "           ███  ██◣           ", "           █ █  █ █           ", "           █ █  ██◤           ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L4 (przeliczone (napis ze spacją)): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000005') is distinct from '["                              ", "                     ⇗        ", "       ◢█◣ ███   █  ◢█◣       ", "       █ █ █     █  █ █       ", "       ███ ███   █⇙ █ █       ", "       █ █ █    ⇗█  █ █       ", "       █ ◤ ███   ██ ◥█◤       ", "        ⇙   ⇗                 ", "                              ", "                              "]'::jsonb
  then raise exception 'L5 (przeliczone (napis ze spacją)): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000006') is distinct from '["                              ", "                              ", "  ██◣ ◢█◣ ██◣ ███ █ █ █ ◢█◣   ", "  █ █ █ █ █ █   ╱ █ █◣█ █ █   ", "  ██◤ █ █ █ █  ╱  █ █◥█ ███   ", "  █ ◣ █ █ █ █ ╱   █ █ █ █ █   ", "  █ █ ◥█◤ ██◤ ███ █ █ █ █ █   ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L6 (bez spacji -- bez zmian): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000007') is distinct from '["                              ", "                              ", " ◢█  ██◣ ███ █ █ ███ ◢██ ███  ", "  █    █   ◤ █ █ █   █     ◤  ", "  █  ◢█◤ ██◣ ███ ██◣ ██◣  ◢   ", "  █  █     █   █   █ █ █  █   ", " ███ ███ ██◤   █ ██◤ ◥█◤  █   ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L7 (nowy układ za szeroki -- bez zmian): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000008') is distinct from '["X                             ", "                              ", "◢█◣ █ █ █ ███ ██◣ ◢█◣ ██◣ ◢██ ", "█ █ █ █ █   ╱   █ █ █   █ █   ", "█ █ █ █ █  ╱  ◢█◤ █ █ ◢█◤ ██◣ ", "█▗█ █ █ █ ╱   █   █ █ █   █ █ ", "◥█╲ ◥█◤ █ ███ ███ ◥█◤ ███ ◥█◤ ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L8 (wiersze nie są wynikiem starej kompilacji -- bez zmian): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{layers,0,rows}' from public.user_logos where id='40000000-0000-4000-8000-000000000009') is distinct from '["                              ", "                              ", " █ █ █ █ ███ ██◣ ◢█◣ ██◣ ◢██  ", " ◥ ◤ █ █   ╱   █ █ █   █ █    ", "  ⧗  ◥▃◤  ╱  ◢█◤ █ █ ◢█◤ ██◣  ", " ◢ ◣  █  ╱   █   █ █ █   █ █  ", " █ █  █  ███ ███ ◥█◤ ███ ◥█◤  ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'L9 (w oczekującej ofercie kopii -- bez zmian): wiersze inne niż oczekiwane'; end if;
end $$;
do $$ begin
  if (select payload #> '{payload,layers,0,rows}' from public.demo_template_data where lang='zz' and slot='logo_text') is distinct from '["                              ", "                              ", " █ █ █ █ ███  ██◣ ◢█◣ ██◣ ◢██ ", " ◥ ◤ █ █   ╱    █ █ █   █ █   ", "  ⧗  ◥▃◤  ╱   ◢█◤ █ █ ◢█◤ ██◣ ", " ◢ ◣  █  ╱    █   █ █ █   █ █ ", " █ █  █  ███  ███ ◥█◤ ███ ◥█◤ ", "                              ", "                              ", "                              "]'::jsonb
  then raise exception 'D1 (szablon logo): wiersze inne niż oczekiwane'; end if;
end $$;
select 'logo-text-spacing-400: OK' as wynik;
rollback;
