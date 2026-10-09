-- 319: linki z maili ankiet i subskrypcji: poll-go?t= / poll-go?s= -> go?t= / go?s= (strona /go/ zastępuje /poll-go/).
-- Reszta logiki funkcji bez zmian (definicje z schema.sql po 318).

CREATE OR REPLACE FUNCTION "public"."delete_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_resource_type = 'game' then
    if not exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 312: otwarta ankieta nie blokuje usunięcia (zostaje przerwana: głosy, sesje
    -- i zaproszenia znikają kaskadą). Blokuje tylko zajęta blokada gry.

    -- 316: game:G trzymane przez inną kartę (wyłączne albo współdzielone)
    select * into v_blocker
    from public.edit_lock_blockers('game', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- 312: maile w kolejce z zaproszeniami do ankiety tej gry (link
    -- go?t=<token> w treści; mail_queue nie ma kolumny z identyfikatorem gry).
    delete from public.mail_queue q
    using public.poll_tasks pt
    where pt.game_id = p_resource_id
      and position(('go?t=' || pt.token::text) in q.html) > 0;

    -- 312: zapamiętane urządzenia tej gry (FK dałby tylko SET NULL).
    delete from public.shared_devices where game_id = p_resource_id;

    delete from public.games where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'logo' then
    if not exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 316: logo:L w innej karcie albo pula logo (logos) trzymana przez kogoś
    -- innego -- jedna reguła zgodności zamiast kontekstów settings / control.
    select * into v_blocker
    from public.edit_lock_blockers('logo', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked',
        'blocker_type', v_blocker.resource_type, 'blocker_context', v_blocker.holder_context);
    end if;

    delete from public.user_logos where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'base' then
    if not exists (select 1 from public.question_bases where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 316: base:B trzymane (współdzielone -- eksplorator, albo wyłączne) przez
    -- kogoś innego.
    select * into v_blocker
    from public.edit_lock_blockers('base', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- Którykolwiek element WEWNĄTRZ tej bazy (pytanie/folder/tag) ma teraz
    -- aktywną sesję edycji (Warstwa 1, migracja 257) -- usunięcie całej
    -- bazy skasowałoby go (CASCADE) spod ręki edytującego bez ostrzeżenia.
    if exists (
      select 1 from public.edit_locks l
      where l.heartbeat_at > now() - public.edit_lock_ttl()  -- 316: TTL
        and l.holder_tab_id is distinct from p_tab_id
        and (
          (l.resource_type = 'base_question' and exists (
            select 1 from public.qb_questions q where q.id = l.resource_id and q.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_folder' and exists (
            select 1 from public.qb_categories c where c.id = l.resource_id and c.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_tag' and exists (
            select 1 from public.qb_tags t where t.id = l.resource_id and t.base_id = p_resource_id
          ))
        )
    ) then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    delete from public.question_bases where id = p_resource_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."poll_share_remind"("p_game_id" "uuid", "p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  g record;
  t record;
  v_to text;
  v_target text;
  v_ok boolean;
  v_until timestamptz;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT id, name, status::text AS status, share_key_poll INTO g
  FROM public.games WHERE id = p_game_id FOR UPDATE;

  IF g.status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  SELECT * INTO t FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;
  IF t.status NOT IN ('pending', 'opened') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task not pending');
  END IF;
  IF t.share_key_poll <> g.share_key_poll THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task expired');
  END IF;
  IF t.reminder_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'err', 'reminder limit');
  END IF;

  v_to := lower(coalesce(t.recipient_email, (SELECT p.email FROM public.profiles p WHERE p.id = t.recipient_user_id)));
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this recipient');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(t.recipient_user_id::text, 'email:' || md5(lower(coalesce(t.recipient_email, '')))) ||
    ':game:' || p_game_id::text;

  SELECT c.ok, c.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_check('poll:share', v_target) c;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  v_until := public._poll_daily_cap_until(v_uid, v_to);
  IF v_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until, 'reason', 'daily_cap');
  END IF;

  SELECT r.ok, r.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_reserve('poll:share', v_target) r;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  UPDATE public.poll_tasks SET reminder_count = reminder_count + 1 WHERE id = t.id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', t.id, 'to', v_to, 'token', t.token, 'link', 'go?t=' || t.token::text,
    'game_name', g.name, 'poll_type', t.poll_type,
    'reminder_count', t.reminder_count + 1,
    'mail', jsonb_build_array(jsonb_build_object(
      'task_id', t.id, 'to', v_to, 'token', t.token, 'link', 'go?t=' || t.token::text))
  );
END $$;


--
-- Name: poll_share_remove("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_share_remove"("p_game_id" "uuid", "p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_token text := public.poll_task_voter_token(p_task_id); -- 'task:<id>'
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  IF NOT EXISTS (SELECT 1 FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id) THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;

  DELETE FROM public.poll_votes WHERE game_id = p_game_id AND voter_token = v_token;
  DELETE FROM public.poll_text_entries WHERE game_id = p_game_id AND voter_token = v_token;
  DELETE FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id;

  RETURN jsonb_build_object('ok', true);
END $$;


--
-- Name: poll_state("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_state"("p_game_id" "uuid", "p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  g record;
  v_state text;
BEGIN
  SELECT id, type::text AS type, status::text AS status, share_key_poll, poll_ended_key
    INTO g
  FROM public.games WHERE id = p_game_id;

  IF NOT FOUND OR g.type NOT IN ('poll_text', 'poll_points') THEN
    RETURN jsonb_build_object('ok', true, 'state', 'not_found');
  END IF;

  IF p_key IS NOT NULL AND g.share_key_poll = p_key THEN
    v_state := CASE g.status
      WHEN 'poll_open' THEN 'open'
      WHEN 'poll_stopped' THEN 'stopped'
      WHEN 'ready' THEN 'ended'
      ELSE 'draft'
    END;
  ELSIF p_key IS NOT NULL AND g.poll_ended_key IS NOT NULL AND g.poll_ended_key = p_key AND g.status = 'ready' THEN
    v_state := 'ended';
  ELSE
    v_state := 'expired';
  END IF;

  RETURN jsonb_build_object('ok', true, 'state', v_state, 'type', g.type);
END $$;


--
-- Name: poll_stop("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_stop"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status = 'poll_stopped' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', 'poll_stopped');
  END IF;
  IF v_status <> 'poll_open' THEN
    RAISE EXCEPTION 'poll_not_open';
  END IF;

  UPDATE public.games SET status = 'poll_stopped', updated_at = now() WHERE id = p_game_id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', 'poll_stopped');
END $$;


--
-- Name: poll_sub_accept("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_sub_accept"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    -- invite emailowy: musi pasować do mojego maila
    if public._norm_email(s.subscriber_email) is null or public._norm_email(s.subscriber_email) <> my_email then
      return jsonb_build_object('ok', false, 'error', 'email_mismatch');
    end if;

    -- opcjonalnie: po zalogowaniu podpinamy do user_id
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
$$;

CREATE OR REPLACE FUNCTION "public"."polls_hub_list_my_subscriptions"() RETURNS TABLE("sub_id" "uuid", "owner_id" "uuid", "owner_label" "text", "status" "text", "created_at" timestamp with time zone, "token" "uuid", "go_url" "text", "is_expired" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.poll_claim_email_records();

  return query
  with base as (
    select
      s.*,
      greatest(
        coalesce(s.declined_at,  '-infinity'::timestamptz),
        coalesce(s.cancelled_at, '-infinity'::timestamptz),
        coalesce(s.created_at,   '-infinity'::timestamptz)
      ) as last_action_at
    from public.poll_subscriptions s
    where s.subscriber_user_id = auth.uid()
  )
  select
    b.id as sub_id,
    b.owner_id,
    coalesce(p.username, p.email, '—') as owner_label,
    b.status,
    b.created_at,
    b.token,
    ('go?s=' || b.token::text)::text as go_url,
    (b.status in ('declined','cancelled') and b.last_action_at <= now() - interval '5 days') as is_expired
  from base b
  left join public.profiles p on p.id = b.owner_id
  where not (b.status in ('declined','cancelled') and b.last_action_at <= now() - interval '5 days')
  order by b.created_at desc;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."polls_hub_list_tasks"() RETURNS TABLE("task_id" "uuid", "game_id" "uuid", "game_name" "text", "poll_type" "text", "status" "text", "created_at" timestamp with time zone, "done_at" timestamp with time zone, "declined_at" timestamp with time zone, "cancelled_at" timestamp with time zone, "is_archived" boolean, "go_url" "text", "owner_id" "uuid", "owner_username" "text", "owner_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    ('go?t=' || t.token::text)::text,
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

CREATE OR REPLACE FUNCTION "public"."polls_hub_share_poll"("p_game_id" "uuid", "p_sub_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poll_type text;
  v_status text; -- E11b
  v_share_key text;
  v_created int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
  v_blocked int := 0;
  v_blocked_sub_ids jsonb := '[]'::jsonb;
  v_mail jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT g.type::text, g.share_key_poll, g.status::text INTO v_poll_type, v_share_key, v_status
  FROM public.games g WHERE g.id = p_game_id AND g.owner_id = v_uid LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'game not found');
  END IF;
  IF v_poll_type NOT IN ('poll_text', 'poll_points') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not a poll game');
  END IF;
  -- E11b: udostępniać można tylko otwartą ankietę (sprawdzane w bazie)
  IF v_status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  -- E11b: wycofanie zaproszenia = usunięcie wiersza (bez stanu 'cancelled'); czekające nie mają głosów
  DELETE FROM public.poll_tasks t
  WHERE t.owner_id = v_uid AND t.game_id = p_game_id AND t.status IN ('pending', 'opened')
    AND (
      (t.recipient_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.poll_subscriptions s
        WHERE s.id = ANY(coalesce(p_sub_ids, array[]::uuid[])) AND s.owner_id = v_uid
          AND s.status = 'active' AND s.subscriber_user_id = t.recipient_user_id
      ))
      OR (t.recipient_user_id IS NULL AND t.recipient_email IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.poll_subscriptions s
        WHERE s.id = ANY(coalesce(p_sub_ids, array[]::uuid[])) AND s.owner_id = v_uid
          AND s.status = 'active' AND s.subscriber_email IS NOT NULL
          AND lower(s.subscriber_email) = lower(t.recipient_email)
      ))
    );
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  WITH sel AS (
    SELECT
      s.id AS sub_id,
      s.subscriber_user_id,
      lower(s.subscriber_email) AS subscriber_email,
      lower(coalesce(s.subscriber_email, p.email)) AS resolved_email,
      'pair:' || v_uid::text || ':' ||
        coalesce(s.subscriber_user_id::text, 'email:' || md5(lower(coalesce(s.subscriber_email, '')))) ||
        ':game:' || p_game_id::text AS cooldown_target
    FROM public.poll_subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.subscriber_user_id
    WHERE s.owner_id = v_uid AND s.status = 'active' AND s.id = ANY(coalesce(p_sub_ids, array[]::uuid[]))
  ),
  cooldown AS (
    -- E11b: blokada = cooldown poll:share (24 h na parę+grę) LUB dobowy limit 3 maili ankietowych nadawca→odbiorca
    SELECT u.sub_id, max(u.next_allowed_at) AS next_allowed_at
    FROM (
      SELECT sel.sub_id, mc.next_allowed_at
      FROM sel
      JOIN public.mail_cooldowns mc ON mc.action_key = 'poll:share' AND mc.target_key = sel.cooldown_target
      WHERE mc.next_allowed_at > now()
      UNION ALL
      SELECT sel.sub_id, public._poll_daily_cap_until(v_uid, sel.resolved_email)
      FROM sel
      WHERE sel.resolved_email IS NOT NULL
        AND public._poll_daily_cap_until(v_uid, sel.resolved_email) IS NOT NULL
    ) u
    GROUP BY u.sub_id
  ),
  existing AS (
    SELECT sel.sub_id, t.id AS task_id
    FROM sel
    LEFT JOIN public.poll_tasks t
      ON t.owner_id = v_uid AND t.game_id = p_game_id AND t.status IN ('pending', 'opened', 'done', 'declined') /* E11b: odrzucone = nic więcej w tym uruchomieniu */
     AND ((sel.subscriber_user_id IS NOT NULL AND t.recipient_user_id = sel.subscriber_user_id)
       OR (sel.subscriber_user_id IS NULL AND sel.subscriber_email IS NOT NULL AND lower(t.recipient_email) = sel.subscriber_email))
  ),
  to_insert AS (
    SELECT sel.* FROM sel
    JOIN existing ex ON ex.sub_id = sel.sub_id
    LEFT JOIN cooldown cd ON cd.sub_id = sel.sub_id
    WHERE ex.task_id IS NULL AND cd.sub_id IS NULL
  ),
  ins AS (
    INSERT INTO public.poll_tasks(owner_id, recipient_user_id, recipient_email, game_id, poll_type, share_key_poll, token, status, created_at)
    SELECT
      v_uid, e.subscriber_user_id,
      CASE WHEN e.subscriber_user_id IS NOT NULL THEN NULL ELSE e.resolved_email END,
      p_game_id, v_poll_type, v_share_key, gen_random_uuid(), 'pending', now()
    FROM to_insert e
    RETURNING id, recipient_user_id, recipient_email, token
  ),
  reserved AS (
    -- Rezerwacja cooldownu TYLKO dla wierszy, które faktycznie przeszły
    -- przez `ins` (czyli naprawdę zostały wstawione) -- nie wcześniej,
    -- żeby nie konsumować cooldownu dla zablokowanych/już-istniejących.
    SELECT r.id, pc.ok
    FROM ins r
    CROSS JOIN LATERAL public.mail_cooldown_reserve(
      'poll:share',
      'pair:' || v_uid::text || ':' ||
        coalesce(r.recipient_user_id::text, 'email:' || md5(lower(coalesce(r.recipient_email, '')))) ||
        ':game:' || p_game_id::text
    ) pc
  ),
  mail_rows AS (
    SELECT i.id, coalesce(lower(i.recipient_email), lower(p.email)) AS to_email, i.token
    FROM ins i
    JOIN reserved rv ON rv.id = i.id AND rv.ok
    LEFT JOIN public.profiles p ON p.id = i.recipient_user_id
  )
  SELECT
    (SELECT count(*) FROM ins)::int,
    (SELECT count(*) FROM cooldown)::int,
    coalesce((SELECT jsonb_agg(jsonb_build_object('sub_id', c.sub_id, 'cooldown_until', c.next_allowed_at)) FROM cooldown c), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('task_id', id, 'to', to_email, 'token', token, 'link', ('go?t=' || token::text)))
      FILTER (WHERE public._norm_email(to_email) IS NOT NULL), '[]'::jsonb)
  INTO v_created, v_blocked, v_blocked_sub_ids, v_mail
  FROM mail_rows;

  v_kept := greatest(coalesce(array_length(p_sub_ids, 1), 0) - v_created, 0);

  RETURN jsonb_build_object(
    'ok', true, 'created', v_created, 'cancelled', v_cancelled, 'kept', v_kept,
    'blocked', v_blocked, 'blocked_sub_ids', v_blocked_sub_ids, 'mail', v_mail
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."polls_hub_subscriber_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_sub         public.poll_subscriptions%rowtype;
  v_to          text;
  v_link        text;
  v_target      text;
  v_cd_ok       boolean;
  v_cd_until    timestamptz;
  v_unsub_token uuid;
  v_lim_until   timestamptz; -- E11b
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT * INTO v_sub
  FROM public.poll_subscriptions
  WHERE id = p_id AND owner_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not found');
  END IF;

  IF v_sub.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'only pending can be resent');
  END IF;

  -- E11b: najwyżej 2 maile z zaproszeniem do subskrypcji na parę (okno 30 dni; pierwszy mail też idzie tą drogą)
  v_lim_until := public._poll_sub_mail_limit_until(v_uid, v_sub.subscriber_user_id, v_sub.subscriber_email);
  IF v_lim_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim_until, 'reason', 'mail_limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(v_sub.subscriber_user_id::text, 'email:' || md5(lower(coalesce(v_sub.subscriber_email, ''))));
  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('poll:resend', v_target);
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  IF v_sub.subscriber_email IS NOT NULL THEN
    v_to := lower(v_sub.subscriber_email);
  ELSIF v_sub.subscriber_user_id IS NOT NULL THEN
    SELECT lower(p.email) INTO v_to FROM public.profiles p WHERE p.id = v_sub.subscriber_user_id LIMIT 1;
  END IF;

  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this subscriber');
  END IF;

  v_link := ('go?s=' || v_sub.token::text)::text;

  UPDATE public.poll_subscriptions
  SET email_sent_at = now(), email_send_count = email_send_count + 1
  WHERE id = p_id;

  PERFORM public.mail_cooldown_reserve('poll:resend', v_target);

  IF v_sub.subscriber_email IS NOT NULL THEN
    v_unsub_token := public._ensure_unsub_token(v_to);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'to', v_to,
    'kind', 'sub_invite',
    'link', v_link,
    'token', v_sub.token,
    'registered', (v_sub.subscriber_user_id IS NOT NULL),
    'unsub_token', v_unsub_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."polls_hub_subscription_invite_a"("p_handle" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_h          text := trim(coalesce(p_handle,''));
  v_is_email   boolean := position('@' in v_h) > 1;
  v_profile    public.profiles%rowtype;
  v_existing   public.poll_subscriptions%rowtype;
  v_sub_id     uuid;
  v_token      uuid;
  v_to         text;
  v_go         text;
  v_until      timestamptz;
  v_block_ts   timestamptz;
  v_unsub_token uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth required');
  END IF;
  IF v_h = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty handle');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE lower(p.username) = lower(v_h)
     OR lower(p.email)    = lower(v_h)
  LIMIT 1;

  IF found THEN
    SELECT * INTO v_existing
    FROM public.poll_subscriptions s
    WHERE s.owner_id = v_uid AND s.subscriber_user_id = v_profile.id
    ORDER BY s.created_at DESC LIMIT 1;
  ELSE
    IF NOT v_is_email THEN
      RETURN jsonb_build_object('ok', false, 'error', 'unknown username (not registered)');
    END IF;
    SELECT * INTO v_existing
    FROM public.poll_subscriptions s
    WHERE s.owner_id = v_uid AND lower(s.subscriber_email) = lower(v_h)
    ORDER BY s.created_at DESC LIMIT 1;
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('pending','active') THEN
    v_token := v_existing.token;
    v_go    := ('go?s=' || v_token::text)::text;
    v_to    := coalesce(v_profile.email, v_existing.subscriber_email);
    -- unsub token tylko dla email-only (niezarejestrowanych)
    IF v_profile.id IS NULL AND public._norm_email(v_to) IS NOT NULL THEN
      v_unsub_token := public._ensure_unsub_token(v_to);
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'sub_id', v_existing.id, 'status', v_existing.status,
      'token', v_token, 'go_url', v_go, 'to', v_to,
      'registered', (v_profile.id IS NOT NULL),
      'unsub_token', v_unsub_token
    );
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('cancelled','declined') THEN
    v_block_ts := coalesce(v_existing.cancelled_at, v_existing.declined_at, v_existing.created_at);
    v_until    := v_block_ts + interval '5 days';
    IF now() < v_until THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cooldown', 'cooldown_until', v_until);
    END IF;
  END IF;

  v_token := gen_random_uuid();

  IF v_profile.id IS NOT NULL THEN
    INSERT INTO public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    VALUES (v_uid, v_profile.id, null, v_token, 'pending', now())
    RETURNING id INTO v_sub_id;
    v_to := v_profile.email;
  ELSE
    INSERT INTO public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    VALUES (v_uid, null, lower(v_h), v_token, 'pending', now())
    RETURNING id INTO v_sub_id;
    v_to := lower(v_h);
    -- generuj unsub token przy tworzeniu subskrypcji email-only
    v_unsub_token := public._ensure_unsub_token(v_to);
  END IF;

  v_go := ('go?s=' || v_token::text)::text;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'sub_id', v_sub_id, 'status', 'pending',
    'token', v_token, 'go_url', v_go, 'to', v_to,
    'registered', (v_profile.id IS NOT NULL),
    'unsub_token', v_unsub_token
  );
END;
$$;
