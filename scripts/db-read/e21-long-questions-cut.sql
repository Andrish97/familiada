-- E21: pytania >100 znaków (gry i bazy) -- ile mechaniczne ucięcie do 100
-- przetnie w środku słowa, ile da się uciąć na granicy słowa z ≥70 znakami
-- i ile ma w pierwszych 100 znakach koniec zdania (?/./!). Tylko liczby.
WITH p AS (
  SELECT 'gry' AS zrodlo, q.text AS t FROM public.questions q WHERE char_length(q.text) > 100
  UNION ALL
  SELECT 'bazy', q.payload->>'text' FROM public.qb_questions q
  WHERE jsonb_typeof(q.payload->'text') = 'string' AND char_length(q.payload->>'text') > 100
)
SELECT (zrodlo = 'gry') AS gry,
       count(*) AS pytania,
       max(char_length(t)) AS maks_dlugosc,
       count(*) FILTER (WHERE substr(t, 101, 1) !~ '[[:space:]]' AND substr(t, 100, 1) !~ '[[:space:]]') AS ciecie_w_slowie,
       count(*) FILTER (WHERE char_length(substring(left(t, 101) from '^(.*)[[:space:]]')) >= 70) AS granica_slowa_min_70,
       count(*) FILTER (WHERE left(t, 100) ~ '[?.!]') AS koniec_zdania_w_100
FROM p GROUP BY zrodlo
