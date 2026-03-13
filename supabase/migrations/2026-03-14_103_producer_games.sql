-- 103: Create producer_games table with pg_vector

-- 1. Enable pg_vector extension if not already done
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the 'producer_games' table
CREATE TABLE public.producer_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  lang text NOT NULL,
  title text NOT NULL,
  description text,
  payload jsonb NOT NULL,
  embedding public.vector(384),
  tags text[]
);

-- 3. Add indexes
CREATE INDEX ON public.producer_games (lang);
CREATE INDEX ON public.producer_games USING ivfflat (embedding public.vector_l2_ops) WITH (lists = 100);

-- 4. Update the public view to include producer games
CREATE OR REPLACE VIEW public.published_games AS
  SELECT id, lang, 'community' AS source, title, description, tags FROM public.games WHERE status = 'published'
  UNION ALL
  SELECT id, lang, 'producer' AS source, title, description, tags FROM public.producer_games;

-- 5. RLS for producer_games
ALTER TABLE public.producer_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to producer games" ON public.producer_games
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Allow admin full access to producer games" ON public.producer_games
  FOR ALL
  USING (true)
  WITH CHECK (true);
