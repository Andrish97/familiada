-- 102: RPC function for vector similarity search

CREATE OR REPLACE FUNCTION find_similar_games(query_embedding vector(384), match_threshold float, match_count int)
RETURNS TABLE (id uuid, title text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT
    g.id,
    g.title,
    1 - (g.embedding <=> query_embedding) AS similarity
  FROM games AS g
  WHERE 1 - (g.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
