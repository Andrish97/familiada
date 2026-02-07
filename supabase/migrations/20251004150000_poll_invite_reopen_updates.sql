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
      DELETE FROM public.poll_tasks
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

CREATE OR REPLACE FUNCTION public.poll_go_subscribe_email(p_token uuid, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_email text;
  v_sub public.poll_subscriptions%rowtype;
begin
  v_email := lower(trim(coalesce(p_email,'')));

  if v_email = '' or position('@' in v_email) = 0 then
    return false;
  end if;

  select * into v_sub
  from public.poll_subscriptions s
  where s.token = p_token
  limit 1;

  if not found then
    return false;
  end if;

  if v_sub.status = 'pending'
     and v_sub.subscriber_user_id is null
     and v_sub.cancelled_at is null
     and v_sub.declined_at is null then
    update public.poll_subscriptions s
       set subscriber_email = v_email,
           status = 'active',
           opened_at = coalesce(s.opened_at, now()),
           accepted_at = now()
     where s.id = v_sub.id;

    return found;
  end if;

  insert into public.poll_subscriptions (
    owner_id,
    subscriber_email,
    status,
    created_at,
    opened_at,
    accepted_at
  )
  values (
    v_sub.owner_id,
    v_email,
    'active',
    now(),
    now(),
    now()
  );

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.poll_open(p_game_id uuid, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type public.game_type;
  v_status text;
begin
  -- weryfikacja klucza + pobranie typu gry
  select g.type, g.status into v_type, v_status
  from public.games g
  where g.id = p_game_id
    and g.share_key_poll = p_key;

  if not found then
    raise exception 'Bad poll key or game not found';
  end if;

  if v_type = 'prepared' then
    raise exception 'Prepared game has no poll';
  end if;

  -- status = poll_open (UWAGA: nie dotykamy games.type!)
  update public.games
  set status = 'poll_open',
      poll_opened_at = now(),
      poll_closed_at = null,
      share_key_poll = case when v_status = 'ready' then public.gen_share_key(18) else share_key_poll end,
      updated_at = now()
  where id = p_game_id;

  -- restart sesji: usuń stare dane ankietowe
  delete from public.poll_tasks where game_id = p_game_id;
  delete from public.poll_votes where game_id = p_game_id;
  delete from public.poll_text_entries where game_id = p_game_id;
  delete from public.poll_sessions where game_id = p_game_id;

  -- utwórz sesję per pytanie
  insert into public.poll_sessions (game_id, question_id, question_ord, is_open, created_at, closed_at)
  select q.game_id, q.id, q.ord, true, now(), null
  from public.questions q
  where q.game_id = p_game_id;

end $function$;

CREATE OR REPLACE FUNCTION public.poll_sub_accept(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_uid uuid := auth.uid();
  my_email text;
  s record;
begin
  if my_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select p.email into my_email
  from public.profiles p
  where p.id = my_uid;

  my_email := public._norm_email(my_email);

  select *
  into s
  from public.poll_subscriptions
  where token = p_token
  limit 1;

  if s is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  -- nie pozwalamy wskrzeszać
  if s.cancelled_at is not null or s.declined_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_closed');
  end if;

  if s.accepted_at is not null or s.status = 'active' then
    return jsonb_build_object('ok', true, 'kind', 'sub', 'action', 'accept', 'note', 'already_active');
  end if;

  -- sprawdzamy, czy to mój token
  if s.subscriber_user_id is not null then
    if s.subscriber_user_id <> my_uid then
      return jsonb_build_object('ok', false, 'error', 'not_your_invite');
    end if;
  else
    -- invite emailowy: po zalogowaniu podpinamy do user_id
    update public.poll_subscriptions
      set subscriber_user_id = my_uid,
          subscriber_email = null
    where id = s.id
      and subscriber_user_id is null;
  end if;

  update public.poll_subscriptions
    set status = 'active',
        accepted_at = coalesce(accepted_at, now()),
        opened_at   = coalesce(opened_at, now()),
        declined_at = null,
        cancelled_at = null
  where token = p_token;

  return jsonb_build_object('ok', true, 'kind', 'sub', 'action', 'accept');
end;
$function$;

CREATE OR REPLACE FUNCTION public.poll_sub_accept_email(p_token uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e text := public._norm_email(p_email);
  s record;
begin
  if e is null then
    return jsonb_build_object('ok', false, 'error', 'missing_email');
  end if;

  select *
  into s
  from public.poll_subscriptions
  where token = p_token
  limit 1;

  if s is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if s.subscriber_user_id is not null then
    return jsonb_build_object('ok', false, 'error', 'registered_invite_requires_login');
  end if;

  if s.cancelled_at is not null or s.declined_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_closed');
  end if;

  if s.accepted_at is not null or s.status = 'active' then
    return jsonb_build_object('ok', true, 'kind', 'sub', 'action', 'accept', 'note', 'already_active');
  end if;

  update public.poll_subscriptions
    set subscriber_email = e,
        status = 'active',
        accepted_at = coalesce(accepted_at, now()),
        opened_at   = coalesce(opened_at, now()),
        declined_at = null,
        cancelled_at = null
  where token = p_token;

  return jsonb_build_object('ok', true, 'kind', 'sub', 'action', 'accept');
end;
$function$;
