-- ============================================================
-- 054: Dodaj wartość 'market' do game_type enum
--
-- ALTER TYPE ADD VALUE musi być w osobnej transakcji —
-- nowa wartość nie jest widoczna do czasu commita.
-- Backfill i funkcja są w migracji _055.
-- ============================================================

ALTER TYPE "public"."game_type" ADD VALUE IF NOT EXISTS 'market';
