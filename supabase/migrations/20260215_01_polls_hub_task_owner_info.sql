-- 1) Drop starej wersji (zmiana RETURNS TABLE wymaga DROP)
DROP FUNCTION IF EXISTS public.polls_hub_list_tasks();

-- 2) Nowa wersja
CREATE OR REPLACE FUNCTION public.polls_hub_list_tasks()
RETURNS TABLE(
  task_id uuid,
  game_id uuid,
  game_name text,
  poll_type text,
  status text,
  created_at timestamptz,
  done_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  is_archived boolean,
  go_url text,
  owner_id uuid,
  owner_username text,
  owner_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  perform public.poll_claim_email_records();

  return query
  select
    t.id,
    t.game_id,
    coalesce(g.name, ('Sondaż ' || left(t.game_id::text, 8))::text) as game_name,
    t.poll_type,
    case
      when t.done_at is not null then 'done'
      when t.declined_at is not null then 'declined'
      when t.cancelled_at is not null then 'cancelled'
      else 'pending'
    end as status,
    t.created_at,
    t.done_at,
    t.declined_at,
    t.cancelled_at,
    (coalesce(t.done_at, t.declined_at, t.cancelled_at) < now() - interval '5 days') as is_archived,
    ('poll_go.html?t=' || t.token::text)::text,
    t.owner_id,
    p.username,
    p.email
  from public.poll_tasks t
  left join public.games g on g.id = t.game_id
  left join public.profiles p on p.id = t.owner_id
  where t.recipient_user_id = auth.uid()
  order by t.created_at desc;
end;
$$;


GRANT EXECUTE ON FUNCTION public.polls_hub_list_tasks() TO authenticated;
-- opcjonalnie:
-- GRANT EXECUTE ON FUNCTION public.polls_hub_list_tasks() TO anon;
