-- 097: Update game_gen_queue results column
-- Ensure 'results' column is used for storing generated games before user approval.

ALTER TABLE public.game_gen_queue DROP COLUMN IF EXISTS result;
ALTER TABLE public.game_gen_queue ADD COLUMN IF NOT EXISTS results jsonb[] NOT NULL DEFAULT '{}';
