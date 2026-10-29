-- 096: Add processed_games column to track progress
-- This allows UI to show "3/10 games generated"

ALTER TABLE public.game_gen_queue ADD COLUMN IF NOT EXISTS processed_games integer NOT NULL DEFAULT 0;

-- Update existing jobs to 0 or total_games if completed
UPDATE public.game_gen_queue SET processed_games = total_games WHERE status = 'completed';
UPDATE public.game_gen_queue SET processed_games = 0 WHERE status = 'pending' OR status = 'processing';
