-- E21: otwarte ankiety demo -- ile ma ≥10 pełnych ankiet (podliczalne),
-- ile mniej i ile z nich ma głosy spoza demo (prawdziwe -- celowo bez zmian).
SELECT (g.type = 'poll_points') AS punktowa,
       count(*) AS ankiety,
       count(*) FILTER (WHERE public._poll_full_submissions(g.id) >= 10) AS podliczalne,
       count(*) FILTER (WHERE public._poll_full_submissions(g.id) < 10) AS ponizej_10,
       count(*) FILTER (WHERE public._poll_full_submissions(g.id) < 10 AND (
         EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.game_id = g.id AND v.voter_token NOT LIKE 'demo_seed_v%')
         OR EXISTS (SELECT 1 FROM public.poll_text_entries e WHERE e.game_id = g.id AND e.voter_token NOT LIKE 'demo_seed_v%'))) AS ponizej_10_z_prawdziwymi_glosami
FROM public.games g
WHERE g.is_demo AND g.type IN ('poll_points', 'poll_text') AND g.status IN ('poll_open', 'poll_stopped')
GROUP BY 1 ORDER BY 1
