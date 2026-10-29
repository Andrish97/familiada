-- ============================================================
-- 108: market_games — embeddings semantyczne (pgvector)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.market_games
  ADD COLUMN IF NOT EXISTS embedding public.vector(384);

CREATE INDEX IF NOT EXISTS market_games_embedding_ivfflat_idx
  ON public.market_games
  USING ivfflat (embedding public.vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.market_find_similar_embeddings(
  p_lang text,
  p_embedding public.vector(384),
  p_threshold double precision DEFAULT 0.78,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(
  id uuid,
  title text,
  origin text,
  status public.market_game_status,
  author_username text,
  similarity double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    mg.id,
    mg.title,
    mg.origin::text AS origin,
    mg.status,
    COALESCE(pr.username, '') AS author_username,
    (1 - (mg.embedding <=> p_embedding))::double precision AS similarity
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.lang = p_lang
    AND mg.status IN ('published', 'pending')
    AND mg.embedding IS NOT NULL
    AND (1 - (mg.embedding <=> p_embedding)) >= p_threshold
  ORDER BY similarity DESC, mg.created_at DESC
  LIMIT LEAST(p_limit, 50);
$$;
