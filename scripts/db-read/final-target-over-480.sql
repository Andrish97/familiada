-- Gry z zapisanym celem finału powyżej 480 (liczby).
SELECT count(*) FILTER (WHERE (settings->'game'->'advanced'->>'finalTarget')::int > 480) AS cel_powyzej_480,
       count(*) FILTER (WHERE (settings->'game'->'advanced'->>'finalTarget')::int > 200) AS cel_powyzej_200,
       max((settings->'game'->'advanced'->>'finalTarget')::int) AS cel_max
FROM public.games WHERE settings->'game'->'advanced'->>'finalTarget' ~ '^[0-9]+$'
