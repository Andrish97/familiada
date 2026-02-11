create or replace function public.base_share_token_info(p_token text)
returns table(
  status text,
  base_id uuid,
  recipient_user_id uuid,
  recipient_email text,
  owner_id uuid,
  owner_email text,
  owner_username text
)
language sql
security definer
set search_path = public
as $$
  select
    t.status,
    t.base_id,
    t.recipient_user_id,
    t.recipient_email,
    t.owner_id,
    op.email as owner_email,
    op.username as owner_username
  from public.base_share_tasks t
  left join public.profiles op on op.id = t.owner_id
  where t.token::text = p_token
  limit 1;
$$;

grant execute on function public.base_share_token_info(text) to anon, authenticated;
