-- Migration: 2026-04-05_100_fix_migration_checksums.sql
-- Purpose: Accept changes in already applied migrations by overriding their checksums.
-- This is a special instruction for the migration runner.

-- SUPERSEDES: 2026-03-09_040_demo_in_db.sql
-- SUPERSEDES: 2026-04-02_075_reset_and_fix_marketing_flag.sql
-- SUPERSEDES: 2026-04-05_098_add_source_mode_to_demo_templates.sql
-- SUPERSEDES: 2026-04-05_099_fix_restore_demo_logos_v2.sql

SELECT 1; -- Empty operation, just to satisfy the SQL requirement.
