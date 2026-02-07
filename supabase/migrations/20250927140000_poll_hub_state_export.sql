CREATE OR REPLACE FUNCTION public.game_action_state(p_game_id uuid)
 RETURNS TABLE(game_id uuid, rev timestamp with time zone, can_edit boolean, needs_reset_warning boolean, can_play boolean, can_poll boolean, can_export boolean, reason_play text, reason_poll text)
 LANGUAGE sql
 STABLE
AS $function$
with g as (
  select id, type, status, updated_at
  from public.games
  where id = p_game_id
),
qs as (
  select id, ord
  from public.questions
  where game_id = p_game_id
),
ans as (
  select
    a.question_id,
    count(*) as cnt,
    min(coalesce(a.fixed_points,0)) as minp,
    max(coalesce(a.fixed_points,0)) as maxp,
    sum(coalesce(a.fixed_points,0)) as sump
  from public.answers a
  join qs on qs.id = a.question_id
  group by a.question_id
),
agg as (
  select
    coalesce((select count(*) from qs), 0) as qn,
    coalesce((select min(cnt) from ans), 0) as an_min,
    coalesce((select max(cnt) from ans), 0) as an_max,
    coalesce((select bool_or(sump > 100) from ans), false) as sum_too_big,
    coalesce((select bool_or(minp < 0) from ans), false) as neg_pts,
    coalesce((select bool_or(maxp > 100) from ans), false) as over_pts
)
select
  g.id as game_id,
  g.updated_at as rev,

  /* EDIT — zgodnie z canEnterEdit() */
  case
    when g.type = 'prepared' then true
    when g.status = 'poll_open' then false
    else true
  end as can_edit,

  /* warning resetu tylko dla poll_* w READY */
  (g.type <> 'prepared' and g.status = 'ready') as needs_reset_warning,

  /* PLAY — zgodnie z validateGameReadyToPlay() */
  case
    when g.type in ('poll_text','poll_points') then (g.status = 'ready')
    when g.type = 'prepared' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
      and not (select sum_too_big from agg)
      and not (select neg_pts from agg)
      and not (select over_pts from agg)
    else false
  end as can_play,

  /* POLL — zgodnie z validatePollEntry() + validatePollReadyToOpen() */
  case
    when g.type = 'prepared' then false
    when g.type = 'poll_text' then (select qn from agg) >= 10
    when g.type = 'poll_points' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
    else false
  end as can_poll,

  /* eksport: blokuj gdy sondaż otwarty */
  case
    when g.status = 'poll_open' then false
    else true
  end as can_export,

  /* reason_play (opcjonalnie) */
  case
    when g.type in ('poll_text','poll_points') and g.status <> 'ready'
      then 'Gra dostępna dopiero po zamknięciu sondażu.'
    when g.type = 'prepared' and (select qn from agg) < 10
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'prepared' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    when g.type = 'prepared' and (select neg_pts from agg)
      then 'Punkty nie mogą być ujemne.'
    when g.type = 'prepared' and (select over_pts from agg)
      then 'Odpowiedź nie może mieć > 100 pkt.'
    when g.type = 'prepared' and (select sum_too_big from agg)
      then 'Suma punktów w pytaniu nie może przekroczyć 100.'
    else null
  end as reason_play,

  /* reason_poll (opcjonalnie) */
  case
    when g.type = 'prepared'
      then 'Preparowany nie ma sondażu.'
    when (g.type in ('poll_text','poll_points') and (select qn from agg) < 10)
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'poll_points' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    else null
  end as reason_poll
from g, agg;
$function$;

CREATE OR REPLACE FUNCTION public.polls_hub_list_polls()
 RETURNS TABLE(game_id uuid, name text, poll_type game_type, created_at timestamp with time zone, poll_state text, sessions_total integer, open_questions integer, closed_questions integer, tasks_active integer, tasks_done integer, recipients_preview text[], share_key_poll text, share_kind text, anon_votes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    case
      when mp.type = 'poll_points'::public.game_type then (
        select count(*)::int
        from public.poll_votes v
        where v.game_id = mp.id and v.voter_user_id is null
      )
      else (
        select count(*)::int
        from public.poll_text_entries e
        where e.game_id = mp.id and e.voter_user_id is null
      )
    end as anon_votes
  from my_polls mp
  left join sess s on s.game_id = mp.id
  left join tasks t on t.game_id = mp.id
  left join recipients r on r.game_id = mp.id
  order by mp.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.poll_admin_delete_vote(p_game_id uuid, p_voter_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  u uuid;
  deleted_points int := 0;
  deleted_text int := 0;
  task_id uuid;
BEGIN
  u := auth.uid();
  IF u IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = p_game_id AND g.owner_id = u
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  DELETE FROM public.poll_votes
   WHERE game_id = p_game_id
     AND voter_token = p_voter_token;
  GET DIAGNOSTICS deleted_points = ROW_COUNT;

  DELETE FROM public.poll_text_entries
   WHERE game_id = p_game_id
     AND voter_token = p_voter_token;
  GET DIAGNOSTICS deleted_text = ROW_COUNT;

  IF p_voter_token LIKE 'task:%' THEN
    BEGIN
      task_id := nullif(split_part(p_voter_token, ':', 2), '')::uuid;
    EXCEPTION WHEN others THEN
      task_id := null;
    END;

    IF task_id IS NOT NULL THEN
      UPDATE public.poll_tasks
        SET status = 'pending',
            done_at = null,
            opened_at = null,
            declined_at = null,
            cancelled_at = null
      WHERE id = task_id AND owner_id = u;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_poll_votes', deleted_points,
    'deleted_poll_text_entries', deleted_text
  );
END;
$function$;
