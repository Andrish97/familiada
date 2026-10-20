-- 403: E21 — audyt danych przed migracją naprawczą (tylko odczyt, niczego nie zmienia).
-- Wypisuje w logu wyłącznie liczby i identyfikatory (bez treści pytań,
-- odpowiedzi i nazw gier). Zestaw znaków odpowiedzi: czcionka 5x7
-- (scripts/gen-answer-charset.cjs); funkcje tymczasowe w pg_temp.
CREATE OR REPLACE FUNCTION pg_temp.fam_answer_charset() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$ SELECT ' !"#$%&''()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĹĺĻļĽľĿŀŁłŃńŅņŇňŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſƑƒˆˇˊˋ˘˙˚˛˜ͅΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρςστυφχψωϐϑϕϖϰϱϵЀЁЂЃЄЅІЇЈЉЊЋЌЍЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюяѐёђѓєѕіїјљњћќѝўџѴѵҐґᲀᲁᲂᲃᲄᲅᲆẞᾳᾼῃῌῳῼ‐‑‒–—―‖‗‘’‚‛“”„‟†‡•‣․‥…‧‰‱‹›‼‽⁄⁇⁈⁉⁋⁘⁙⁚⁛⁜⁝⁞⁰ⁱ⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎€₴ℂℍℕ№ℙℚℝ™ℤ℮⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⅟↉↊↋←↑→↓⇖⇗⇘⇙−∕∖∗∘∙√∛∜∣∤∥∦∧∨∩∪∫≤≥⊂⊃⊄⊅⌜⌝⌞⌟⍰⎴⎵╱╲▀▁▂▃▄▅▇█▊▋▍▏▐░▒▔▕▖▗▘▙▚▛▜▝▞▟■□▢▣◢◣◤◥✓✗⧗ﬀﬁﬂﬃﬄﬅﬆ'::text $f$;

CREATE OR REPLACE FUNCTION pg_temp.fam_answer_invalid_chars(p text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT coalesce(array_agg(ch ORDER BY pos), '{}'::text[])
  FROM (
    SELECT ch, min(i) AS pos
    FROM regexp_split_to_table(normalize(coalesce(p, ''), NFC), '') WITH ORDINALITY AS t(ch, i)
    WHERE ch !~ '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]' AND strpos(pg_temp.fam_answer_charset(), ch) = 0
    GROUP BY ch
  ) s
$f$;

CREATE OR REPLACE FUNCTION pg_temp.fam_answer_clean(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT btrim(left(btrim(regexp_replace(coalesce(string_agg(ch, '' ORDER BY i), ''), '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'), ' '), 17), ' ')
  FROM regexp_split_to_table(normalize(coalesce(p, ''), NFC), '') WITH ORDINALITY AS t(ch, i)
  WHERE ch ~ '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]' OR strpos(pg_temp.fam_answer_charset(), ch) > 0
$f$;

DO $$
DECLARE r record; n int; m int; k int; x int;
BEGIN
  -- Typy i statusy gier
  FOR r IN SELECT type::text t, status::text s, count(*) c, count(*) FILTER (WHERE is_demo) d,
                  count(*) FILTER (WHERE source_market_id IS NOT NULL) sm, count(*) FILTER (WHERE rules_state IS NULL) rn
           FROM public.games GROUP BY 1,2 ORDER BY 1,2 LOOP
    RAISE NOTICE 'gry typ=% status=%: % (demo %, z source_market_id %, rules_state null %)', r.t, r.s, r.c, r.d, r.sm, r.rn;
  END LOOP;

  -- Pytania gier > 100 znaków
  SELECT count(*), coalesce(max(char_length(q.text)),0), count(DISTINCT q.game_id) INTO n, m, k
  FROM public.questions q WHERE char_length(q.text) > 100;
  RAISE NOTICE 'pytania gier >100: % (maks. %), w grach: %', n, m, k;
  FOR r IN SELECT g.type::text t, g.status::text s, count(*) c FROM public.questions q JOIN public.games g ON g.id=q.game_id
           WHERE char_length(q.text) > 100 GROUP BY 1,2 ORDER BY 1,2 LOOP
    RAISE NOTICE '  >100 typ=% status=%: %', r.t, r.s, r.c;
  END LOOP;

  -- Pytania i odpowiedzi w bazach pytań
  SELECT count(*) FILTER (WHERE char_length(payload->>'text') > 100), coalesce(max(char_length(payload->>'text')),0)
  INTO n, m FROM public.qb_questions;
  RAISE NOTICE 'bazy: pytania >100: % (maks. %)', n, m;
  SELECT count(*) FILTER (WHERE jsonb_typeof(payload->'answers') = 'array'),
         count(*) FILTER (WHERE jsonb_typeof(payload->'answers') = 'array' AND jsonb_array_length(payload->'answers') > 6)
  INTO n, m FROM public.qb_questions;
  RAISE NOTICE 'bazy: pytania z tablicą odpowiedzi %, z >6 odpowiedziami %', n, m;
  SELECT count(*), count(*) FILTER (WHERE char_length(a.value->>'text') > 17),
         count(*) FILTER (WHERE cardinality(pg_temp.fam_answer_invalid_chars(a.value->>'text')) > 0),
         count(*) FILTER (WHERE pg_temp.fam_answer_clean(a.value->>'text') = '' AND coalesce(btrim(a.value->>'text'),'') <> ''),
         count(*) FILTER (WHERE coalesce(btrim(a.value->>'text'),'') = '')
  INTO n, m, k, x
  FROM public.qb_questions q, jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers')='array' THEN q.payload->'answers' ELSE '[]' END) a;
  RAISE NOTICE 'bazy: odpowiedzi %, >17 znaków %, z niedozwolonymi znakami %, puste po oczyszczeniu %', n, m, k, x;
  SELECT count(*) INTO n FROM public.qb_questions q, jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers')='array' THEN q.payload->'answers' ELSE '[]' END) a
  WHERE coalesce(btrim(a.value->>'text'),'') = '';
  RAISE NOTICE 'bazy: odpowiedzi puste już teraz %', n;
  SELECT count(*) INTO n FROM (
    SELECT q.id, upper(pg_temp.fam_answer_clean(a.value->>'text')) c
    FROM public.qb_questions q, jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers')='array' THEN q.payload->'answers' ELSE '[]' END) a
    WHERE pg_temp.fam_answer_clean(a.value->>'text') <> ''
    GROUP BY 1,2 HAVING count(*) > 1 AND bool_or(cardinality(pg_temp.fam_answer_invalid_chars(a.value->>'text')) > 0)) s;
  RAISE NOTICE 'bazy: kolizje tekstów wywołane oczyszczeniem (pytanie+tekst): %', n;

  -- Odpowiedzi gier
  SELECT count(*), count(*) FILTER (WHERE cardinality(pg_temp.fam_answer_invalid_chars(a.text)) > 0),
         count(*) FILTER (WHERE pg_temp.fam_answer_clean(a.text) = '')
  INTO n, m, k FROM public.answers a;
  RAISE NOTICE 'gry: odpowiedzi %, z niedozwolonymi znakami %, puste po oczyszczeniu %', n, m, k;
  FOR r IN SELECT g.type::text t, g.status::text s, count(*) c, count(DISTINCT g.id) gc
           FROM public.answers a JOIN public.questions q ON q.id=a.question_id JOIN public.games g ON g.id=q.game_id
           WHERE cardinality(pg_temp.fam_answer_invalid_chars(a.text)) > 0 GROUP BY 1,2 ORDER BY 1,2 LOOP
    RAISE NOTICE '  niedozwolone typ=% status=%: % odp. w % grach', r.t, r.s, r.c, r.gc;
  END LOOP;
  FOR r IN SELECT a.id aid, g.id gid, g.type::text t, g.status::text s, a.fixed_points p,
                  (SELECT count(*) FROM public.answers b WHERE b.question_id=a.question_id) siblings
           FROM public.answers a JOIN public.questions q ON q.id=a.question_id JOIN public.games g ON g.id=q.game_id
           WHERE pg_temp.fam_answer_clean(a.text) = '' ORDER BY g.id, a.id LIMIT 50 LOOP
    RAISE NOTICE '  pusta po oczyszczeniu: odp. % gra % (% / %), pkt %, odpowiedzi w pytaniu %', r.aid, r.gid, r.t, r.s, r.p, r.siblings;
  END LOOP;
  SELECT count(*), count(DISTINCT question_id) INTO n, m FROM (
    SELECT a.question_id, upper(pg_temp.fam_answer_clean(a.text)) c
    FROM public.answers a WHERE pg_temp.fam_answer_clean(a.text) <> ''
    GROUP BY 1,2 HAVING count(*) > 1 AND bool_or(cardinality(pg_temp.fam_answer_invalid_chars(a.text)) > 0)) s;
  RAISE NOTICE 'gry: kolizje tekstów wywołane oczyszczeniem: % (pytań %)', n, m;
  SELECT count(*) INTO n FROM (
    SELECT a.question_id, upper(a.text) FROM public.answers a GROUP BY 1,2 HAVING count(*) > 1) s;
  RAISE NOTICE 'gry: istniejące duplikaty tekstu w pytaniu (bez oczyszczania, wielkość liter pominięta): %', n;

  -- Szablony demo i Marketplace (pakiety, z których mogą powstać nowe gry)
  FOR r IN SELECT slot, lang,
                  (SELECT count(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'questions')='array' THEN payload->'questions' ELSE '[]' END) q
                    WHERE char_length(coalesce(q.value->>'text', q.value->'payload'->>'text')) > 100) qlong,
                  (SELECT count(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'questions')='array' THEN payload->'questions' ELSE '[]' END) q,
                     jsonb_array_elements(coalesce(q.value->'answers', q.value->'payload'->'answers', '[]')) a
                    WHERE cardinality(pg_temp.fam_answer_invalid_chars(a.value->>'text')) > 0) abad
           FROM public.demo_template_data ORDER BY slot, lang LOOP
    IF r.qlong > 0 OR r.abad > 0 THEN
      RAISE NOTICE 'demo %/%: pytania >100 %, odpowiedzi z niedozwolonymi %', r.slot, r.lang, r.qlong, r.abad;
    END IF;
  END LOOP;
  FOR r IN SELECT status::text s, coalesce(payload->'game'->>'type','(brak)') t, count(*) c FROM public.market_games GROUP BY 1,2 ORDER BY 1,2 LOOP
    RAISE NOTICE 'market_games status=% payload.type=%: %', r.s, r.t, r.c;
  END LOOP;
  SELECT count(*) FILTER (WHERE char_length(q.value->>'text') > 100),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(q.value->'answers','[]')) a
                                         WHERE cardinality(pg_temp.fam_answer_invalid_chars(a.value->>'text')) > 0))
  INTO n, m FROM public.market_games mg, jsonb_array_elements(CASE WHEN jsonb_typeof(mg.payload->'questions')='array' THEN mg.payload->'questions' ELSE '[]' END) q;
  RAISE NOTICE 'market_games: pytania >100 %, pytania z odpowiedzią z niedozwolonymi %', n, m;
  SELECT count(*) FILTER (WHERE g.source_market_id IS NULL), count(*) FILTER (WHERE g.source_market_id IS NOT NULL AND mg.id IS NULL)
  INTO n, m FROM public.games g LEFT JOIN public.market_games mg ON mg.id = g.source_market_id WHERE g.type = 'market';
  RAISE NOTICE 'gry market: bez source_market_id %, ze źródłem nieistniejącym %', n, m;

  -- Ankiety tekstowe: surowe wpisy (informacyjnie)
  SELECT count(*), count(*) FILTER (WHERE char_length(answer_raw) > 17),
         count(*) FILTER (WHERE cardinality(pg_temp.fam_answer_invalid_chars(answer_raw)) > 0)
  INTO n, m, k FROM public.poll_text_entries;
  RAISE NOTICE 'poll_text_entries: %, >17 znaków %, z niedozwolonymi %', n, m, k;

  -- Ochrona Control
  SELECT count(*) FILTER (WHERE ended_at IS NULL AND expires_at > now()), count(*) FILTER (WHERE ended_at IS NULL AND expires_at <= now())
  INTO n, m FROM public.control_runtime_sessions;
  RAISE NOTICE 'Control: sesje niewygasłe %, wygasłe niezamknięte %', n, m;
  SELECT count(DISTINCT g.id) INTO n FROM public.games g
  WHERE EXISTS (SELECT 1 FROM public.control_runtime_sessions c WHERE c.game_id = g.id AND c.ended_at IS NULL AND c.expires_at > now())
    AND (EXISTS (SELECT 1 FROM public.questions q WHERE q.game_id = g.id AND char_length(q.text) > 100)
      OR EXISTS (SELECT 1 FROM public.questions q JOIN public.answers a ON a.question_id = q.id
                 WHERE q.game_id = g.id AND cardinality(pg_temp.fam_answer_invalid_chars(a.text)) > 0));
  RAISE NOTICE 'Control: gry z niewygasłą sesją wymagające naprawy treści: %', n;
  SELECT count(*) INTO n FROM public.game_session_active;
  RAISE NOTICE 'game_session_active: %', n;
END $$;
