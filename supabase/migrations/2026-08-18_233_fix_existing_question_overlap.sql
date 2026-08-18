-- Jednorazowa naprawa danych: przed migracją 232-ową poprawką w
-- game-settings.js/app.js nic nie pilnowało, żeby pytanie nie trafiło
-- jednocześnie do finału i do rund, ani żeby finał ręczny miał
-- skompletowane 5 pytań. Sprawdzono zapytaniami SELECT (bez zmian) —
-- znaleziono 4 gry z nakładaniem się pytań i 1 grę z niedokończonym
-- wyborem finału. Ta migracja naprawia oba przypadki jednorazowo, w
-- tych konkretnych, już istniejących wierszach.

-- 1) Nakładanie się pytań: usuń z questions.rounds te, które są też
--    w questions.final (finał zawsze wygrywa — ta sama reguła, co przy
--    zapisie ustawień). Kolejność pozostałych pytań rund zachowana.
UPDATE public.games g
SET settings = jsonb_set(
  g.settings,
  '{questions,rounds}',
  (
    SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(g.settings->'questions'->'rounds') WITH ORDINALITY AS t(elem, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(g.settings->'questions'->'final') f
      WHERE f->>'id' = elem->>'id'
    )
  )
)
WHERE g.settings->'game'->>'finalQuestionsMode' = 'pick'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(g.settings->'questions'->'final', '[]'::jsonb)) f
    JOIN jsonb_array_elements(COALESCE(g.settings->'questions'->'rounds', '[]'::jsonb)) r
      ON f->>'id' = r->>'id'
  );

-- 2) Niedokończony wybór finału: finał włączony w trybie ręcznym, ale
--    bez skompletowanych 5 pytań — gra nigdy by nie odpaliła finału
--    (host dowiadywałby się dopiero w trakcie rozgrywki). Nie da się
--    zgadnąć, jakie pytania host chciał wybrać, więc bezpiecznym
--    naprawieniem jest wyłączenie finału — host może go z powrotem
--    włączyć i poprawnie skonfigurować w ustawieniach (zapis bez
--    pełnych 5 pytań jest już zablokowany).
UPDATE public.games g
SET settings = jsonb_set(g.settings, '{game,hasFinal}', 'false'::jsonb)
WHERE g.settings->'game'->>'hasFinal' = 'true'
  AND g.settings->'game'->>'finalQuestionsMode' = 'pick'
  AND COALESCE(jsonb_array_length(g.settings->'questions'->'final'), 0) <> 5;
