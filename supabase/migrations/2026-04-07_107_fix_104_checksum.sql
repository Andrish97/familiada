-- SUPERSEDES: 2026-04-07_104_fix_lead_finder_rls.sql
-- Naprawa checksum mismatch dla migracji 104 (dodano search_stop_requested)
INSERT INTO lead_finder_config (key, value) VALUES ('search_stop_requested', 'false')
ON CONFLICT (key) DO NOTHING;
