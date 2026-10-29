-- Czy dane produkcji spełniają nowe ograniczenia serwera (tests/sql/abuse-probes.sql): same liczby.
select
  (select count(*) from public.question_bases where char_length(coalesce(name, '')) > 80) as bases_name_over_80,
  (select count(*) from public.qb_questions where jsonb_typeof(payload->'answers') = 'array' and jsonb_array_length(payload->'answers') > 6) as qb_answers_over_6,
  (select count(*) from public.qb_questions q, jsonb_array_elements(case when jsonb_typeof(q.payload->'answers') = 'array' then q.payload->'answers' else '[]'::jsonb end) a
     where a ? 'fixed_points' and jsonb_typeof(a->'fixed_points') = 'number' and ((a->>'fixed_points')::numeric < 0 or (a->>'fixed_points')::numeric > 100)) as qb_points_out_of_range,
  (select count(*) from public.qb_questions q, jsonb_array_elements(case when jsonb_typeof(q.payload->'answers') = 'array' then q.payload->'answers' else '[]'::jsonb end) a
     where a ? 'fixed_points' and jsonb_typeof(a->'fixed_points') not in ('number', 'null')) as qb_points_not_number,
  (select count(*) from public.qb_tags where color is not null and color !~ '^#[0-9A-Fa-f]{6}$') as tags_color_not_hex6,
  (select count(*) from public.qb_question_tags qt join public.qb_questions q on q.id = qt.question_id join public.qb_tags t on t.id = qt.tag_id where t.base_id <> q.base_id) as tags_cross_base,
  (select count(*) from public.games where type = 'market' and source_market_id is null) as market_games_without_source,
  (select count(*) from public.games where type in ('poll_text', 'poll_points') and status = 'ready' and poll_closed_at is null) as poll_ready_without_close,
  (select count(*) from public.games where type in ('poll_text', 'poll_points') and status = 'ready') as poll_ready_all,
  (select max(octet_length(payload::text)) from public.qb_questions) as qb_payload_max_bytes
