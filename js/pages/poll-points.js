create or replace function public.poll_close_and_normalize(p_game_id uuid, p_key text)
returns void
language plpgsql
security definer
as $function$
declare
  g public.games;
begin
  select * into g
  from public.games
  where id = p_game_id
    and share_key_poll = p_key
  limit 1;

  if not found then
    raise exception 'bad key or game';
  end if;

  if g.type <> 'poll_points'::public.game_type then
    raise exception 'poll_close_and_normalize works only for poll_points';
  end if;

  if g.status <> 'poll_open'::public.game_status then
    raise exception 'poll is not open';
  end if;

  if (select count(*) from public.questions where game_id = p_game_id) < 10 then
    raise exception 'Za mało pytań (min 10)';
  end if;

  /*
    Mapujemy ord->question_id i ord->answer_id, a głosy liczymy z poll_votes (ord-owo).
    Uwaga: działamy tylko na pytaniach 1..10.
  */

  with q10 as (
    select id as question_id, ord as qord
    from public.questions
    where game_id = p_game_id
      and ord between 1 and 10
  ),
  a as (
    select
      q10.question_id,
      q10.qord,
      an.id as answer_id,
      an.ord as aord
    from q10
    join public.answers an
      on an.question_id = q10.question_id
    where an.ord between 1 and 6
  ),
  c as (
    select
      a.question_id,
      a.answer_id,
      a.qord,
      a.aord,
      coalesce(count(v.id), 0)::int as cnt
    from a
    left join public.poll_votes v
      on v.game_id = p_game_id
     and v.question_ord = a.qord
     and v.answer_ord  = a.aord
    group by a.question_id, a.answer_id, a.qord, a.aord
  ),
  c_fixed as (
    select
      question_id,
      answer_id,
      qord,
      aord,
      case when cnt = 0 then 1 else cnt end as cnt1
    from c
  ),
  tot as (
    select question_id, sum(cnt1)::int as total
    from c_fixed
    group by question_id
  ),
  raw as (
    select
      cf.question_id,
      cf.answer_id,
      cf.aord,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) as raw_p,
      floor(100.0 * cf.cnt1 / nullif(t.total, 0))::int as base_floor,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) - floor(100.0 * cf.cnt1 / nullif(t.total, 0)) as frac
    from c_fixed cf
    join tot t on t.question_id = cf.question_id
  ),
  base as (
    select
      question_id,
      answer_id,
      aord,
      greatest(1, base_floor) as p0,
      frac
    from raw
  ),
  sum_base as (
    select question_id, sum(p0)::int as s0
    from base
    group by question_id
  ),
  need as (
    select
      b.question_id,
      b.answer_id,
      b.aord,
      b.p0,
      b.frac,
      (100 - sb.s0)::int as diff
    from base b
    join sum_base sb on sb.question_id = b.question_id
  ),
  ranked_plus as (
    select
      n.*,
      row_number() over (partition by question_id order by frac desc, aord asc) as rn_plus
    from need n
  ),
  ranked_minus as (
    select
      n.*,
      row_number() over (partition by question_id order by p0 desc, frac asc, aord desc) as rn_minus
    from need n
    where p0 > 1
  ),
  final as (
    select
      n.answer_id,
      case
        when n.diff > 0 then
          n.p0 + case when rp.rn_plus <= n.diff then 1 else 0 end
        when n.diff < 0 then
          n.p0 - case
            when rm.rn_minus is not null and rm.rn_minus <= abs(n.diff) then 1
            else 0
          end
        else
          n.p0
      end as p_final
    from need n
    left join ranked_plus rp
      on rp.question_id = n.question_id and rp.answer_id = n.answer_id
    left join ranked_minus rm
      on rm.question_id = n.question_id and rm.answer_id = n.answer_id
  )
  update public.answers aup
  set fixed_points = f.p_final
  from final f
  where aup.id = f.answer_id;

  -- zamknij sesje
  update public.poll_sessions
  set is_open = false,
      closed_at = now()
  where game_id = p_game_id
    and is_open = true;

  -- zamknij grę
  update public.games
  set status = 'ready'::public.game_status,
      poll_closed_at = now()
  where id = p_game_id;

end;
$function$;
