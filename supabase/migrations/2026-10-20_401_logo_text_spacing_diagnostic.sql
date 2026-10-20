-- 401: diagnostyka po migracji 400 (tylko odczyt, niczego nie zmienia).
-- Migracja 400 przeliczyła 0 logo. Ta migracja wypisuje w logu same liczby
-- (bez treści logo użytkowników), żeby ustalić, czy logo napisowych ze spacją
-- nie ma, czy zostały pominięte, bo ich zapisane wiersze różnią się od wyniku
-- starej kompilacji (np. logo zapisane dawniejszym edytorem).
CREATE FUNCTION pg_temp.logo_text_rows(p_text text, p_font jsonb, p_new boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  ch text; g jsonb; lft int; rgt int; w int; x int := 0; prev boolean := false;
  items jsonb := '[]'::jsonb; it jsonb; used_w int; off int; y int; cx int; c text;
  grid text[] := array_fill(' '::text, ARRAY[300]); out_rows jsonb := '[]'::jsonb;
BEGIN
  FOR ch IN SELECT s FROM regexp_split_to_table(coalesce(p_text, ''), '') AS s LOOP
    IF ch = ' ' THEN
      x := x + 1;
      IF NOT p_new THEN prev := false; END IF;
      CONTINUE;
    END IF;
    IF ch ~ '[\n\r\t]' THEN RETURN NULL; END IF;
    g := coalesce(p_font -> ch, p_font -> upper(ch));
    IF g IS NULL THEN RETURN NULL; END IF;
    -- cropGlyph: kolumny z czymś innym niż spacja i twarda spacja
    lft := 3; rgt := -1;
    FOR cx IN 0..2 LOOP
      FOR y IN 0..9 LOOP
        c := substr(rpad(coalesce(g ->> y, ''), 3, ' '), cx + 1, 1);
        IF c <> ' ' AND c <> chr(160) THEN lft := least(lft, cx); rgt := cx; EXIT; END IF;
      END LOOP;
    END LOOP;
    w := CASE WHEN rgt < lft THEN 0 ELSE rgt - lft + 1 END;
    IF prev THEN x := x + 1; END IF;
    items := items || jsonb_build_array(jsonb_build_object('g', g, 'l', lft, 'w', w, 'x', x));
    x := x + w;
    prev := true;
  END LOOP;
  used_w := x;
  IF used_w > 30 THEN RETURN NULL; END IF;
  off := (30 - used_w) / 2;
  FOR it IN SELECT value FROM jsonb_array_elements(items) LOOP
    FOR y IN 0..9 LOOP
      FOR cx IN 0..(it ->> 'w')::int - 1 LOOP
        c := substr(rpad(coalesce(it -> 'g' ->> y, ''), 3, ' '), (it ->> 'l')::int + cx + 1, 1);
        IF c <> ' ' AND off + (it ->> 'x')::int + cx < 30 THEN
          grid[y * 30 + off + (it ->> 'x')::int + cx + 1] := c;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOR y IN 0..9 LOOP
    out_rows := out_rows || to_jsonb(array_to_string(grid[y * 30 + 1 : y * 30 + 30], ''));
  END LOOP;
  RETURN out_rows;
END $$;

CREATE TEMP TABLE logo_text_font AS SELECT '{"0":["   ","   ","◢█◣","█ █","█ █","█ █","◥█◤","   ","   ","   "],"1":["   ","   ","◢█ "," █ "," █ "," █ ","███","   ","   ","   "],"2":["   ","   ","██◣","  █","◢█◤","█  ","███","   ","   ","   "],"3":["   ","   ","███","  ◤","██◣","  █","██◤","   ","   ","   "],"4":["   ","   ","█ █","█ █","███","  █","  █","   ","   ","   "],"5":["   ","   ","███","█  ","██◣","  █","██◤","   ","   ","   "],"6":["   ","   ","◢██","█  ","██◣","█ █","◥█◤","   ","   ","   "],"7":["   ","   ","███","  ◤"," ◢ "," █ "," █ ","   ","   ","   "],"8":["   ","   ","◢█◣","◥ ◤","◢█◣","█ █","◥█◤","   ","   ","   "],"9":["   ","   ","◢█◣","█ █","◥██","  █","██◤","   ","   ","   "],"!":["   ","   "," █ "," █ "," █ ","   "," █ ","   ","   ","   "],"\"":["   ","█ █","█ █","   ","   ","   ","   ","   ","   ","   "],"''":["   "," █ "," ◤ ","   ","   ","   ","   ","   ","   ","   "],"(":["   ","   "," ◢◤"," █ "," █ "," █ "," ◥◣","   ","   ","   "],")":["   ","   ","◥◣ "," █ "," █ "," █ ","◢◤ ","   ","   ","   "],",":["   ","   ","   ","   ","   ","   "," █ "," ◤ ","   ","   "],"-":["   ","   ","   ","   ","███","   ","   ","   ","   ","   "],".":["   ","   ","   ","   ","   ","   "," █ ","   ","   ","   "],":":["   ","   "," █ ","   ","   ","   "," █ ","   ","   ","   "],";":["   ","   "," █ ","   ","   ","   "," █ "," ◤ ","   ","   "],"?":["   ","   ","██◣","  █"," ◢◤"," █ ","   "," █ ","   ","   "],"A":["   ","   ","◢█◣","█ █","███","█ █","█ █","   ","   ","   "],"B":["   ","   ","██◣","█ ◤","██◣","█ █","██◤","   ","   ","   "],"C":["   ","   ","◢█◣","█  ","█  ","█  ","◥█◤","   ","   ","   "],"D":["   ","   ","██◣","█ █","█ █","█ █","██◤","   ","   ","   "],"E":["   ","   ","███","█  ","███","█  ","███","   ","   ","   "],"F":["   ","   ","███","█  ","██ ","█  ","█  ","   ","   ","   "],"G":["   ","   ","◢█◣","█  ","█⌟▃","█⌝█","◥█◤","   ","   ","   "],"H":["   ","   ","█ █","█ █","███","█ █","█ █","   ","   ","   "],"I":["   ","   "," █ "," █ "," █ "," █ "," █ ","   ","   ","   "],"J":["   ","   ","  █","  █","  █","◢ █","◥█◤","   ","   ","   "],"K":["   ","   ","█ ╱","█╱ ","█╲ ","█ ╲","█ ▐","   ","   ","   "],"L":["   ","   ","█  ","█  ","█  ","█  ","██ ","   ","   ","   "],"M":["   ","   ","█ █","█Ѵ█","█ █","█ █","█ █","   ","   ","   "],"N":["   ","   ","█ █","█◣█","█◥█","█ █","█ █","   ","   ","   "],"O":["   ","   ","◢█◣","█ █","█ █","█ █","◥█◤","   ","   ","   "],"P":["   ","   ","██◣","█ █","██◤","█  ","█  ","   ","   ","   "],"Q":["   ","   ","◢█◣","█ █","█ █","█▗█","◥█╲","   ","   ","   "],"R":["   ","   ","██◣","█ █","██◤","█ ◣","█ █","   ","   ","   "],"S":["   ","   ","◢█◣","█  ","◥█◣","  █","◥█◤","   ","   ","   "],"T":["   ","   ","███"," █ "," █ "," █ "," █ ","   ","   ","   "],"U":["   ","   ","█ █","█ █","█ █","█ █","◥█◤","   ","   ","   "],"V":["   ","   ","█ █","█ █","█ █","◥ ◤"," Ѵ ","   ","   ","   "],"W":["   ","   ","█ █","█ █","█ █","▇ ▇","◤Ѵ◥","   ","   ","   "],"X":["   ","   ","█ █","◥ ◤"," ⧗ ","◢ ◣","█ █","   ","   ","   "],"Y":["   ","   ","█ █","█ █","◥▃◤"," █ "," █ ","   ","   ","   "],"Z":["   ","   ","███","  ╱"," ╱ ","╱  ","███","   ","   ","   "],"Ó":["   "," ⇗ ","◢█◣","█ █","█ █","█ █","◥█◤","   ","   ","   "],"Ą":["   ","   ","◢█◣","█ █","███","█ █","█ ◤"," ⇙ ","   ","   "],"Ć":["   "," ⇗ ","◢█◣","█  ","█  ","█  ","◥█◤","   ","   ","   "],"Ę":["   ","   ","███","█  ","███","█  ","███"," ⇗ ","   ","   "],"Ł":["   ","   "," █ "," █ "," █⇙","⇗█ "," ██","   ","   ","   "],"Ń":["   "," ⇗ ","█ █","█◣█","█◥█","█ █","█ █","   ","   ","   "],"Ś":["   "," ⇗ ","◢█◣","█  ","◥█◣","  █","◥█◤","   ","   ","   "],"Ź":["   "," ⇗ ","███","  ╱"," ╱ ","╱  ","███","   ","   ","   "],"Ż":["   "," ∙ ","███","  ╱"," ╱ ","╱  ","███","   ","   ","   "],"Є":["   ","   ","◢█◣","█  ","██ ","█  ","◥█◤","   ","   ","   "],"І":["   ","   "," █ "," █ "," █ "," █ "," █ ","   ","   ","   "],"Ї":["   ","█ █"," ▃ "," █ "," █ "," █ "," █ ","   ","   ","   "],"А":["   ","   ","◢█◣","█ █","███","█ █","█ █","   ","   ","   "],"Б":["   ","   ","███","█  ","██◣","█ █","██◤","   ","   ","   "],"В":["   ","   ","██◣","█ ◤","██◣","█ █","██◤","   ","   ","   "],"Г":["   ","   ","███","█  ","█  ","█  ","█  ","   ","   ","   "],"Д":["   ","   "," ◢█","◢ █","█ █","█ █","███","█ █","   ","   "],"Е":["   ","   ","███","█  ","███","█  ","███","   ","   ","   "],"Ж":["   ","   ","▋█▐","╲█╱"," █ ","╱█╲","▋█▐","   ","   ","   "],"З":["   ","   ","██◣","  █"," █◤","  █","██◤","   ","   ","   "],"И":["   ","   ","█ █","█◢█","█◤█","█ █","█ █","   ","   ","   "],"Й":["   ","⌝▀⌜","█ █","█◢█","█◤█","█ █","█ █","   ","   ","   "],"К":["   ","   ","█ ╱","█╱ ","█╲ ","█ ╲","█ ▐","   ","   ","   "],"Л":["   ","   ","◢██","█ █","█ █","█ █","█ █","   ","   ","   "],"М":["   ","   ","█ █","█Ѵ█","█ █","█ █","█ █","   ","   ","   "],"Н":["   ","   ","█ █","█ █","███","█ █","█ █","   ","   ","   "],"О":["   ","   ","◢█◣","█ █","█ █","█ █","◥█◤","   ","   ","   "],"П":["   ","   ","███","█ █","█ █","█ █","█ █","   ","   ","   "],"Р":["   ","   ","██◣","█ █","██◤","█  ","█  ","   ","   ","   "],"С":["   ","   ","◢█◣","█  ","█  ","█  ","◥█◤","   ","   ","   "],"Т":["   ","   ","███"," █ "," █ "," █ "," █ ","   ","   ","   "],"У":["   ","   ","█ █","█ █","◥██","  █","◥█◤","   ","   ","   "],"Ф":["   ","   ","◢█◣","▋█▐","▋█▐","◥█◤"," █ ","   ","   ","   "],"Х":["   ","   ","█ █","◥ ◤"," ⧗ ","◢ ◣","█ █","   ","   ","   "],"Ц":["   ","   ","█ █","█ █","█ █","█ █","███","  ◥","   ","   "],"Ч":["   ","   ","█ █","█ █","◥██","  █","  █","   ","   ","   "],"Ш":["   ","   ","▋█▐","▋█▐","▋█▐","▋█▐","███","   ","   ","   "],"Щ":["   ","   ","▋█▐","▋█▐","▋█▐","▋█▐","███","  ◤","   ","   "],"Ь":["   ","   ","█  ","█  ","██◣","█ █","██◤","   ","   ","   "],"Ю":["   ","   ","▋⇗⇖","▋▋▐","█▋▐","▋▋▐","▋⇘⇙","   ","   ","   "],"Я":["   ","   ","◢██","◥ █","◢██","█ █","█ █","   ","   ","   "],"Ґ":["   ","  █","███","█  ","█  ","█  ","█  ","   ","   ","   "]}'::jsonb AS font;

DO $$
DECLARE
  total int; with_text int; with_space int; old_match int; new_match int; neither int;
  too_wide int; uncompilable int; pending int; rows_only int; demo text;
BEGIN
  SELECT count(*) INTO total FROM public.user_logos WHERE type = 'GLYPH_30x10';
  SELECT count(*) INTO with_text FROM public.user_logos
   WHERE type = 'GLYPH_30x10' AND payload #>> '{source,mode}' = 'TEXT' AND jsonb_typeof(payload #> '{source,text}') = 'string';
  SELECT count(*) INTO rows_only FROM public.user_logos
   WHERE type = 'GLYPH_30x10' AND jsonb_typeof(payload #> '{source,text}') IS DISTINCT FROM 'string';
  WITH c AS (
    SELECT l.id, l.payload #> '{layers,0,rows}' AS cur,
           pg_temp.logo_text_rows(l.payload #>> '{source,text}', f.font, false) AS o,
           pg_temp.logo_text_rows(l.payload #>> '{source,text}', f.font, true) AS n,
           EXISTS (SELECT 1 FROM public.resource_copy_offers x WHERE x.status = 'pending' AND x.logo_id = l.id) AS p
    FROM public.user_logos l CROSS JOIN logo_text_font f
    WHERE l.type = 'GLYPH_30x10' AND l.payload #>> '{source,mode}' = 'TEXT'
      AND btrim(l.payload #>> '{source,text}') LIKE '% %'
  )
  SELECT count(*), count(*) FILTER (WHERE o = cur), count(*) FILTER (WHERE n = cur),
         count(*) FILTER (WHERE o IS NOT NULL AND o <> cur AND (n IS NULL OR n <> cur)),
         count(*) FILTER (WHERE o IS NOT NULL AND n IS NULL),
         count(*) FILTER (WHERE o IS NULL), count(*) FILTER (WHERE p)
    INTO with_space, old_match, new_match, neither, too_wide, uncompilable, pending FROM c;
  SELECT string_agg(lang || ':' || coalesce(payload #>> '{payload,source,mode}', '-') || ':' || coalesce(payload #>> '{payload,source,text}', '(bez tekstu)'), ', ')
    INTO demo FROM public.demo_template_data WHERE slot = 'logo_text';
  RAISE NOTICE 'logo GLYPH_30x10: wszystkie %, z napisem (source.text) %, bez napisu (tylko kropki) %', total, with_text, rows_only;
  RAISE NOTICE 'napis ze spacją w środku: %, stara kompilacja = zapis %, nowa = zapis %, ani stara ani nowa %, nowy układ za szeroki %, nie do skompilowania %, w oczekujących ofertach %',
    with_space, old_match, new_match, neither, too_wide, uncompilable, pending;
  RAISE NOTICE 'szablony logo_text: %', coalesce(demo, '(brak)');
END $$;

DROP TABLE logo_text_font;
