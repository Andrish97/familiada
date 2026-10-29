/* ============================================================================
  MIGRATION: 2026-03-01_010_example_add_table.sql
  PURPOSE  : Example migration template (Familiada)
  RULES    :
    - forward-only
    - must be idempotent where possible (IF EXISTS / IF NOT EXISTS)
    - wrap in transaction in runner (runner uses psql -1)
    - keep changes small + readable
============================================================================ */

-- Optional: fast fail on mistakes in psql (runner uses ON_ERROR_STOP=1 anyway)
-- \set ON_ERROR_STOP on

-- 1) Schema changes (tables/cols/indexes)
create table if not exists public.example_table (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Example: adding a column safely
alter table public.example_table
  add column if not exists notes text;

-- Example: index safely
create index if not exists example_table_created_at_idx
  on public.example_table (created_at desc);

-- 2) Data migrations (be careful: keep them bounded)
-- update public.example_table set notes = '...' where notes is null;

-- 3) RLS / grants (only if needed)
-- alter table public.example_table enable row level security;

-- 4) Functions / triggers (prefer CREATE OR REPLACE)
-- create or replace function public.example_fn() returns void ...

-- 5) Post-checks (optional, but nice)
-- do $$ begin
--   if not exists (select 1 from information_schema.tables
--                  where table_schema='public' and table_name='example_table') then
--     raise exception 'post-check failed: table not created';
--   end if;
-- end $$;

-- END
