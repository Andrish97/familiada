-- ============================================================
-- 105: Unikalność pytań w market_games (producer + community)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.market_games
  ADD COLUMN IF NOT EXISTS questions_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS questions_fingerprint text;

CREATE OR REPLACE FUNCTION public.market_games_build_questions_text(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT string_agg(btrim(q.value->>'text'), E'\n' ORDER BY q.ordinality)
    FROM jsonb_array_elements(COALESCE(p_payload->'questions', '[]'::jsonb)) WITH ORDINALITY AS q(value, ordinality)
  ), '');
$$;

CREATE OR REPLACE FUNCTION public.market_games_compute_fingerprint(p_questions_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(
    regexp_replace(
      lower(coalesce(p_questions_text, '')),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.market_games_set_questions_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_qtext text;
BEGIN
  v_qtext := public.market_games_build_questions_text(NEW.payload);
  NEW.questions_text := v_qtext;
  NEW.questions_fingerprint := public.market_games_compute_fingerprint(v_qtext);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_games_questions_fields ON public.market_games;
CREATE TRIGGER trg_market_games_questions_fields
BEFORE INSERT OR UPDATE OF payload ON public.market_games
FOR EACH ROW
EXECUTE FUNCTION public.market_games_set_questions_fields();

UPDATE public.market_games
   SET questions_text = public.market_games_build_questions_text(payload),
       questions_fingerprint = public.market_games_compute_fingerprint(public.market_games_build_questions_text(payload))
 WHERE questions_text = '' OR questions_fingerprint IS NULL;

CREATE INDEX IF NOT EXISTS market_games_questions_fingerprint_idx
  ON public.market_games (lang, questions_fingerprint)
  WHERE questions_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_games_questions_text_trgm_idx
  ON public.market_games
  USING gin (questions_text gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.market_find_similar_questions(
  p_lang text,
  p_questions_text text,
  p_threshold real DEFAULT 0.45,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  title text,
  origin text,
  status public.market_game_status,
  author_username text,
  similarity real
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
    similarity(mg.questions_text, p_questions_text)::real AS similarity
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.lang = p_lang
    AND mg.status IN ('published', 'pending')
    AND similarity(mg.questions_text, p_questions_text) >= p_threshold
  ORDER BY similarity DESC, mg.created_at DESC
  LIMIT LEAST(p_limit, 50);
$$;
