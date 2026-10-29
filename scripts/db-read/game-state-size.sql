-- Rozmiar wiersza game_state (bajty JSON) — do oceny przesyłania stanu przez WebRTC.
SELECT count(*) AS gry,
       round(avg(octet_length(row_to_json(g)::text))) AS sredni_bajty,
       max(octet_length(row_to_json(g)::text)) AS max_bajty,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY octet_length(row_to_json(g)::text)) AS p95_bajty
FROM public.game_state g
WHERE g.updated_at > now() - interval '30 days'
