-- E21: odpowiedzi >17 znaków w bazach demo (liczby, bez treści).
SELECT count(*) AS odpowiedzi_dluzsze_niz_17,
       count(DISTINCT q.base_id) AS bazy,
       count(DISTINCT q.id) AS pytania
FROM public.question_bases b
JOIN public.qb_questions q ON q.base_id = b.id
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(q.payload->'answers') = 'array' THEN q.payload->'answers' ELSE '[]' END) a
WHERE b.is_demo AND char_length(a->>'text') > 17
