-- E25: funkcje testowe (fikstury i sprzątanie e2e) przyjmują tożsamości e2e
-- (docs/konta-testowe-plan.md) obok starych testN -- stare reguły poczty
-- testN@ usunięte w Cloudflare (decyzja użytkownika 2026-10-22), spece z pocztą
-- przechodzą na e2e+. Dwie fikstury z adresatem na stałe (test8, test14)
-- dostają wersje z adresatem w parametrze. Stare warunki zostają do pakietu F.

CREATE OR REPLACE FUNCTION public._e2e_account_email(p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((public.e2e_identity(p_email)).role IN ('standard','disposable','dedicated'), false);
$$;
CREATE OR REPLACE FUNCTION public._e2e_any_email(p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((public.e2e_identity(p_email)).role IN ('standard','noaccount','disposable','dedicated'), false);
$$;
REVOKE ALL ON FUNCTION public._e2e_account_email(text), public._e2e_any_email(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION "public"."e2e_friendships_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR (v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' AND NOT public._e2e_account_email(v_caller_email))
     OR (v_other_email !~ '^test([1-9]|1[0-3]|15)@familiada[.]online$' AND NOT public._e2e_account_email(v_other_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.friendships
  WHERE (requester_id = v_uid AND addressee_id = p_other_user_id)
     OR (requester_id = p_other_user_id AND addressee_id = v_uid);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.mail_cooldowns
  WHERE action_key LIKE 'friend:%'
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'mail_cooldowns_deleted', v_mail_cooldowns_deleted);
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."e2e_poll_subscriptions_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_subscriptions_deleted integer := 0;
  v_tasks_deleted integer := 0;
  v_cooldowns_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR (v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' AND NOT public._e2e_account_email(v_caller_email))
     OR (v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' AND NOT public._e2e_account_email(v_other_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.poll_tasks
  WHERE (owner_id = v_uid AND recipient_user_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND recipient_user_id = v_uid);
  GET DIAGNOSTICS v_tasks_deleted = ROW_COUNT;

  DELETE FROM public.poll_subscriptions
  WHERE (owner_id = v_uid AND registered_user_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND registered_user_id = v_uid);
  GET DIAGNOSTICS v_subscriptions_deleted = ROW_COUNT;

  DELETE FROM public.email_cooldowns
  WHERE email_hash IN (md5(v_caller_email), md5(v_other_email));
  GET DIAGNOSTICS v_cooldowns_deleted = ROW_COUNT;

  DELETE FROM public.mail_cooldowns
  WHERE action_key IN ('poll:invite', 'poll:resend', 'poll:share', 'poll:invite_after_reject') -- 311: także blokada 30 dni po odrzuceniu (migracja 310)
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'subscriptions_deleted', v_subscriptions_deleted,
    'tasks_deleted', v_tasks_deleted,
    'cooldowns_deleted', v_cooldowns_deleted,
    'mail_cooldowns_deleted', v_mail_cooldowns_deleted
  );
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."e2e_shared_devices_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR (v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' AND NOT public._e2e_account_email(v_caller_email))
     OR (v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' AND NOT public._e2e_account_email(v_other_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.shared_devices
  WHERE (owner_id = v_uid AND recipient_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND recipient_id = v_uid);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- device:share cooldown target_key niesie też device_type/game_id, stąd
  -- LIKE z prefiksem pary, nie dokładna wartość.
  DELETE FROM public.mail_cooldowns
  WHERE action_key = 'device:share'
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'mail_cooldowns_deleted', v_mail_cooldowns_deleted);
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."e2e_marketplace_cleanup"("p_prefix" "text" DEFAULT 'E2E-MKT-'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_games int := 0;
  v_market int := 0;
  v_ratings int := 0;
begin
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_uid is null
     or (v_email !~ '^test[0-9]+@familiada[.]online$' AND NOT public._e2e_account_email(v_email))
     or p_prefix not like 'E2E-MKT-%' then
    return jsonb_build_object('ok', false, 'error', 'test account and E2E-MKT- prefix required');
  end if;

  delete from public.market_game_ratings where user_id = v_uid;
  get diagnostics v_ratings = row_count;

  delete from public.games g
  where g.owner_id = v_uid
    and (
      g.name like p_prefix || '%'
      or exists (
        select 1 from public.market_games mg
        where mg.id = g.source_market_id and mg.title like p_prefix || '%'
      )
    );
  get diagnostics v_games = row_count;

  delete from public.market_games
  where author_user_id = v_uid and title like p_prefix || '%';
  get diagnostics v_market = row_count;

  return jsonb_build_object(
    'ok', true,
    'games_deleted', v_games,
    'market_games_deleted', v_market,
    'ratings_deleted', v_ratings
  );
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."e2e_storage_cleanup_peek"("p_owner_id" "uuid") RETURNS TABLE("bucket" "text", "path" "text", "attempts" integer, "last_error" "text", "created_at" timestamp with time zone, "claimed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is null or (v_email !~ '^test[0-9]+@familiada[.]online$' AND NOT public._e2e_account_email(v_email)) then
    raise exception 'e2e_only';
  end if;
  return query
  select q.bucket, q.path, q.attempts, q.last_error, q.created_at, q.claimed_at
  from public.storage_cleanup_queue q
  where q.owner_id = p_owner_id and q.path like (auth.uid()::text || '%');
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."e2e_registered_subscriber_fixture"("p_remove" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE uid uuid:=auth.uid(); caller text; recipient uuid; sid uuid;
BEGIN
 SELECT lower(email) INTO caller FROM auth.users WHERE id=uid;
 IF caller IS NULL OR (caller !~ '^test[1-7]@familiada[.]online$' AND NOT public._e2e_account_email(caller)) THEN
   RETURN jsonb_build_object('ok',false,'err','test accounts required'); END IF;
 SELECT id INTO recipient FROM auth.users WHERE lower(email)='test8@familiada.online';
 IF NOT coalesce(p_remove,false) AND (recipient IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.profiles WHERE id=recipient AND NOT is_guest)) THEN
   RETURN jsonb_build_object('ok',false,'err','recipient test account missing'); END IF;
 DELETE FROM public.poll_subscriptions WHERE owner_id=uid
 AND (registered_user_id=recipient OR public._norm_email(subscriber_email)='test8@familiada.online');
 IF coalesce(p_remove,false) THEN RETURN jsonb_build_object('ok',true,'removed',true); END IF;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status,accepted_at)
 VALUES(uid,'test8@familiada.online','active',now()) RETURNING id INTO sid;
 RETURN jsonb_build_object('ok',true,'id',sid,'recipient_user_id',recipient);
END; $_$;

CREATE OR REPLACE FUNCTION "public"."e2e_subscriber_mail_flag"("p_reset" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE caller text; stamp timestamptz;
BEGIN
 SELECT lower(email) INTO caller FROM auth.users WHERE id=auth.uid();
 IF caller IS NULL OR (caller !~ '^test[1-8]@familiada[.]online$' AND NOT public._e2e_account_email(caller)) THEN
   RETURN jsonb_build_object('ok',false,'err','test accounts required');
 END IF;
 SELECT suppressed_at INTO stamp FROM public.email_unsub_tokens
 WHERE public._norm_email(email)='test14@familiada.online';
 IF coalesce(p_reset,false) THEN
   UPDATE public.email_unsub_tokens SET suppressed_at=NULL
   WHERE public._norm_email(email)='test14@familiada.online';
 END IF;
 RETURN jsonb_build_object('ok',true,'previous_suppressed_at',stamp,
   'suppressed_at',CASE WHEN coalesce(p_reset,false) THEN NULL ELSE stamp END);
END; $_$;

CREATE OR REPLACE FUNCTION "public"."e2e_poll_mail_budget_cleanup"("p_recipient_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE uid uuid:=auth.uid(); caller text; recipient text:=public._norm_email(p_recipient_email); n integer;
BEGIN
 SELECT public._norm_email(email) INTO caller FROM auth.users WHERE id=uid;
 IF uid IS NULL OR caller IS NULL OR (caller !~ '^test[1-8]@familiada[.]online$' AND NOT public._e2e_account_email(caller))
 OR recipient IS NULL OR (recipient !~ '^test([1-8]|11|12|14|15)@familiada[.]online$' AND NOT public._e2e_any_email(recipient)) THEN
  RETURN jsonb_build_object('ok',false,'err','test_accounts_required'); END IF;
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=uid AND recipient_key=md5(recipient);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('ok',true,'deleted',n);
END; $_$;

CREATE OR REPLACE FUNCTION "public"."e2e_subscriber_email_cleanup"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE v_uid uuid:=auth.uid(); v_caller text; v_email text:=lower(trim(p_email));
BEGIN
  SELECT lower(email) INTO v_caller FROM auth.users WHERE id=v_uid;
  IF v_caller IS NULL OR (v_caller !~ '^test[1-8]@familiada[.]online$' AND NOT public._e2e_account_email(v_caller))
    OR (v_email NOT IN ('test14@familiada.online','test15@familiada.online') AND NOT public._e2e_any_email(v_email)) OR v_email IS NULL THEN
    RETURN jsonb_build_object('ok',false,'err','test accounts required');
  END IF;
  DELETE FROM public.poll_tasks WHERE owner_id=v_uid AND lower(recipient_email)=v_email;
  DELETE FROM public.poll_subscriptions WHERE owner_id=v_uid AND lower(subscriber_email)=v_email;
  DELETE FROM public.mail_cooldowns WHERE action_key LIKE 'poll:%'
    AND target_key LIKE 'pair:'||v_uid::text||':email:'||md5(v_email)||'%';
  DELETE FROM public.mail_cooldowns WHERE action_key='baseline:recipient'
    AND target_key='pair:'||v_uid::text||':'||md5(v_email);
  DELETE FROM public.email_cooldowns WHERE email_hash=md5(v_email);
  RETURN jsonb_build_object('ok',true);
END; $_$;

CREATE OR REPLACE FUNCTION "public"."mail_queue_cooldown_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_enforce boolean;
  v_ok boolean;
  v_until timestamptz;
  v_baseline_target text;
  v_sender_email text;
  v_both_e2e boolean;
BEGIN
  SELECT enforce INTO v_enforce
  FROM public.mail_cooldown_policies
  WHERE action_key = NEW.cooldown_action_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mail_queue: unknown cooldown_action_key %', NEW.cooldown_action_key;
  END IF;

  IF v_enforce THEN
    IF NEW.created_by IS NOT NULL THEN
      SELECT lower(email) INTO v_sender_email FROM auth.users WHERE id = NEW.created_by;
    END IF;

    v_both_e2e := v_sender_email ~ '^test([1-9]|1[0-3])@familiada[.]online$'
      AND lower(trim(NEW.to_email)) ~ '^test([1-9]|1[0-3])@familiada[.]online$';
    -- 462: także para tożsamości e2e (konto e2e -> dowolny adres e2e+)
    v_both_e2e := coalesce(v_both_e2e, false)
      OR (public._e2e_account_email(v_sender_email) AND public._e2e_any_email(NEW.to_email));

    IF NOT v_both_e2e THEN
      -- Nieprzekraczalna podłoga, niezależna od action_key — to jest to, co
      -- faktycznie zamyka dziurę (wymyślenie nowego, ale wciąż rozpoznanego
      -- action_key nie pomaga obejść TEJ rezerwacji). target_key per
      -- (nadawca, odbiorca) — 'svc:'+action_key jako fallback dla wierszy bez
      -- created_by (service-role), żeby różne serwisowe funkcje nie wpadały
      -- w jeden, wspólny koszyk.
      v_baseline_target := 'pair:' || coalesce(NEW.created_by::text, 'svc:' || NEW.cooldown_action_key)
        || ':' || md5(lower(trim(NEW.to_email)));

      SELECT ok, next_allowed_at INTO v_ok, v_until
      FROM public.mail_cooldown_reserve('baseline:recipient', v_baseline_target);

      IF NOT v_ok THEN
        RAISE EXCEPTION 'cooldown_active: baseline for % until %', NEW.to_email, v_until;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$_$;

-- Subskrybent zarejestrowany: adresat = wypożyczone konto e2e (zamiast test8).
CREATE OR REPLACE FUNCTION public.e2e_registered_subscriber_fixture(p_recipient_user_id uuid, p_remove boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE uid uuid := auth.uid(); caller text; recipient_email text; sid uuid;
BEGIN
  SELECT lower(email) INTO caller FROM auth.users WHERE id = uid;
  SELECT lower(email) INTO recipient_email FROM auth.users WHERE id = p_recipient_user_id;
  IF NOT public._e2e_account_email(caller) OR NOT public._e2e_account_email(recipient_email) OR uid = p_recipient_user_id THEN
    RETURN jsonb_build_object('ok', false, 'err', 'e2e accounts required');
  END IF;
  DELETE FROM public.poll_subscriptions WHERE owner_id = uid
    AND (registered_user_id = p_recipient_user_id OR public._norm_email(subscriber_email) = recipient_email);
  IF coalesce(p_remove, false) THEN RETURN jsonb_build_object('ok', true, 'removed', true); END IF;
  INSERT INTO public.poll_subscriptions(owner_id, subscriber_email, status, accepted_at)
  VALUES (uid, recipient_email, 'active', now()) RETURNING id INTO sid;
  RETURN jsonb_build_object('ok', true, 'id', sid, 'recipient_user_id', p_recipient_user_id);
END; $$;

-- Flaga poczty subskrybenta bez konta: adres = wypożyczona skrzynka noaccount (zamiast test14).
CREATE OR REPLACE FUNCTION public.e2e_subscriber_mail_flag(p_email text, p_reset boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE caller text; v_email text := public._norm_email(p_email); stamp timestamptz;
BEGIN
  SELECT lower(email) INTO caller FROM auth.users WHERE id = auth.uid();
  IF NOT public._e2e_account_email(caller) OR coalesce((public.e2e_identity(v_email)).role, '') <> 'noaccount' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'e2e accounts required');
  END IF;
  SELECT suppressed_at INTO stamp FROM public.email_unsub_tokens WHERE public._norm_email(email) = v_email;
  IF coalesce(p_reset, false) THEN
    UPDATE public.email_unsub_tokens SET suppressed_at = NULL WHERE public._norm_email(email) = v_email;
  END IF;
  RETURN jsonb_build_object('ok', true, 'previous_suppressed_at', stamp,
    'suppressed_at', CASE WHEN coalesce(p_reset, false) THEN NULL ELSE stamp END);
END; $$;

REVOKE ALL ON FUNCTION public.e2e_registered_subscriber_fixture(uuid, boolean), public.e2e_subscriber_mail_flag(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_registered_subscriber_fixture(uuid, boolean), public.e2e_subscriber_mail_flag(text, boolean) TO authenticated;
