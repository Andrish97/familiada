-- Migration: Remove unused marketing_lead_config table
-- All configuration is now handled via Docker environment variables (.env file).

DROP TABLE IF EXISTS marketing_lead_config CASCADE;
