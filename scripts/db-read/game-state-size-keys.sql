-- Rozbicie rozmiaru game_state.detail na klucze najwyższego poziomu (bajty
-- JSON, gry z ostatnich 30 dni): co dominuje w każdym zapisie i odczycie stanu.
SELECT count(DISTINCT g.game_id) AS gry,
       round(avg(octet_length(g.detail::text))) AS detail_sr,
       max(octet_length(g.detail::text)) AS detail_max,
       round(avg(octet_length(coalesce(g.detail->'rounds','null')::text))) AS rounds_sr,
       round(avg(octet_length(coalesce(g.detail->'final','null')::text))) AS final_sr,
       max(octet_length(coalesce(g.detail->'final','null')::text)) AS final_max,
       round(avg(octet_length(coalesce(g.detail->'settings','null')::text))) AS settings_sr,
       max(octet_length(coalesce(g.detail->'settings','null')::text)) AS settings_max,
       round(avg(octet_length(coalesce(g.detail->'display','null')::text))) AS display_sr,
       max(octet_length(coalesce(g.detail->'display','null')::text)) AS display_max,
       round(avg(octet_length(coalesce(g.detail->'host','null')::text))) AS host_sr,
       round(avg(octet_length(coalesce(g.detail->'teams','null')::text))) AS teams_sr,
       round(avg(octet_length(coalesce(g.detail->'locks','null')::text))) AS locks_sr
FROM public.game_state g
WHERE g.updated_at > now() - interval '30 days'
