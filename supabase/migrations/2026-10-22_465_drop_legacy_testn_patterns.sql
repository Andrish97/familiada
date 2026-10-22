-- E25: bez starych wzorców kont testN (decyzja użytkownika 2026-10-22:
-- konta test1…test17 usunięte w 463). Wszędzie zostają tylko tożsamości e2e
-- (e2e_identities, app_metadata.e2e_role, adresy e2e+) i goście testowi.

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
     OR NOT public._e2e_account_email(v_caller_email)
     OR NOT public._e2e_account_email(v_other_email) THEN
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
     or NOT public._e2e_account_email(v_email)
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

CREATE OR REPLACE FUNCTION "public"."e2e_poll_mail_budget_cleanup"("p_recipient_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE uid uuid:=auth.uid(); caller text; recipient text:=public._norm_email(p_recipient_email); n integer;
BEGIN
 SELECT public._norm_email(email) INTO caller FROM auth.users WHERE id=uid;
 IF uid IS NULL OR caller IS NULL OR NOT public._e2e_account_email(caller)
 OR recipient IS NULL OR NOT public._e2e_any_email(recipient) THEN
  RETURN jsonb_build_object('ok',false,'err','test_accounts_required'); END IF;
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=uid AND recipient_key=md5(recipient);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('ok',true,'deleted',n);
END; $_$;

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
     OR NOT public._e2e_account_email(v_caller_email)
     OR NOT public._e2e_account_email(v_other_email) THEN
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
     OR NOT public._e2e_account_email(v_caller_email)
     OR NOT public._e2e_account_email(v_other_email) THEN
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

CREATE OR REPLACE FUNCTION "public"."e2e_storage_cleanup_peek"("p_owner_id" "uuid") RETURNS TABLE("bucket" "text", "path" "text", "attempts" integer, "last_error" "text", "created_at" timestamp with time zone, "claimed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is null or NOT public._e2e_account_email(v_email) then
    raise exception 'e2e_only';
  end if;
  return query
  select q.bucket, q.path, q.attempts, q.last_error, q.created_at, q.claimed_at
  from public.storage_cleanup_queue q
  where q.owner_id = p_owner_id and q.path like (auth.uid()::text || '%');
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."e2e_subscriber_email_cleanup"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE v_uid uuid:=auth.uid(); v_caller text; v_email text:=lower(trim(p_email));
BEGIN
  SELECT lower(email) INTO v_caller FROM auth.users WHERE id=v_uid;
  IF v_caller IS NULL OR NOT public._e2e_account_email(v_caller)
    OR NOT public._e2e_any_email(v_email) OR v_email IS NULL THEN
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

    -- E25: para tożsamości e2e (konto e2e -> dowolny adres e2e+)
    v_both_e2e := public._e2e_account_email(v_sender_email) AND public._e2e_any_email(NEW.to_email);

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

CREATE OR REPLACE FUNCTION "public"."is_test_email"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
  SELECT coalesce(
    lower(btrim(p_email)) ~ '^e2e\+[a-z0-9.]+@familiada\.online$'
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE lower(p.email) = lower(btrim(p_email)) AND public.is_test_user(p.id)),
    false);
$_$;

CREATE OR REPLACE FUNCTION "public"."profiles_reserve_test_username"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE reason text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN RETURN NEW; END IF;
 reason:=public.reserved_username_reason(NEW.username);
 IF reason IS NULL THEN RETURN NEW; END IF;
 -- 460: e2e.<role><NN> tylko dla konta o adresie tej tożsamości
 IF reason='test' AND EXISTS (
 SELECT 1 FROM public.e2e_identities i JOIN auth.users u ON u.id=NEW.id
 WHERE i.name=lower(btrim(NEW.username)) AND i.role IN ('standard','disposable','dedicated')
 AND lower(u.email) IN (i.email, replace(i.email,'@','.new@'))
 ) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.reserved_username_accounts a WHERE a.user_id=NEW.id AND a.username=lower(btrim(NEW.username))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'username unavailable' USING ERRCODE='23505';
 RETURN NEW;
END $_$;

-- Wykluczenia ze statystyk: tożsamość e2e, e2e_role albo gość testowy.
CREATE OR REPLACE VIEW public.stats_exclusions_effective AS
 SELECT DISTINCT ON (user_id) user_id, added_at, reason FROM (
 SELECT user_id, added_at, 'manual'::text AS reason, 2 AS priority FROM public.stats_excluded_users
 UNION ALL
 SELECT p.id, p.created_at,
 CASE
   WHEN coalesce(u.raw_app_meta_data->>'is_test_guest','false')='true' THEN 'test_guest'
   WHEN i.role IS NOT NULL THEN 'test:' || i.role
   ELSE 'test:' || (u.raw_app_meta_data->>'e2e_role')
 END, 1
 FROM public.profiles p
 JOIN auth.users u ON u.id = p.id
 LEFT JOIN public.e2e_identities i ON i.user_id = u.id
 WHERE coalesce(u.raw_app_meta_data->>'is_test_guest','false')='true'
    OR u.raw_app_meta_data->>'e2e_role' IS NOT NULL
    OR i.user_id IS NOT NULL
 ) x ORDER BY user_id, priority;
REVOKE ALL ON public.stats_exclusions_effective FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stats_exclusions_effective TO service_role;

-- Skrzynka testowa: tylko adresy e2e+ (stare testN@ usunięte).
DELETE FROM public.e2e_emails WHERE recipient !~ '^e2e\+';
ALTER TABLE public.e2e_emails DROP CONSTRAINT e2e_emails_recipient_check;
ALTER TABLE public.e2e_emails ADD CONSTRAINT e2e_emails_recipient_check
  CHECK (recipient ~ '^e2e\+[a-z]+[0-9]{2}(\.new)?@familiada\.online$');

-- Prefiks nazw „test” rezerwował nazwy kont testN; konta testowe mają prefiks e2e.
DELETE FROM public.reserved_username_prefixes WHERE prefix = 'test';
