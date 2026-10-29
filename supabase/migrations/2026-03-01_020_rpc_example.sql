/* ============================================================================
  MIGRATION: 2026-03-01_020_rpc_example.sql
============================================================================ */

create or replace function public.rpc_example(p_x int)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_x + 1;
$$;

revoke all on function public.rpc_example(int) from public;
grant execute on function public.rpc_example(int) to anon, authenticated;