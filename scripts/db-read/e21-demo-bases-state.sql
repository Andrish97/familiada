-- E21: bazy demo -- ile z pytaniami identycznymi z szablonem (dowolny język),
-- ile różnych (edytowane), ile z odpowiedziami >17. Tylko liczby.
WITH t AS (
  SELECT lang, (SELECT jsonb_agg(q->'payload' ORDER BY (q->>'ord')::int) FROM jsonb_array_elements(payload->'questions') q) AS qs,
         payload->'base'->>'name' AS name
  FROM public.demo_template_data WHERE slot = 'base'
), b AS (
  SELECT b.id, b.name,
         (SELECT jsonb_agg(q.payload ORDER BY q.ord) FROM public.qb_questions q WHERE q.base_id = b.id) AS qs,
         EXISTS (SELECT 1 FROM public.qb_questions q,
                   jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers') = 'array' THEN q.payload->'answers' ELSE '[]' END) a
                 WHERE q.base_id = b.id AND char_length(a->>'text') > 17) AS dlugie
  FROM public.question_bases b WHERE b.is_demo
)
SELECT count(*) AS bazy_demo,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM t WHERE t.qs = b.qs)) AS jak_szablon,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.qs = b.qs)) AS rozne,
       count(*) FILTER (WHERE dlugie) AS z_odpowiedziami_ponad_17,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM t WHERE t.name = b.name)) AS nazwa_jak_szablon
FROM b
