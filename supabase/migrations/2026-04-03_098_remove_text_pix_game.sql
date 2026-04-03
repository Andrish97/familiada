-- SUPERSEDES: 2026-04-03_097_fix_text_pix_functions.sql
-- Remove logo_text_pix demo from game table (seeded into user_logos by seed_demo_for_user)
-- Migration 097 already deletes user_logos text-pix entries and demo_template_data,
-- but this handles any remaining TEXT_PIX game entries.
DELETE FROM user_logos
WHERE type = 'PIX_150x70'
  AND payload->'source'->>'mode' = 'TEXT_PIX';
