CREATE OR REPLACE FUNCTION public.polls_badge_get()
 RETURNS TABLE(has_new boolean, tasks_pending integer, subs_pending integer, polls_open integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ov as (
    select public.polls_hub_overview() as j
  )
  select
    (
      coalesce((j->>'tasks_todo')::int, 0) > 0
      or coalesce((j->>'subs_mine_pending')::int, 0) > 0
    ) as has_new,
    coalesce((j->>'tasks_todo')::int, 0) as tasks_pending,
    coalesce((j->>'subs_mine_pending')::int, 0) as subs_pending,
    coalesce((j->>'polls_open')::int, 0) as polls_open
  from ov;
$function$;
