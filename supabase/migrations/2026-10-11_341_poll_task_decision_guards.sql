-- Wszystkie decyzje zadania sprawdzają rodzica, bieżący przebieg i odbiorcę.
BEGIN;
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
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RETURN 'already_used'; END IF;
 UPDATE public.poll_tasks SET
  status=CASE p_action WHEN 'decline' THEN 'declined' WHEN 'done' THEN 'done' ELSE 'opened' END,
  opened_at=coalesce(opened_at,now()),
  declined_at=CASE WHEN p_action='decline' THEN coalesce(declined_at,now()) ELSE declined_at END,
  done_at=CASE WHEN p_action='done' THEN now() ELSE done_at END
 WHERE id=t.id;
 RETURN 'ok';
END; $$;
REVOKE ALL ON FUNCTION public._poll_task_change(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.poll_task_opened(p_token uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT public._poll_task_change(p_token,'open') $$;
CREATE OR REPLACE FUNCTION public.poll_task_decline(p_token uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT public._poll_task_change(p_token,'decline') $$;
CREATE OR REPLACE FUNCTION public.poll_task_done(p_token uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT public._poll_task_change(p_token,'done') $$;
CREATE OR REPLACE FUNCTION public.poll_go_task_action(p_token uuid,p_action text,p_email text DEFAULT NULL)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN lower(trim(p_action)) IN ('open','decline')
 THEN public._poll_task_change(p_token,lower(trim(p_action)))='ok' ELSE false END
$$;
-- Przeglądarka korzysta wyłącznie z kanonicznych RPC; SELECT pozostaje.
DROP POLICY IF EXISTS poll_tasks_insert_owner ON public.poll_tasks;
DROP POLICY IF EXISTS poll_tasks_update_owner ON public.poll_tasks;
DROP POLICY IF EXISTS poll_tasks_delete_owner ON public.poll_tasks;
REVOKE ALL ON FUNCTION public.poll_task_send(uuid,text,text[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION "public"."poll_task_resolve"("p_token" "uuid", "p_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  t record;
  u uuid;
  requires_auth boolean := false;
  needs_email boolean := false;
  registered uuid;
  change_result text;
BEGIN
  u := auth.uid();

  SELECT
    pt.id,
    pt.owner_id,
    pt.recipient_user_id,
    pt.recipient_email,
    pt.game_id,
    pt.poll_type,
    pt.share_key_poll,
    pt.status,
    pt.opened_at,
    pt.done_at,
    pt.declined_at,
    pt.cancelled_at,
    g.status::text AS game_status, -- E11b
    g.owner_id AS game_owner, g.type::text AS game_type,
    g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  WHERE pt.token = p_token
  LIMIT 1;

  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- niedostępne u odbiorcy (declined/cancelled), oraz po wykonaniu
  IF t.status IN ('declined','cancelled') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_unavailable_token');
  END IF;

  IF t.status = 'done' OR t.done_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_done');
  END IF;

  -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
  IF t.game_key IS NULL OR t.owner_id IS DISTINCT FROM t.game_owner
     OR t.poll_type IS DISTINCT FROM t.game_type OR t.game_key <> t.share_key_poll
     OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF t.game_status = 'poll_stopped' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
  END IF;
  IF t.game_status = 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
  END IF;

  -- jeżeli task jest przypisany do user_id: wymagamy zgodności sesji
  IF t.recipient_user_id IS NOT NULL THEN
    IF u IS NULL THEN
      requires_auth := true;
    ELSIF u <> t.recipient_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_unavailable_token');
    END IF;
  END IF;

  IF t.recipient_user_id IS NULL THEN
    SELECT id INTO registered FROM public.profiles WHERE NOT is_guest
      AND public._norm_email(email)=public._norm_email(t.recipient_email);
    IF registered IS NOT NULL THEN
      IF u IS NULL THEN requires_auth := true;
      ELSIF u <> registered THEN RETURN jsonb_build_object('ok',false,'error','invalid_or_unavailable_token'); END IF;
    END IF;
  END IF;

  -- jeżeli task jest e-mailowy: e-mail może być potrzebny do późniejszego UI/komunikatu
  IF t.recipient_user_id IS NULL AND t.recipient_email IS NULL THEN
    -- przypadek "czysty e-mail": oczekujemy podania e-mail w UI
    IF p_email IS NULL OR btrim(p_email) = '' THEN
      needs_email := true;
    END IF;
  END IF;

  IF NOT requires_auth THEN
    change_result:=public._poll_task_change(p_token,'open');
    IF change_result<>'ok' THEN RETURN jsonb_build_object('ok',false,'error',change_result); END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'kind', 'task',
    'task_id', t.id,
    'game_id', t.game_id,
    'poll_type', t.poll_type,
    'key', t.share_key_poll,
    'voter_token', public.poll_task_voter_token(t.id),
    'requires_auth', requires_auth,
    'needs_email', needs_email,
    'recipient_email', COALESCE(t.recipient_email, NULLIF(btrim(p_email), ''))
  );
END;
$$;
CREATE OR REPLACE FUNCTION "public"."poll_admin_delete_vote"("p_game_id" "uuid", "p_voter_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  u uuid;
  deleted_points int := 0;
  deleted_text int := 0;
  task_id uuid;
  current_key text;
BEGIN
  u := auth.uid();
  IF u IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT share_key_poll INTO current_key FROM public.games WHERE id=p_game_id AND owner_id=u FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_owner'); END IF;

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
      WHERE id = task_id AND owner_id = u AND game_id=p_game_id
        AND share_key_poll=current_key AND status='done' AND declined_at IS NULL AND cancelled_at IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_poll_votes', deleted_points,
    'deleted_poll_text_entries', deleted_text
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_go_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s record;
  t record;
  u record;
  f record;
  b record;
BEGIN
  -- Znajomość przed subskrypcją: stare tokeny z maili kont skopiowano w 320.
  SELECT fs.id,fs.status,fs.requester_id,fs.addressee_id,p.username AS owner_label
  INTO f FROM public.friendships fs JOIN public.profiles p ON p.id=fs.requester_id
  WHERE fs.token=p_token AND (fs.status<>'declined' OR fs.declined_at>now()-interval '30 days') LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'kind','friend','id',f.id,'status',f.status,
      'owner_label',f.owner_label,'recipient_matches_me',auth.uid()=f.addressee_id);
  END IF;
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token AND (ps.declined_at IS NULL OR ps.declined_at>now()-interval '30 days') LIMIT 1;

  IF found THEN
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email,
      'friend_conversion_required', s.subscriber_user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.profiles WHERE public._norm_email(email)=public._norm_email(s.subscriber_email) AND NOT is_guest)
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.owner_id AS game_owner, g.type::text AS game_type,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    IF t.game_key IS NULL OR t.game_key IS DISTINCT FROM t.share_key_poll
      OR t.owner_id IS DISTINCT FROM t.game_owner OR t.poll_type IS DISTINCT FROM t.game_type THEN
      RETURN jsonb_build_object('ok',false,'error','expired');
    END IF;
    IF t.recipient_user_id IS NULL THEN
      SELECT id INTO t.recipient_user_id FROM public.profiles WHERE NOT is_guest
        AND public._norm_email(email)=public._norm_email(t.recipient_email);
    END IF;
    -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
    IF t.status IN ('pending', 'opened') THEN
      IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
         OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'expired');
      ELSIF t.game_status = 'poll_stopped' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
      ELSIF t.game_status = 'ready' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
      END IF;
    END IF;
    -- E11b: tylko znacznik czasu, bez stanu pośredniego 'opened'
    IF t.opened_at IS NULL THEN
      PERFORM public._poll_task_change(p_token,'open');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'task',
      'task_id', t.id, 'status', t.status,
      'owner_id', t.owner_id, 'owner_label', t.owner_label,
      'recipient_user_id', t.recipient_user_id,
      'recipient_email', t.recipient_email,
      'game_id', t.game_id, 'game_name', t.game_name,
      'poll_type', t.poll_type, 'share_key_poll', t.share_key_poll
    );
  END IF;

  -- Base shares: token is only a pointer to the logged-in recipient's task.
  SELECT bt.id, bt.status, bt.base_id, bt.recipient_user_id, bt.recipient_email,
         bt.owner_id, p.username AS owner_label
  INTO b
  FROM public.base_share_tasks bt
  LEFT JOIN public.profiles p ON p.id = bt.owner_id
  WHERE bt.token = p_token
    AND (bt.status NOT IN ('pending','opened','declined') OR coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')>now())
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'base', 'task_id', b.id, 'status', b.status,
      'base_id', b.base_id, 'recipient_user_id', b.recipient_user_id,
      'recipient_email', b.recipient_email, 'owner_id', b.owner_id,
      'owner_label', b.owner_label,
      'recipient_matches_me', auth.uid() = b.recipient_user_id
    );
  END IF;

  -- 3) global unsub token?
  SELECT email, suppressed_at INTO u
  FROM public.email_unsub_tokens
  WHERE token = p_token LIMIT 1;

  IF found THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'unsub',
      'already_suppressed', (u.suppressed_at IS NOT NULL)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
END;
$$;
COMMIT;
