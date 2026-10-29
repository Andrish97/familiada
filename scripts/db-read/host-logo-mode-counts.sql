-- Ile gier ma zapisany tryb logo Prowadzącego (liczby): piksele, źródło, brak.
SELECT count(*) FILTER (WHERE settings->'display'->>'hostLogoMode' = 'pixel') AS pixel,
       count(*) FILTER (WHERE settings->'display'->>'hostLogoMode' = 'source') AS source,
       count(*) FILTER (WHERE settings->'display'->>'hostLogoMode' IS NULL) AS brak,
       count(*) FILTER (WHERE settings->'display'->>'hostLogoMode' = 'pixel' AND settings->'display'->>'logoId' IS NULL) AS pixel_logo_domyslne
FROM public.games
