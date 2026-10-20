-- 410: E21 — odczyt bazy pytań demo (szablon i kopie), tylko NOTICE.
-- 403 sprawdził w szablonie bazy demo tylko pytania >100 i znaki odpowiedzi;
-- tu pełne reguły bazy: pytanie ≤100, odpowiedź ≤17, znaki fontu, ≤6
-- odpowiedzi, punkty 0–100 i suma ≤100. Bez tekstów (liczby i ord).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    WITH q AS (
      SELECT t.lang, (x.q->>'ord')::int AS ord, x.q->'payload' AS p
      FROM public.demo_template_data t, jsonb_array_elements(coalesce(t.payload->'questions', '[]')) x(q)
      WHERE t.slot = 'base'
    )
    SELECT lang, count(*) AS qn,
      count(*) FILTER (WHERE char_length(p->>'text') > 100) AS q_long,
      count(*) FILTER (WHERE jsonb_array_length(coalesce(p->'answers', '[]')) > 6) AS a_many,
      sum((SELECT count(*) FROM jsonb_array_elements(coalesce(p->'answers', '[]')) a WHERE char_length(a->>'text') > 17)) AS a_long,
      sum((SELECT count(*) FROM jsonb_array_elements(coalesce(p->'answers', '[]')) a WHERE cardinality(public.fam_answer_invalid_chars(a->>'text')) > 0)) AS a_chars,
      sum((SELECT count(*) FROM jsonb_array_elements(coalesce(p->'answers', '[]')) a
           WHERE a ? 'fixed_points' AND jsonb_typeof(a->'fixed_points') = 'number' AND ((a->>'fixed_points')::numeric < 0 OR (a->>'fixed_points')::numeric > 100))) AS a_pts,
      count(*) FILTER (WHERE (SELECT coalesce(sum((a->>'fixed_points')::numeric), 0) FROM jsonb_array_elements(coalesce(p->'answers', '[]')) a
           WHERE jsonb_typeof(a->'fixed_points') = 'number') > 100) AS q_sum,
      string_agg(ord::text, ',' ORDER BY ord) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'answers', '[]')) a WHERE char_length(a->>'text') > 17)) AS ords_long
    FROM q GROUP BY lang ORDER BY lang
  LOOP
    RAISE NOTICE 'E21 szablon bazy demo %: pytań %, pytania >100 %, >6 odpowiedzi %, odpowiedzi >17 % (pytania: %), znaki %, punkty poza 0–100 %, suma >100 %',
      r.lang, r.qn, r.q_long, r.a_many, r.a_long, coalesce(r.ords_long, '-'), r.a_chars, r.a_pts, r.q_sum;
  END LOOP;

  FOR r IN
    SELECT b.is_demo, count(DISTINCT b.id) AS bases, count(q.id) AS qn,
      count(*) FILTER (WHERE char_length(q.payload->>'text') > 100) AS q_long,
      sum((SELECT count(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers') = 'array' THEN q.payload->'answers' ELSE '[]' END) a
           WHERE char_length(a->>'text') > 17)) AS a_long,
      count(DISTINCT b.id) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers') = 'array' THEN q.payload->'answers' ELSE '[]' END) a
           WHERE char_length(a->>'text') > 17)) AS bases_long
    FROM public.question_bases b JOIN public.qb_questions q ON q.base_id = b.id
    GROUP BY b.is_demo ORDER BY b.is_demo
  LOOP
    RAISE NOTICE 'E21 bazy is_demo=%: baz %, pytań %, pytania >100 %, odpowiedzi >17 % (w % bazach)',
      r.is_demo, r.bases, r.qn, r.q_long, r.a_long, r.bases_long;
  END LOOP;
END $$;
