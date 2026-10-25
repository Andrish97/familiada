with reports as materialized (
 select g.id,public.market_uniqueness_report(g.id) r
 from public.market_games g where g.status='published'
)
select
 (select count(*) from public.market_games where status='published') as published,
 (select count(*) from public.market_game_questions q join public.market_games g on g.id=q.game_id where g.status in ('pending','published')) as active_questions,
 (select count(*) from public.market_game_questions q join public.market_games g on g.id=q.game_id where g.status in ('pending','published') and q.embedding_model='paraphrase-multilingual-minilm-l12-v2-qa-v1' and q.embedding is not null) as indexed_questions,
 (select count(*) from reports where (r->>'ok')::boolean) as valid_reports,
 (select count(*) from reports where (r->'semantic'->>'complete')::boolean) as complete_semantic_reports,
 exists(select 1 from pg_indexes where schemaname='public' and indexname='market_games_active_content_unique') as exact_guard_installed,
 has_table_privilege('authenticated','public.market_games','INSERT') as users_can_insert_directly,
 (select count(*) from (select content_key from public.market_games where status in ('pending','published') and content_key is not null group by content_key having count(*)>1) duplicates) as active_duplicate_groups
