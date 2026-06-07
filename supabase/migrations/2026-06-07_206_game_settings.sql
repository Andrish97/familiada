-- 206: Add per-game settings column to games table
--
-- Completely safe: ADD COLUMN IF NOT EXISTS with DEFAULT '{}'
-- leaves all existing data and queries intact.
-- Existing code does not select or update this column.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.games.settings IS
  'Per-game settings: teams, display, sound, questions';
