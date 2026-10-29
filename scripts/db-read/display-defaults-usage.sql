-- Domyślne kolory i motyw w grach (liczby): ile gier bez motywu (= domyślny),
-- bez zapisanych kolorów i z kolorami równymi obecnym domyślnym.
SELECT count(*) AS gry,
       count(*) FILTER (WHERE settings->'display'->>'theme' IS NULL) AS bez_motywu,
       count(*) FILTER (WHERE settings->'display'->>'theme' = 'classic') AS classic,
       count(*) FILTER (WHERE settings->'display'->'colors' IS NULL) AS bez_kolorow,
       count(*) FILTER (WHERE settings->'display'->'colors' = '{"A":"#c4002f","B":"#2a62ff","BACKGROUND":"#d21180","DOT":"#d7ff3d"}'::jsonb) AS kolory_domyslne_male,
       count(*) FILTER (WHERE upper(settings->'display'->'colors'->>'A') = '#C4002F' AND upper(settings->'display'->'colors'->>'B') = '#2A62FF') AS druzyny_domyslne,
       count(*) FILTER (WHERE settings->'display'->>'theme' IS NULL AND settings->'display'->'colors' IS NULL) AS bez_motywu_i_kolorow,
       count(*) FILTER (WHERE is_demo) AS demo
FROM public.games
