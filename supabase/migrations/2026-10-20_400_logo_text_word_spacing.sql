-- 400: odstęp między słowami w logo napisowych (decyzja użytkownika 2026-10-20).
-- Edytor napisów logo (web/logos/js/text.js) liczy teraz spację jako kolumnę
-- DODANĄ do zwykłej przerwy między glifami (słowa 2 kolumny, litery 1);
-- wcześniej spacja zastępowała przerwę i „A B” wyglądało jak „AB”.
-- Migracja przelicza wiersze istniejących logo napisowych (GLYPH_30x10 z
-- source.mode = TEXT), których napis ma spację między znakami:
--   * tylko gdy zapisane wiersze są dokładnie wynikiem starej kompilacji
--     (logo nie było zmieniane inaczej) i nowy układ mieści się w 30 kolumnach;
--   * z pominięciem logo czekających w ofertach kopii (wyzwalacz
--     copy_pending_logo nie pozwala ich zmieniać);
--   * także szablony logo dla nowych kont (demo_template_data, slot logo_text).
-- Kompilacja w SQL odwzorowuje compileText() 1:1 na tej samej czcionce 3x10
-- (web/shared/fonts/display/font_3x10.json); test: tests/sql/logo-text-spacing-400.sql.

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

-- Logo użytkowników
WITH candidates AS (
  SELECT l.id,
         pg_temp.logo_text_rows(l.payload #>> '{source,text}', f.font, false) AS old_rows,
         pg_temp.logo_text_rows(l.payload #>> '{source,text}', f.font, true) AS new_rows
  FROM public.user_logos l CROSS JOIN logo_text_font f
  WHERE l.type = 'GLYPH_30x10'
    AND l.payload #>> '{source,mode}' = 'TEXT'
    AND btrim(l.payload #>> '{source,text}') LIKE '% %'
    AND NOT EXISTS (SELECT 1 FROM public.resource_copy_offers o WHERE o.status = 'pending' AND o.logo_id = l.id)
)
UPDATE public.user_logos l
SET payload = jsonb_set(l.payload, '{layers,0,rows}', c.new_rows)
FROM candidates c
WHERE l.id = c.id
  AND c.new_rows IS NOT NULL
  AND c.old_rows = l.payload #> '{layers,0,rows}'
  AND c.new_rows <> c.old_rows;

-- Szablony logo dla nowych kont
WITH candidates AS (
  SELECT d.lang, d.slot,
         pg_temp.logo_text_rows(d.payload #>> '{payload,source,text}', f.font, false) AS old_rows,
         pg_temp.logo_text_rows(d.payload #>> '{payload,source,text}', f.font, true) AS new_rows
  FROM public.demo_template_data d CROSS JOIN logo_text_font f
  WHERE d.slot = 'logo_text'
    AND d.payload #>> '{payload,source,mode}' = 'TEXT'
    AND btrim(d.payload #>> '{payload,source,text}') LIKE '% %'
)
UPDATE public.demo_template_data d
SET payload = jsonb_set(d.payload, '{payload,layers,0,rows}', c.new_rows)
FROM candidates c
WHERE d.lang = c.lang AND d.slot = c.slot
  AND c.new_rows IS NOT NULL
  AND c.old_rows = d.payload #> '{payload,layers,0,rows}'
  AND c.new_rows <> c.old_rows;

DROP TABLE logo_text_font;
