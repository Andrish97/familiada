-- E26 B3 (decyzja użytkownika 2026-10-23): stare „zapamiętane urządzenia”
-- (shared_devices, marzec) zastąpione przez control_device_shares — nic do
-- nich nie pisze, a część 'device' w tasks_list nie trafia na ekran (strona
-- Zadań pokazuje tylko ankiety). Urządzenia są chwilowe, więc bez przenoszenia
-- danych: kasowania w funkcjach, część 'device' w tasks_list i tabela znikają.
--
-- Przy okazji (B4, migracja 477): _delete_user_data nie kasuje już starych
-- contact_reports, tylko zgłoszenia w nowym modelu (reports + messages), gdy
-- ich autorem jest e-mail konta — decyzja 2026-10-07 „zgłoszenia kontaktowe
-- usuniętego konta: usuwane całe” (usuwanie-danych.md), także dla zgłoszeń
-- przeniesionych w 477. Jedna podmiana funkcji, żeby 476 i 477 się nie
-- nadpisywały.

CREATE OR REPLACE FUNCTION "public"."_delete_user_data"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_emails text[];
  v_email text;
  fk record;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- 312: e-maile konta (małymi literami) -- po nich czyścimy dane bez user_id
  select coalesce(array_agg(distinct e), array[]::text[]) into v_emails
  from (
    select lower(trim(u.email)) as e from auth.users u where u.id = p_user_id
    union
    select lower(trim(p.email)) from public.profiles p where p.id = p_user_id
  ) x
  where e is not null and e <> '';

  -- Serialize against snapshot/write jobs before inspecting the inbox.
  perform 1 from auth.users where id = p_user_id for update;

  --366: remove only this recipient inbox before pending resource guards.
  -- Sent copies already belong to their recipients and remain independent.
  delete from public.resource_copy_offers where recipient_id = p_user_id;

  -- 312: usunięcie konta jest nadrzędne -- nie sprawdza blokad (edit_locks);
  -- blokady trzymane przez to konto i na jego zasobach znikają.
  delete from public.edit_locks where holder_user_id = p_user_id;
  delete from public.edit_locks
   where (resource_type = 'game' and resource_id in (select id from public.games where owner_id = p_user_id))
      or (resource_type = 'base' and resource_id in (select id from public.question_bases where owner_id = p_user_id))
      or (resource_type = 'logo' and resource_id in (select id from public.user_logos where user_id = p_user_id));

  -- 312: głosy w cudzych ankietach zostają anonimowe (bez powiązania z kontem);
  -- głosy w własnych grach znikają razem z grami niżej.
  update public.poll_text_entries set voter_user_id = null where voter_user_id = p_user_id;
  update public.poll_votes set voter_user_id = null where voter_user_id = p_user_id;

  delete from public.friendships where requester_id=p_user_id OR addressee_id=p_user_id;

  delete from public.poll_subscriptions where registered_user_id = p_user_id;
  delete from public.poll_subscriptions where owner_id = p_user_id;

  delete from public.poll_tasks where recipient_user_id = p_user_id;
  delete from public.poll_tasks where owner_id = p_user_id;

  -- 312: zaproszenia do baz (po user_id i po e-mailu)
  delete from public.base_share_tasks where recipient_user_id = p_user_id;
  delete from public.base_share_tasks where owner_id = p_user_id;

  delete from public.question_base_shares where user_id = p_user_id;
  delete from public.question_bases where owner_id = p_user_id;

  -- 312: gry (maile ankietowe właściciela znikają niżej przez created_by)
  delete from public.games where owner_id = p_user_id;

  delete from public.user_flags where user_id = p_user_id;
  delete from public.user_logos where user_id = p_user_id;

  -- 312: wszystko powiązane z e-mailem konta
  delete from public.mail_queue where created_by = p_user_id;
  delete from public.mail_function_logs where actor_user_id = p_user_id;
  delete from public.email_intents where user_id = p_user_id;
  delete from public.mail_cooldowns
   where position(p_user_id::text in target_key) > 0;

  foreach v_email in array v_emails loop
    delete from public.poll_subscriptions where lower(subscriber_email) = v_email;
    delete from public.poll_tasks where lower(recipient_email) = v_email;
    delete from public.base_share_tasks where lower(recipient_email) = v_email;
    delete from public.mail_queue where lower(trim(to_email)) = v_email;
    delete from public.mail_function_logs where lower(recipient_email) = v_email;
    delete from public.email_unsub_tokens where lower(email) = v_email;
    delete from public.email_intents where lower(email) = v_email;
    delete from public.email_cooldowns where email_hash = md5(v_email);
    delete from public.mail_cooldowns where position(md5(v_email) in target_key) > 0;
    -- zgłoszenia kontaktowe tego e-maila całe: autor = pierwsza wiadomość
    -- zgłoszenia (jak w Workerze, email/contact.js)
    with own as (
      select r.id from public.reports r
      join lateral (
        select m.direction, m.from_email, m.to_email from public.messages m
        where m.report_id = r.id order by m.created_at, m.id limit 1
      ) f on true
      where lower(trim(case when f.direction = 'inbound' then f.from_email else f.to_email end)) = v_email
    ), gone as (
      delete from public.messages m using own where m.report_id = own.id returning 1
    )
    delete from public.reports r using own where r.id = own.id;
  end loop;


  -- 460: ogólny przebieg po kluczach obcych do kont -- to, co przy usuwaniu
  -- konta zrobiłaby kaskada (ON DELETE CASCADE / SET NULL), tutaj jawnie,
  -- żeby czyszczenie bez usuwania profilu (e2e_reset_identity) było pełne.
  -- Nowa tabela z kluczem do profiles/auth.users jest objęta automatycznie.
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col, c.confdeltype as act
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.conrelid not in ('public.profiles'::regclass,
                             'public.reserved_username_accounts'::regclass,
                             'public.stats_excluded_users'::regclass,
                             'public.e2e_identities'::regclass)
      and c.confdeltype in ('c', 'n')
    order by c.conrelid::regclass::text, a.attname
  loop
    if fk.act = 'c' then
      execute format('delete from %s where %I = $1', fk.tbl, fk.col) using p_user_id;
    else
      execute format('update %s set %I = null where %I = $1', fk.tbl, fk.col, fk.col) using p_user_id;
    end if;
  end loop;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."_e2e_reset_email"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v text := lower(btrim(p_email));
begin
  delete from public.control_device_shares where lower(trim(recipient_email)) = v;
  delete from public.friendships where lower(trim(requested_email)) = v;
  delete from public.poll_subscriptions where lower(subscriber_email) = v;
  delete from public.poll_tasks where lower(recipient_email) = v;
  delete from public.base_share_tasks where lower(recipient_email) = v;
  delete from public.mail_queue where lower(trim(to_email)) = v;
  delete from public.mail_notification_allocations where lower(trim(to_email)) = v;
  delete from public.mail_function_logs where lower(recipient_email) = v;
  delete from public.mail_center_links where lower(email) = v;
  delete from public.email_unsub_tokens where lower(email) = v;
  delete from public.email_intents where lower(email) = v;
  delete from public.email_cooldowns where email_hash = md5(v);
  delete from public.mail_cooldowns where position(md5(v) in target_key) > 0;
  delete from public.e2e_emails where recipient = v;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."control_game_cancel_for_settings"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_runtime public.control_runtime_sessions;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;

  SELECT gs.id INTO v_session_id
  FROM public.game_session_active a
  JOIN public.game_sessions gs ON gs.id=a.session_id AND gs.game_id=a.game_id
  WHERE a.game_id=p_game_id AND gs.ended_at IS NULL
  FOR UPDATE OF gs;
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'cancelled',false,'in_progress',false);
  END IF;

  SELECT * INTO v_runtime FROM public.control_runtime_sessions
  WHERE game_id=p_game_id AND ended_at IS NULL FOR UPDATE;
  IF FOUND AND v_runtime.expires_at<=clock_timestamp() THEN
    PERFORM public.control_runtime_expire_one(v_runtime.id);
    RETURN jsonb_build_object('ok',true,'cancelled',false,'in_progress',false);
  END IF;

  -- Close statistics and remove the active pointer before resetting game_state;
  -- the tracker trigger then cannot misclassify this as an ordinary restart.
  UPDATE public.game_sessions
  SET status='abandoned', ended_at=clock_timestamp(), last_seen_at=clock_timestamp(),
      stats_detail=coalesce(stats_detail,'{}'::jsonb) || '{"end_reason":"settings_cancelled"}'::jsonb
  WHERE id=v_session_id AND ended_at IS NULL;
  DELETE FROM public.game_session_active WHERE game_id=p_game_id;

  UPDATE public.game_state
  SET rev=rev+1, top_card='devices', step='devices_display', phase=NULL,
      control_team=NULL, sound_cue_key=NULL, sound_cue_seq=sound_cue_seq+1,
      detail='{}'::jsonb, updated_at=clock_timestamp()
  WHERE game_id=p_game_id;

  DELETE FROM public.device_connect_codes WHERE game_id=p_game_id;
  DELETE FROM public.device_presence WHERE game_id=p_game_id;

  IF v_runtime.id IS NOT NULL THEN
    UPDATE public.control_runtime_sessions
    SET ended_at=clock_timestamp(), end_reason='settings_cancelled'
    WHERE id=v_runtime.id AND ended_at IS NULL;
  END IF;
  RETURN jsonb_build_object('ok',true,'cancelled',true,'in_progress',false);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."control_runtime_expire_one"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_session public.control_runtime_sessions;
BEGIN
  SELECT * INTO v_session FROM public.control_runtime_sessions
  WHERE id = p_session_id AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Zachowujemy przebieg wyłącznie jako statystykę; usuwamy jego aktywny
  -- wskaźnik i stan runtime, żeby kolejny Control wrócił do parowania.
  UPDATE public.game_sessions gs
  SET status = 'abandoned', ended_at = now(), last_seen_at = now(),
      stats_detail = coalesce(gs.stats_detail, '{}'::jsonb) || '{"end_reason":"control_idle_expired"}'::jsonb
  FROM public.game_session_active active
  WHERE active.game_id = v_session.game_id
    AND gs.id = active.session_id
    AND gs.ended_at IS NULL;
  DELETE FROM public.game_session_active WHERE game_id = v_session.game_id;

  UPDATE public.game_state
  SET rev = rev + 1,
      top_card = 'devices', step = 'devices_display', phase = NULL,
      control_team = NULL, sound_cue_key = NULL,
      sound_cue_seq = sound_cue_seq + 1, detail = '{}'::jsonb,
      updated_at = now()
  WHERE game_id = v_session.game_id;

  DELETE FROM public.device_connect_codes WHERE game_id = v_session.game_id;
  DELETE FROM public.device_presence WHERE game_id = v_session.game_id;
  UPDATE public.control_runtime_sessions
  SET ended_at = now(), end_reason = 'idle'
  WHERE id = p_session_id;
  RETURN true;
END;
$$;

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

CREATE OR REPLACE FUNCTION "public"."e2e_shared_devices_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR NOT public._e2e_account_email(v_caller_email)
     OR NOT public._e2e_account_email(v_other_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  -- device:share cooldown target_key niesie też device_type/game_id, stąd
  -- LIKE z prefiksem pary, nie dokładna wartość.
  DELETE FROM public.mail_cooldowns
  WHERE action_key = 'device:share'
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'mail_cooldowns_deleted', v_mail_cooldowns_deleted);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."tasks_list"("p_kind" "text" DEFAULT NULL::"text") RETURNS TABLE("kind" "text", "id" "uuid", "state" "text", "title" "text", "owner_label" "text", "created_at" timestamp with time zone, "done_at" timestamp with time zone, "token" "uuid", "poll_type" "text", "role" "text", "device_type" "text", "game_id" "uuid", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
#variable_conflict use_column
DECLARE uid uuid:=auth.uid(); identity jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN; END IF;
 PERFORM public.poll_claim_email_records();
 IF p_kind IS NULL OR p_kind='poll' THEN
  RETURN QUERY SELECT 'poll'::text,t.id,CASE WHEN t.done_at IS NOT NULL THEN 'done' ELSE 'todo' END,
   coalesce(g.name,'Ankieta '||left(t.game_id::text,8)),coalesce(nullif(p.username,''),p.email),t.created_at,t.done_at,t.token,
   t.poll_type,NULL::text,NULL::text,t.game_id,NULL::timestamptz
  FROM public.poll_tasks t LEFT JOIN public.games g ON g.id=t.game_id LEFT JOIN public.profiles p ON p.id=t.owner_id
  WHERE t.recipient_user_id=uid AND t.declined_at IS NULL AND t.cancelled_at IS NULL
    AND (t.done_at IS NULL OR t.done_at>now()-interval '5 days') ORDER BY t.created_at DESC;
 END IF;
 IF p_kind IS NULL OR p_kind='base' THEN
  RETURN QUERY SELECT 'base'::text,bt.id,
   CASE WHEN bt.status IN('pending','opened') THEN 'todo' ELSE 'done' END,
   coalesce(b.name,'Baza pytań'),coalesce(nullif(p.username,''),p.email),bt.created_at,
   CASE WHEN bt.status='done' THEN bt.accepted_at END,bt.token,NULL::text,bt.role::text,NULL::text,NULL::uuid,NULL::timestamptz
  FROM public.base_share_tasks bt LEFT JOIN public.question_bases b ON b.id=bt.base_id
   LEFT JOIN public.profiles p ON p.id=bt.owner_id
  WHERE bt.recipient_user_id=uid AND (bt.status IN('pending','opened') OR (bt.status='done' AND bt.accepted_at>now()-interval '5 days'))
  ORDER BY bt.created_at DESC;
 END IF;
END $$;

DROP TABLE public.shared_devices;
