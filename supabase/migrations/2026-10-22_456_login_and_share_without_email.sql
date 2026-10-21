-- Bezpieczeństwo (audyt E24, paczka P2: B7, B8, N5; 2026-10-22).
--
-- B7: nazwa użytkownika -> e-mail tylko po stronie serwera. Logowanie i reset
--     hasła po nazwie idą przez Worker (/_api/auth/login, /_api/auth/reset),
--     więc profile_login_to_email zostaje tylko dla service_role.
--     Udostępnianie po nazwie nie zwraca adresu e-mail odbiorcy: maile
--     powiadomień buduje funkcja Edge send-mail z przydziału w bazie
--     (przeglądarka podaje tylko token z linku), więc RPC udostępnień nie
--     muszą oddawać adresu. Wewnętrzne funkcje, które go zwracają -- tylko
--     dla właściciela (wołają je wyłącznie funkcje SECURITY DEFINER).
-- B8/N5: stan adresu przy rejestracji i ponowne wysłanie potwierdzenia przez
--     Worker (limity na IP i adres) -- email_get_status i email_resend_prepare
--     tylko dla service_role. get_email_intent_status (strona potwierdzenia)
--     mówi tylko, czy zmiana adresu została anulowana.
-- Dodatkowo: get_unsub_info_for_task_emails (tokeny wypisania dowolnego
--     właściciela po samym adresie) -- tylko service_role (woła ją send-mail).

DO $$
DECLARE
  fn record;
  n int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE s.nspname = 'public' AND p.proname IN (
      'profile_login_to_email', 'email_get_status', 'email_resend_prepare', 'get_unsub_info_for_task_emails',
      '_base_share_create', '_mail_original361_base_share_create', '_mail_original361_base_share_resend',
      '_control_share_recipient_lookup', '_mail_original361_control_device_share_create',
      '_mail_original361_friends_invite', '_mail_original361_friends_resend')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    n := n + 1;
  END LOOP;
  IF n <> 11 THEN
    RAISE EXCEPTION 'login_and_share_without_email: oczekiwano 11 funkcji, jest %', n;
  END IF;
END $$;

-- Strona potwierdzenia: tylko „zmiana adresu anulowana” (bez stanu konta).
CREATE OR REPLACE FUNCTION public.get_email_intent_status(p_email text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'expired'::text FROM public.email_intents
  WHERE email = lower(p_email) AND status = 'expired' LIMIT 1;
$$;

-- Udostępnienie bazy: bez adresu odbiorcy; link tylko, gdy mail ma wyjść.
CREATE OR REPLACE FUNCTION public.base_share_by_user(p_base_id uuid, p_user_lookup text, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamp with time zone, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lookup text := lower(trim(p_user_lookup));
  v_recipient uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND public._poll_identity_regular(u.id,to_jsonb(u))) OR NOT EXISTS (
    SELECT 1 FROM public.question_bases qb WHERE qb.id = p_base_id AND qb.owner_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT pr.id INTO v_recipient FROM public.profiles pr JOIN auth.users u ON u.id=pr.id
  WHERE NOT pr.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u))
    AND ((position('@' in v_lookup)>0 AND public._poll_registered_uid(v_lookup)=pr.id)
      OR (position('@' in v_lookup)=0 AND lower(trim(pr.username))=v_lookup)) LIMIT 1;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT r.ok, r.err, NULL::text, CASE WHEN r.mail_to IS NOT NULL THEN r.mail_link END,
    r.base_name, r.owner_label, r.cooldown_until, r.recipient_id
  FROM public._base_share_create(p_base_id, v_recipient, p_role, false, CASE WHEN position('@' in v_lookup)>0 THEN v_lookup END) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.base_share_by_user(p_base_id uuid, p_recipient_user_id uuid, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamp with time zone, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$ BEGIN
 RETURN QUERY SELECT r.ok, r.err, NULL::text, CASE WHEN r.mail_to IS NOT NULL THEN r.mail_link END,
   r.base_name, r.owner_label, r.cooldown_until, r.recipient_id
 FROM public._base_share_create(p_base_id,p_recipient_user_id,p_role,false) r;
 END $$;

CREATE OR REPLACE FUNCTION public.base_share_to_friend(p_base_id uuid, p_recipient_user_id uuid, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamp with time zone, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$ BEGIN
 RETURN QUERY SELECT r.ok, r.err, NULL::text, CASE WHEN r.mail_to IS NOT NULL THEN r.mail_link END,
   r.base_name, r.owner_label, r.cooldown_until, r.recipient_id
 FROM public._base_share_create(p_base_id,p_recipient_user_id,p_role,true) r;
 END $$;

CREATE OR REPLACE FUNCTION public.base_share_resend(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_base_share_resend(p_task_id);
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification('base',p_task_id,'base:share'); END IF;
 RETURN result - 'mail_to';
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.friends_invite(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_friends_invite(p_handle);
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' AND result->>'id' IS NOT NULL THEN PERFORM public._mail_allocate_notification('friend',(result->>'id')::uuid,'friend:invite'); END IF;
 RETURN result - 'to';
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.friends_resend(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_friends_resend(p_id);
 IF result->>'ok'='true' AND result->>'to' IS NOT NULL THEN PERFORM public._mail_allocate_notification('friend',p_id,'friend:resend'); END IF;
 RETURN result - 'to';
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.control_device_share_create(p_game_id uuid, p_device_type text, p_recipient_user_id uuid DEFAULT NULL::uuid, p_recipient_email text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_control_device_share_create(p_game_id,p_device_type,p_recipient_user_id,p_recipient_email);
 IF result->>'ok'='true' THEN IF result->>'created'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification('device',(result->>'share_id')::uuid,'device:share'); END IF; END IF;
 RETURN result - 'mail_to';
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

-- Panel udostępnień bazy: adres e-mail odbiorcy tylko dla znajomych
-- (znajomi i tak widzą swoje adresy); pozostali -- sama nazwa użytkownika.
CREATE OR REPLACE FUNCTION public.base_share_panel(p_base_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE uid uuid:=auth.uid(); b public.question_bases%rowtype; friends jsonb; outgoing jsonb; active jsonb;
BEGIN
 SELECT * INTO b FROM public.question_bases WHERE id=p_base_id AND owner_id=uid;
 IF uid IS NULL OR NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,
  'cooldown_until',greatest(public._base_share_refusal_until(p_base_id,f.user_id),
   (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c WHERE public._contact_mail_enabled(f.email) AND c.action_key='base:share' AND c.next_allowed_at>now()
    AND c.target_key='pair:'||uid||':'||f.user_id||':base:'||p_base_id)),
  'email_enabled',public._contact_mail_enabled(f.email)) ORDER BY f.label),'[]'::jsonb) INTO friends
 FROM public.friends_list() f WHERE f.status='active' AND f.direction='friend'
 AND NOT EXISTS(SELECT 1 FROM public.question_base_shares s WHERE s.base_id=p_base_id AND s.user_id=f.user_id)
 AND NOT EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.base_id=p_base_id AND t.recipient_user_id=f.user_id
  AND t.status IN ('pending','opened') AND t.cancelled_at IS NULL
  AND coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now());
 SELECT coalesce(jsonb_agg(jsonb_build_object('task_id',x.id,'recipient_user_id',x.recipient_user_id,
  'label',coalesce(nullif(x.username,''),CASE WHEN x.friend THEN x.recipient_email END),
  'email',CASE WHEN x.friend THEN x.recipient_email END,'role',x.role,'status',x.status,
  'is_friend',x.friend,'email_enabled',public._contact_mail_enabled(x.profile_email),
  'declined_at',x.declined_at,'expires_at',coalesce(x.declined_at+interval '30 days',x.created_at+interval '5 days'),
  'cooldown_until',CASE WHEN x.status='declined' THEN public._base_share_refusal_until(p_base_id,x.recipient_user_id)
    ELSE (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c WHERE c.action_key='base:share' AND c.next_allowed_at>now()
     AND c.target_key='pair:'||uid||':'||x.recipient_user_id||':base:'||p_base_id) END)
 ORDER BY x.created_at DESC),'[]'::jsonb) INTO outgoing
 FROM (SELECT t.*, p.username, p.email AS profile_email, public.are_friends(uid,t.recipient_user_id) AS friend
  FROM public.base_share_tasks t JOIN public.profiles p ON p.id=t.recipient_user_id
  WHERE t.base_id=p_base_id AND t.owner_id=uid AND t.cancelled_at IS NULL
  AND ((t.status IN ('pending','opened') AND coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now())
  OR (t.status='declined' AND t.declined_at>now()-interval '5 days'))) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',x.user_id,'label',coalesce(nullif(x.username,''),CASE WHEN x.friend THEN x.email END),
  'email',CASE WHEN x.friend THEN x.email END,'role',x.role,'status','done','is_friend',x.friend) ORDER BY x.username),'[]'::jsonb) INTO active
 FROM (SELECT s.user_id, s.role, p.username, p.email, public.are_friends(uid,s.user_id) AS friend
  FROM public.question_base_shares s JOIN public.profiles p ON p.id=s.user_id WHERE s.base_id=p_base_id) x;
 RETURN jsonb_build_object('ok',true,'friends',friends,'outgoing',outgoing,'active',active);
END; $$;

-- Urządzenia udostępnione w Control: adres konta odbiorcy tylko dla znajomych
-- (udostępnienie na sam adres e-mail pokazuje adres wpisany przez właściciela).
CREATE OR REPLACE FUNCTION public.control_device_shares_list(p_game_id uuid, p_device_type text)
RETURNS TABLE(share_id uuid, recipient_id uuid, recipient_username text, recipient_email text, recipient_kind text, share_token uuid, created_at timestamp with time zone, is_friend boolean, cooldown_until timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT sh.id, sh.recipient_id, p.username,
    (CASE WHEN sh.recipient_id IS NULL THEN sh.recipient_email
      WHEN public.are_friends(v_uid,sh.recipient_id) THEN u.email END)::text,
    CASE WHEN sh.recipient_id IS NULL THEN 'mail'
      WHEN public.are_friends(v_uid,sh.recipient_id) THEN 'friend' ELSE 'account' END,
    sh.token,sh.created_at,
    coalesce(public.are_friends(v_uid,sh.recipient_id),false),
    (SELECT mc.next_allowed_at FROM public.mail_cooldowns mc
      WHERE mc.action_key='device:share' AND mc.target_key = CASE
        WHEN sh.recipient_id IS NOT NULL THEN 'pair:'||v_uid::text||':'||sh.recipient_id::text||':device:'||p_device_type||':game:'||p_game_id::text
        ELSE 'pair:'||v_uid::text||':'||md5(sh.recipient_email)||':device:'||p_device_type||':game:'||p_game_id::text END)
  FROM public.control_device_shares sh
  JOIN public.control_runtime_sessions s ON s.id=sh.session_id
  LEFT JOIN public.profiles p ON p.id=sh.recipient_id
  LEFT JOIN auth.users u ON u.id=sh.recipient_id
  WHERE sh.game_id=p_game_id AND sh.owner_id=v_uid AND sh.device_type=p_device_type
    AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
  ORDER BY sh.created_at DESC;
END;
$$;
