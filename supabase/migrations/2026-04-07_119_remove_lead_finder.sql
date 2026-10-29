-- Migration: Usuń Lead Finder (cleanup)
DROP TABLE IF EXISTS lead_finder CASCADE;
DROP TABLE IF EXISTS lead_finder_config CASCADE;
DROP TABLE IF EXISTS lead_search_runs CASCADE;
DROP TABLE IF EXISTS search_queries CASCADE;
DROP TABLE IF EXISTS search_urls CASCADE;
