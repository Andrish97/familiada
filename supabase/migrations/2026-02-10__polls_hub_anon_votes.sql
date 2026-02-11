-- 1) indeksy pod wydajność (opcjonalne, ale mocno zalecane)
create index if not exists idx_poll_votes_game_user_token
  on public.poll_votes (game_id, voter_user_id, voter_token);

create index if not exists idx_poll_text_entries_game_user_token
  on public.poll_text_entries (game_id, voter_user_id, voter_token);

create index if not exists idx_questions_game
  on public.questions (game_id);

-- 2) podmiana polls_hub_list_polls() tak, żeby anon_votes było liczone per-token (plus legacy)
create or replace function public.polls_hub_list_polls()
returns table(
  game_id uuid,
  name text,
  poll_type public.game_type,
  created_at timestamptz,
  poll_state text,
  sessions_total integer,
  open_questions integer,
  closed_questions integer,
  tasks_active integer,
  tasks_done integer,
  recipients_preview text[],
  share_key_poll text,
  share_kind text,
  anon_votes integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with my_polls as (
    select g.id, g.name, g.type, g.created_at, g.share_key_poll, g.status
    from public.games g
    where g.owner_id = auth.uid()
      and g.type in ('poll_text'::public.game_type, 'poll_points'::public.game_type)
  ),
  sess as (
    select
      ps.game_id,
      count(ps.id)::int as sessions_total,
      count(ps.id) filter (where ps.is_open = true and ps.closed_at is null)::int as open_questions,
      count(ps.id) filter (where ps.closed_at is not null)::int as closed_questions
    from public.poll_sessions ps
    group by ps.game_id
  ),
  tasks as (
    select
      pt.game_id,
      count(*) filter (where pt.status in ('pending','opened'))::int as tasks_active,
      count(*) filter (where pt.status = 'done')::int as tasks_done
    from public.poll_tasks pt
    where pt.owner_id = auth.uid()
    group by pt.game_id
  ),
  recipients as (
    select
      pt.game_id,
      (
        array_agg(
          coalesce(p.username, pt.recipient_email, '—')
          order by pt.created_at desc
        )
        filter (where pt.status in ('pending','opened'))
      )[1:6] as recipients_preview
    from public.poll_tasks pt
    left join public.profiles p on p.id = pt.recipient_user_id
    where pt.owner_id = auth.uid()
    group by pt.game_id
  ),
  qn as (
    select q.game_id, count(*)::int as qn
    from public.questions q
    group by q.game_id
  ),
  anon_raw as (
    -- bierzemy tylko anonimowe (voter_user_id is null), a taski wycinamy po voter_token
    select
      x.game_id,
      count(distinct x.voter_token) filter (
        where x.voter_token is not null
          and x.voter_token <> ''
          and x.voter_token not like 'task:%'
      )::int as anon_distinct_tokens,
      count(*) filter (
        where (x.voter_token is null or x.voter_token = '')
          and (x.voter_token is null or x.voter_token not like 'task:%')
      )::int as legacy_rows
    from (
      select v.game_id, v.voter_token, v.voter_user_id
      from public.poll_votes v
      where v.voter_user_id is null

      union all

      select e.game_id, e.voter_token, e.voter_user_id
      from public.poll_text_entries e
      where e.voter_user_id is null
    ) x
    group by x.game_id
  )
  select
    mp.id as game_id,
    mp.name,
    mp.type as poll_type,
    mp.created_at,
    case
      when mp.status = 'poll_open' then 'open'
      when mp.status = 'ready' then 'closed'
      when coalesce(s.sessions_total, 0) > 0 then 'closed'
      else 'draft'
    end as poll_state,
    coalesce(s.sessions_total, 0) as sessions_total,
    coalesce(s.open_questions, 0) as open_questions,
    coalesce(s.closed_questions, 0) as closed_questions,
    coalesce(t.tasks_active, 0) as tasks_active,
    coalesce(t.tasks_done, 0) as tasks_done,
    coalesce(r.recipients_preview, array[]::text[]) as recipients_preview,
    mp.share_key_poll,
    case
      when mp.status = 'poll_open' and coalesce(t.tasks_active,0) > 0 then 'mixed'
      when coalesce(t.tasks_active,0) > 0 then 'subs'
      else 'anon'
    end as share_kind,

    (
      coalesce(a.anon_distinct_tokens, 0)
      +
      coalesce(
        ceil(
          coalesce(a.legacy_rows, 0)::numeric
          / nullif(coalesce(q.qn, 0), 0)
        )::int,
        0
      )
    ) as anon_votes

  from my_polls mp
  left join sess s on s.game_id = mp.id
  left join tasks t on t.game_id = mp.id
  left join recipients r on r.game_id = mp.id
  left join qn q on q.game_id = mp.id
  left join anon_raw a on a.game_id = mp.id
  order by mp.created_at desc;
end;
$function$;
