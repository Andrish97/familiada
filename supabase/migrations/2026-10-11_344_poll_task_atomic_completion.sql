-- Ostatnia paczka głosów i wykonanie zadania w jednej transakcji.
BEGIN;
CREATE OR REPLACE FUNCTION public._poll_task_has_all_votes(p_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.questions WHERE game_id=t.game_id)
 AND NOT EXISTS(SELECT 1 FROM public.questions q WHERE q.game_id=t.game_id AND NOT (
  CASE t.poll_type WHEN 'poll_text' THEN EXISTS(
   SELECT 1 FROM public.poll_text_entries v JOIN public.poll_sessions s ON s.id=v.poll_session_id
   WHERE v.game_id=t.game_id AND v.question_id=q.id AND v.voter_token=public.poll_task_voter_token(t.id)
    AND s.game_id=t.game_id AND s.question_id=q.id AND s.is_open)
  WHEN 'poll_points' THEN EXISTS(
   SELECT 1 FROM public.poll_votes v JOIN public.poll_sessions s ON s.id=v.poll_session_id
   WHERE v.game_id=t.game_id AND v.question_id=q.id AND v.voter_token=public.poll_task_voter_token(t.id)
    AND s.game_id=t.game_id AND s.question_id=q.id AND s.is_open)
  ELSE false END))
 FROM public.poll_tasks t WHERE t.id=p_task_id
$$;
REVOKE ALL ON FUNCTION public._poll_task_has_all_votes(uuid) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public._poll_task_change(p_token uuid,p_action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.poll_tasks%rowtype; g public.games%rowtype; uid uuid:=auth.uid(); registered uuid;
BEGIN
 IF p_action NOT IN ('open','decline','done') OR p_action IS NULL THEN RETURN 'invalid_action'; END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE token=p_token;
 IF NOT FOUND THEN RETURN 'not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=t.game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 'expired'; END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN 'not_found'; END IF;
 IF t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll
 OR t.poll_type IS DISTINCT FROM g.type::text THEN RETURN 'expired'; END IF;
 IF g.status::text='poll_stopped' THEN RETURN 'poll_stopped'; END IF;
 IF g.status::text='ready' THEN RETURN 'poll_closed'; END IF;
 IF g.status::text<>'poll_open' THEN RETURN 'expired'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF uid IS DISTINCT FROM t.recipient_user_id THEN RETURN 'not_your_task'; END IF;
 ELSE
  SELECT id INTO registered FROM public.profiles WHERE NOT is_guest
   AND public._norm_email(email)=public._norm_email(t.recipient_email);
  IF registered IS NOT NULL AND uid IS DISTINCT FROM registered THEN RETURN 'not_your_task'; END IF;
 END IF;
 IF p_action='done' AND t.status='done' AND t.done_at IS NOT NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL THEN RETURN 'ok'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RETURN 'already_used'; END IF;
 IF p_action='done' AND NOT public._poll_task_has_all_votes(t.id) THEN RETURN 'votes_incomplete'; END IF;
 IF p_action='decline' THEN
  DELETE FROM public.poll_votes WHERE game_id=t.game_id AND voter_token=public.poll_task_voter_token(t.id);
  DELETE FROM public.poll_text_entries WHERE game_id=t.game_id AND voter_token=public.poll_task_voter_token(t.id);
 END IF;
 UPDATE public.poll_tasks SET
  status=CASE p_action WHEN 'decline' THEN 'declined' WHEN 'done' THEN 'done' ELSE 'opened' END,
  opened_at=coalesce(opened_at,now()),
  declined_at=CASE WHEN p_action='decline' THEN coalesce(declined_at,now()) ELSE declined_at END,
  done_at=CASE WHEN p_action='done' THEN now() ELSE done_at END
 WHERE id=t.id;
 RETURN 'ok';
END; $$;


CREATE OR REPLACE FUNCTION public._poll_task_finish_batch(p_game_id uuid,p_key text,p_voter_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid uuid;
BEGIN
 IF left(p_voter_token,5)<>'task:' THEN RETURN; END IF;
 -- Zachowujemy SHARE rodzica → UPDATE potomka, bez upgrade rodzica do UPDATE.
 PERFORM public._poll_assert_voter(p_game_id,p_key,p_voter_token);
 tid:=substring(p_voter_token FROM 6)::uuid;
 IF public._poll_task_has_all_votes(tid) THEN
  UPDATE public.poll_tasks SET status='done',done_at=now(),opened_at=coalesce(opened_at,now()) WHERE id=tid;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public._poll_task_finish_batch(uuid,text,text) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION "public"."poll_text_submit_batch"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  it jsonb;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for it in
    select * from jsonb_array_elements(p_items)
  loop
    perform public.poll_text_submit(
      p_game_id      => p_game_id,
      p_key          => p_key,
      p_question_id  => (it->>'question_id')::uuid,
      p_voter_token  => p_voter_token,
      p_answer_raw   => it->>'answer_raw',
      p_answer_norm  => it->>'answer_norm'
    );
  end loop;
  perform public._poll_task_finish_batch(p_game_id,p_key,p_voter_token);

end;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_points_vote_batch"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  it jsonb;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for it in
    select * from jsonb_array_elements(p_items)
  loop
    perform public.poll_points_vote(
      p_game_id      => p_game_id,
      p_key          => p_key,
      p_question_id  => (it->>'question_id')::uuid,
      p_answer_id    => (it->>'answer_id')::uuid,
      p_voter_token  => p_voter_token
    );
  end loop;
  perform public._poll_task_finish_batch(p_game_id,p_key,p_voter_token);

end;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_text_submit_batch_owner"("p_game_id" "uuid", "p_items" "jsonb", "p_voter_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  -- 315: tylko otwarta ankieta (zatrzymana nie przyjmuje wpisów)
  if (select status from games where id=p_game_id) <> 'poll_open' then
    raise exception 'Game not open';
  end if;

  perform public._poll_assert_voter(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);

  insert into poll_text_entries (
    game_id,
    poll_session_id,
    question_id,
    voter_token,
    answer_raw,
    answer_norm
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    p_voter_token,
    coalesce(x->>'answer_raw',''),
    coalesce(x->>'answer_norm','')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  perform public._poll_task_finish_batch(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);
  return true;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_points_vote_batch_owner"("p_game_id" "uuid", "p_items" "jsonb", "p_voter_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  -- 315: tylko otwarta ankieta (zatrzymana nie przyjmuje głosów)
  if (select status from games where id=p_game_id) <> 'poll_open' then
    raise exception 'Game not open';
  end if;

  perform public._poll_assert_voter(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);

  insert into poll_votes (
    game_id,
    poll_session_id,
    question_id,
    answer_id,
    voter_token,
    question_ord,
    answer_ord
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    (x->>'answer_id')::uuid,
    p_voter_token,
    coalesce((x->>'question_ord')::int, 1),
    coalesce((x->>'answer_ord')::int, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  perform public._poll_task_finish_batch(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);
  return true;
end;
$$;
COMMIT;
