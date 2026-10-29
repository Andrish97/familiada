-- Jednorazowa naprawa danych: przed poprawką w game-settings.js/app.js
-- nic nie czyściło questions.final przy wyłączeniu finału (hasFinal=false).
-- Taka martwa lista wykluczała te pytania z puli rund zarówno w panelu
-- ustawień, jak i w realnej rozgrywce (Control), mimo że finał się nigdy
-- nie odpalał. Ta migracja: (1) czyści questions.final tam, gdzie finał
-- jest wyłączony, (2) dokłada z powrotem do questions.rounds te pytania
-- gry, których tam jeszcze nie ma (czyli właśnie te niesłusznie wykluczone).

UPDATE public.games g
SET settings = jsonb_set(
  jsonb_set(g.settings, '{questions,final}', '[]'::jsonb),
  '{questions,rounds}',
  COALESCE(g.settings->'questions'->'rounds', '[]'::jsonb)
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'text', q.text) ORDER BY q.ord)
      FROM public.questions q
      WHERE q.game_id = g.id
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(g.settings->'questions'->'rounds', '[]'::jsonb)) r
          WHERE r->>'id' = q.id::text
        )
    ), '[]'::jsonb)
)
WHERE COALESCE((g.settings->'game'->>'hasFinal')::boolean, false) = false
  AND jsonb_array_length(COALESCE(g.settings->'questions'->'final', '[]'::jsonb)) > 0;
