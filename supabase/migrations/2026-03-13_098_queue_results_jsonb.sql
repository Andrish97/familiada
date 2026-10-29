-- 098: Change results column type to jsonb for better reliability
-- Array types in Postgres can sometimes be tricky with partial updates from JS.

ALTER TABLE public.game_gen_queue DROP COLUMN IF EXISTS results;
ALTER TABLE public.game_gen_queue ADD COLUMN IF NOT EXISTS results jsonb NOT NULL DEFAULT '[]'::jsonb;
