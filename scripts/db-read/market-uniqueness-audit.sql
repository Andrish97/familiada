select
  count(*) filter (where status = 'published') as published,
  count(*) filter (where status = 'pending') as pending,
  count(*) filter (where status in ('published','pending') and embedding is not null) as active_embedded,
  count(*) filter (where status in ('published','pending') and embedding is null) as active_no_embedding,
  count(*) filter (where status = 'published' and lang = 'pl' and embedding is not null) as pl_embedded,
  count(*) filter (where status = 'published' and lang = 'en' and embedding is not null) as en_embedded,
  count(*) filter (where status = 'published' and lang = 'uk' and embedding is not null) as uk_embedded,
  count(*) filter (where status in ('published','pending') and coalesce(questions_text,'') = '') as active_empty_questions_text,
  count(*) filter (where status in ('published','pending') and questions_fingerprint is null) as active_missing_fingerprint,
  count(*) filter (where status in ('published','pending') and questions_text is distinct from public.market_games_build_questions_text(payload)) as active_stale_questions_text,
  count(*) filter (where status in ('published','pending') and questions_fingerprint is distinct from public.market_games_compute_fingerprint(public.market_games_build_questions_text(payload))) as active_stale_fingerprint,
  count(*) filter (where status in ('published','pending') and embedding is not null and (embedding <#> embedding) = 0) as active_zero_embedding,
  (select count(*) from (select lang, questions_fingerprint from public.market_games where status in ('published','pending') and questions_fingerprint is not null group by lang, questions_fingerprint having count(*) > 1) d) as same_questions_groups,
  (select coalesce(sum(n - 1),0) from (select count(*) n from public.market_games where status in ('published','pending') and questions_fingerprint is not null group by lang, questions_fingerprint having count(*) > 1) d) as same_questions_extra_games,
  (select count(*) from (select lang, lower(btrim(title)) from public.market_games where status in ('published','pending') group by lang, lower(btrim(title)) having count(*) > 1) d) as same_title_groups
from public.market_games
