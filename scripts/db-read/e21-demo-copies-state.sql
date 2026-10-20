-- E21: kopie demo (gry) według slotu szablonu: ile zgodnych z obecnym
-- szablonem, ile z szablonem sprzed 409 (nocna poprawka), ile edytowanych,
-- ile z tych edytowanych niegrywalnych/niepodliczalnych. Slot jako numer:
-- 1 prepared, 2 poll_points_open, 3 poll_points_closed, 4 poll_points_draft,
-- 5 poll_text_open, 6 poll_text_closed, 7 poll_text_draft. Tylko liczby.
WITH s AS (
  SELECT t.slot, t.lang, t.payload,
         array_position(ARRAY['prepared','poll_points_open','poll_points_closed','poll_points_draft','poll_text_open','poll_text_closed','poll_text_draft'], t.slot) AS nr
  FROM public.demo_template_data t
  WHERE t.slot IN ('prepared','poll_points_open','poll_points_closed','poll_points_draft','poll_text_open','poll_text_closed','poll_text_draft')
), c AS (
  SELECT DISTINCT ON (g.id) g.id, g.status::text AS st, s.nr, s.slot, s.lang, s.payload, public.e21_demo_game_content(g.id) AS content
  FROM public.games g JOIN s ON s.payload->'game'->>'name' = g.name AND s.payload->'game'->>'type' = g.type::text
  WHERE g.is_demo
  ORDER BY g.id, s.lang
)
SELECT nr AS slot,
       count(*) AS kopie,
       count(*) FILTER (WHERE content = public.e21_demo_template_content(payload)) AS jak_obecny_szablon,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.e21_demo_templates_before b
                                      WHERE b.slot = c.slot AND content = public.e21_demo_template_content(b.payload))) AS jak_sprzed_409,
       count(*) FILTER (WHERE content <> public.e21_demo_template_content(payload)
                          AND NOT EXISTS (SELECT 1 FROM public.e21_demo_templates_before b
                                          WHERE b.slot = c.slot AND content = public.e21_demo_template_content(b.payload))) AS edytowane,
       count(*) FILTER (WHERE st = 'draft') AS szkice
FROM c GROUP BY nr ORDER BY nr
