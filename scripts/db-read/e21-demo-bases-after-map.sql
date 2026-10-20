-- E21: 26 baz demo różnych od szablonu -- ile po podmianie starych odpowiedzi
-- (mapa 298, e21_demo_answer_map) ma pytania identyczne z szablonem, ile
-- różni się czymś jeszcze (edytowane). Kategorie i tagi osobno. Tylko liczby.
WITH t AS (
  SELECT (SELECT jsonb_agg(q->'payload' ORDER BY (q->>'ord')::int) FROM jsonb_array_elements(payload->'questions') q) AS qs,
         (SELECT jsonb_agg(c->>'name' ORDER BY c->>'name') FROM jsonb_array_elements(payload->'categories') c) AS cats,
         (SELECT jsonb_agg(x->>'name' ORDER BY x->>'name') FROM jsonb_array_elements(payload->'tags') x) AS tags
  FROM public.demo_template_data WHERE slot = 'base'
), b AS (
  SELECT b.id,
    (SELECT jsonb_agg(q.payload ORDER BY q.ord) FROM public.qb_questions q WHERE q.base_id = b.id) AS qs,
    (SELECT jsonb_agg(CASE WHEN jsonb_typeof(q.payload->'answers') = 'array' THEN jsonb_set(q.payload, '{answers}', coalesce((
        SELECT jsonb_agg(CASE WHEN public.e21_demo_answer_map() ? (a->>'text')
                              THEN jsonb_set(a, '{text}', public.e21_demo_answer_map()->(a->>'text')) ELSE a END ORDER BY i)
        FROM jsonb_array_elements(q.payload->'answers') WITH ORDINALITY AS z(a, i)), '[]'::jsonb)) ELSE q.payload END ORDER BY q.ord)
     FROM public.qb_questions q WHERE q.base_id = b.id) AS qs_mapped,
    (SELECT jsonb_agg(c.name ORDER BY c.name) FROM public.qb_categories c WHERE c.base_id = b.id) AS cats,
    (SELECT jsonb_agg(x.name ORDER BY x.name) FROM public.qb_tags x WHERE x.base_id = b.id) AS tags
  FROM public.question_bases b WHERE b.is_demo
)
SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.qs = b.qs)) AS rozne_przed,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.qs = b.qs)
                          AND EXISTS (SELECT 1 FROM t WHERE t.qs = b.qs_mapped)) AS po_mapie_jak_szablon,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.qs = b.qs_mapped)) AS edytowane_pytania,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.cats = b.cats AND t.tags = b.tags)) AS inne_kategorie_lub_tagi,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM t WHERE t.qs = b.qs_mapped)
                          AND NOT EXISTS (SELECT 1 FROM t WHERE t.cats = b.cats AND t.tags = b.tags)) AS pytania_ok_ale_kategorie_inne
FROM b
