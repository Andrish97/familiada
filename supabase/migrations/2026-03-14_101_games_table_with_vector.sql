-- 101: Games table with pg_vector
-- This migration creates the new unified 'games' table and enables pg_vector.

-- 1. Enable pg_vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the 'games' table
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'community', -- 'producer' or 'community'
  status text NOT NULL DEFAULT 'pending', -- 'draft', 'pending', 'published', 'rejected', 'archived'
  lang text NOT NULL,
  title text NOT NULL,
  description text,
  payload jsonb NOT NULL,
  embedding public.vector(384),
  tags text[],
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 3. Add indexes for performance
CREATE INDEX ON public.games (source);
CREATE INDEX ON public.games (status);
CREATE INDEX ON public.games (lang);
CREATE INDEX ON public.games USING gin (tags);
CREATE INDEX ON public.games USING ivfflat (embedding public.vector_l2_ops) WITH (lists = 100);

-- 4. Create the public view for players
CREATE OR REPLACE VIEW public.published_games AS
SELECT
  id,
  lang,
  source,
  title,
  description,
  tags
FROM
  public.games
WHERE
  status = 'published';

-- 5. Set up Row Level Security (RLS)
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Allow public read access to the published_games view
CREATE POLICY "Allow public read access to published games" ON public.games
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- Allow admin full access (will be used by Edge Functions with service_role_key)
CREATE POLICY "Allow admin full access" ON public.games
  FOR ALL
  USING (true)
  WITH CHECK (true);
