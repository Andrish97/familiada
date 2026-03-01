create table if not exists public.migrations_smoketest (
  id bigserial primary key,
  created_at timestamptz not null default now()
);