-- Migracja 238 czyściła tylko questions.final, gdy lista faktycznie miała
-- wpisy. Nie łapała drugiego wariantu tego samego osierocenia: finał
-- wyłączony, finalQuestionsMode dalej "pick", ale questions.final już
-- puste — sama etykieta trybu zostaje "wisieć" bez żadnych danych za
-- sobą (widoczne w panelu jako "Pytania finału: Wybrane ręcznie" mimo
-- wyłączonego finału). Naprawia to globalnie, po warunku, bez odwołań
-- do konkretnych gier.

UPDATE public.games g
SET settings = jsonb_set(
  jsonb_set(g.settings, '{questions,final}', '[]'::jsonb),
  '{game,finalQuestionsMode}', '"random"'::jsonb
)
WHERE COALESCE((g.settings->'game'->>'hasFinal')::boolean, false) = false
  AND (
    g.settings->'game'->>'finalQuestionsMode' = 'pick'
    OR jsonb_array_length(COALESCE(g.settings->'questions'->'final', '[]'::jsonb)) > 0
  );
