-- Token task:<id> respektuje odmowę, cofnięcie, odbiorcę i przebieg ankiety.
BEGIN;
CREATE OR REPLACE FUNCTION public._poll_assert_voter(p_game_id uuid,p_key text,p_voter_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.games%rowtype; t public.poll_tasks%rowtype; task_id uuid; registered uuid;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
 IF g.share_key_poll IS NULL OR g.share_key_poll IS DISTINCT FROM p_key THEN RAISE EXCEPTION 'Invalid poll key'; END IF;
 IF g.status::text<>'poll_open' THEN RAISE EXCEPTION 'Poll is not open'; END IF;
 IF p_voter_token IS NULL OR btrim(p_voter_token)='' THEN RAISE EXCEPTION 'Invalid voter token'; END IF;
 IF left(p_voter_token,5)<>'task:' THEN RETURN; END IF;
 BEGIN task_id:=substring(p_voter_token FROM 6)::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid task voter token'; END;
 SELECT * INTO t FROM public.poll_tasks WHERE id=task_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll
 OR t.poll_type IS DISTINCT FROM g.type::text THEN RAISE EXCEPTION 'Task expired'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF auth.uid() IS DISTINCT FROM t.recipient_user_id THEN RAISE EXCEPTION 'Not your task'; END IF;
 ELSE
  SELECT id INTO registered FROM public.profiles WHERE NOT is_guest
   AND public._norm_email(email)=public._norm_email(t.recipient_email);
  IF registered IS NOT NULL AND auth.uid() IS DISTINCT FROM registered THEN RAISE EXCEPTION 'Not your task'; END IF;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public._poll_assert_voter(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION "public"."poll_points_vote"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g public.games%rowtype;
  s_id uuid;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select * into g
  from public.games
  where id = p_game_id;

  if not found then
    raise exception 'Game not found';
  end if;

  if g.share_key_poll <> p_key then
    raise exception 'Invalid poll key';
  end if;

  if g.type <> 'poll_points'::game_type then
    raise exception 'Wrong game type';
  end if;

  if g.status <> 'poll_open'::game_status then
    raise exception 'Poll is not open';
  end if;

  select ps.id into s_id
  from public.poll_sessions ps
  where ps.game_id = p_game_id
    and ps.question_id = p_question_id
    and ps.is_open = true
  order by ps.created_at desc
  limit 1;

  if s_id is null then
    raise exception 'No open session';
  end if;

  insert into public.poll_votes (game_id, poll_session_id, question_id, answer_id, voter_token, question_ord, answer_ord)
  select
    p_game_id,
    s_id,
    q.id,
    a.id,
    p_voter_token,
    q.ord,
    a.ord
  from public.questions q
  join public.answers a on a.question_id = q.id
  where q.id = p_question_id
    and q.game_id = p_game_id
    and a.id = p_answer_id;

  if not found then
    raise exception 'Invalid question/answer';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_text_submit"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_voter_token" "text", "p_answer_raw" "text", "p_answer_norm" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g public.games%rowtype;
  s_id uuid;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select * into g
  from public.games
  where id = p_game_id;

  if not found then
    raise exception 'Game not found';
  end if;

  if g.share_key_poll <> p_key then
    raise exception 'Invalid poll key';
  end if;

  if g.type <> 'poll_text'::game_type then
    raise exception 'Wrong game type';
  end if;

  if g.status <> 'poll_open'::game_status then
    raise exception 'Poll is not open';
  end if;

  select ps.id into s_id
  from public.poll_sessions ps
  where ps.game_id = p_game_id
    and ps.question_id = p_question_id
    and ps.is_open = true
  order by ps.created_at desc
  limit 1;

  if s_id is null then
    raise exception 'No open session';
  end if;

  insert into public.poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
  values (p_game_id, s_id, p_question_id, p_voter_token, p_answer_raw, p_answer_norm);
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
end;
$$;

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

  return true;
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

  return true;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_vote_game"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g public.games;
  sess public.poll_sessions;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;
  if g.share_key_poll <> p_key then raise exception 'forbidden'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  -- aktywna sesja per pytanie (poll_sessions już masz)
  select * into sess
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if not found then
    insert into public.poll_sessions(game_id, question_id, is_open)
    values (p_game_id, p_question_id, true)
    returning * into sess;
  end if;

  insert into public.poll_votes(poll_session_id, voter_token, answer_id)
  values (sess.id, p_voter_token, p_answer_id)
  on conflict (poll_session_id, voter_token)
  do update set answer_id = excluded.answer_id;
end $$;

CREATE OR REPLACE FUNCTION "public"."poll_vote_points"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g record;
  sid uuid;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then raise exception 'game not found'; end if;
  if g.share_key_poll is distinct from p_key then raise exception 'bad key'; end if;
  if g.type <> 'poll_points' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  select id into sid
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if sid is null then raise exception 'poll closed'; end if;

  insert into public.poll_votes(game_id, poll_session_id, question_id, answer_id, voter_token)
  values (p_game_id, sid, p_question_id, p_answer_id, p_voter_token)
  on conflict (poll_session_id, question_id, voter_token)
  do update set
    answer_id = excluded.answer_id,
    created_at = now();
end;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_vote"("p_key" "text", "p_question_ord" integer, "p_answer_ord" integer, "p_voter_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  gid uuid;
  gtype public.game_type;
  gst public.game_status;
begin
  select g.id, g.type, g.status
  into gid, gtype, gst
  from public.games g
  where g.share_key_poll = p_key
  limit 1;

  if gid is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  if gtype = 'prepared' then
    return jsonb_build_object('ok', false, 'reason', 'no_poll');
  end if;

  if gst <> 'poll_open' then
    return jsonb_build_object('ok', false, 'reason', 'poll_closed');
  end if;

  perform public._poll_assert_voter(gid,p_key,p_voter_token);

  insert into public.poll_votes(game_id, question_ord, answer_ord, voter_token)
  values (gid, p_question_ord, p_answer_ord, p_voter_token)
  on conflict (game_id, question_ord, voter_token)
  do update set
    answer_ord = excluded.answer_ord,
    created_at = now();

  return jsonb_build_object('ok', true);
end $$;

-- Także bezpośredni INSERT właściciela podlega kontraktowi zastrzeżonego task:.
CREATE OR REPLACE FUNCTION public._poll_task_vote_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE gid uuid; key text;
BEGIN
 IF left(NEW.voter_token,5)='task:' THEN
  gid:=NEW.game_id;
  IF gid IS NULL THEN SELECT game_id INTO gid FROM public.poll_sessions WHERE id=NEW.poll_session_id; END IF;
  SELECT share_key_poll INTO key FROM public.games WHERE id=gid;
  PERFORM public._poll_assert_voter(gid,key,NEW.voter_token);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._poll_task_vote_write_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_poll_task_vote_guard ON public.poll_votes;
CREATE TRIGGER trg_poll_task_vote_guard BEFORE INSERT OR UPDATE OF voter_token,game_id,poll_session_id ON public.poll_votes
FOR EACH ROW EXECUTE FUNCTION public._poll_task_vote_write_guard();
DROP TRIGGER IF EXISTS trg_poll_task_text_guard ON public.poll_text_entries;
CREATE TRIGGER trg_poll_task_text_guard BEFORE INSERT OR UPDATE OF voter_token,game_id,poll_session_id ON public.poll_text_entries
FOR EACH ROW EXECUTE FUNCTION public._poll_task_vote_write_guard();
COMMIT;
