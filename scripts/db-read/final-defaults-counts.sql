-- Gry wg zapisanego ustawienia finału i ekranu końcowego (liczby).
SELECT count(*) FILTER (WHERE settings->'game'->>'hasFinal' IS NULL) AS final_brak,
       count(*) FILTER (WHERE settings->'game'->>'hasFinal' = 'true') AS final_tak,
       count(*) FILTER (WHERE settings->'game'->>'hasFinal' = 'false') AS final_nie,
       count(*) FILTER (WHERE settings->'game'->'advanced'->>'endScreenMode' IS NULL) AS ekran_brak,
       count(*) FILTER (WHERE settings->'game'->'advanced'->>'endScreenMode' = 'logo') AS ekran_logo,
       count(*) FILTER (WHERE settings->'game'->'advanced'->>'endScreenMode' = 'points') AS ekran_punkty,
       count(*) FILTER (WHERE settings->'game'->'advanced'->>'endScreenMode' = 'money') AS ekran_kwota
FROM public.games WHERE type = 'prepared'
