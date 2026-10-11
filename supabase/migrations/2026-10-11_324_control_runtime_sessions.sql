-- E19 krok 6: osobna sesja runtime Control. Telemetria game_sessions nie
-- jest źródłem TTL: jej heartbeat służy statystykom, nie aktywności operatora.
CREATE TABLE public.control_runtime_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  ended_at timestamptz,
  end_reason text CHECK (end_reason IS NULL OR end_reason IN ('idle', 'game_deleted'))
);
CREATE UNIQUE INDEX control_runtime_sessions_one_active_per_game
  ON public.control_runtime_sessions(game_id) WHERE ended_at IS NULL;
CREATE INDEX control_runtime_sessions_expiry_idx
  ON public.control_runtime_sessions(expires_at) WHERE ended_at IS NULL;
ALTER TABLE public.control_runtime_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.control_runtime_sessions FROM PUBLIC, anon, authenticated;

-- Tokeny do wysyłanych linków urządzeń są osobne od games.share_key_*.
-- Link odbiorcy jest per grant (control_device_shares), a link parowania
-- operatora jest per urządzenie i sesja Control.
CREATE TABLE public.control_device_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.control_runtime_sessions(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('display', 'host', 'buzzer')),
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, device_type)
);
ALTER TABLE public.control_device_link_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.control_device_link_tokens FROM PUBLIC, anon, authenticated;

CREATE TABLE public.control_device_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.control_runtime_sessions(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text,
  device_type text NOT NULL CHECK (device_type IN ('display', 'host', 'buzzer')),
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK ((recipient_id IS NOT NULL) <> (recipient_email IS NOT NULL)),
  CHECK (recipient_email IS NULL OR (recipient_email = lower(trim(recipient_email)) AND recipient_email <> ''))
);
CREATE UNIQUE INDEX control_device_shares_user_unique
  ON public.control_device_shares(session_id, recipient_id, device_type)
  WHERE recipient_id IS NOT NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX control_device_shares_email_unique
  ON public.control_device_shares(session_id, recipient_email, device_type)
  WHERE recipient_id IS NULL AND revoked_at IS NULL;
CREATE INDEX control_device_shares_session_idx ON public.control_device_shares(session_id);
ALTER TABLE public.control_device_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.control_device_shares FROM PUBLIC, anon, authenticated;

-- Stare udostępnienia nie wskazują konkretnej sesji i używają klucza gry,
-- więc nie da się ich bezpiecznie przypiąć do nowego modelu per odbiorca.
DELETE FROM public.shared_devices;

CREATE OR REPLACE FUNCTION public.control_device_key_valid(
  p_game_id uuid, p_device_type text, p_key text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE g public.games;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_device_type NOT IN ('display','host','buzzer') THEN RETURN false; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id;
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.control_device_link_tokens t
    JOIN public.control_runtime_sessions s ON s.id=t.session_id
    WHERE t.game_id=p_game_id AND t.device_type=p_device_type AND t.token::text=p_key
      AND s.ended_at IS NULL AND s.expires_at>now()
  ) OR EXISTS (
    SELECT 1 FROM public.control_device_shares sh
    JOIN public.control_runtime_sessions s ON s.id=sh.session_id
    WHERE sh.game_id=p_game_id AND sh.device_type=p_device_type AND sh.token::text=p_key
      AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_key_valid(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.control_device_key_valid(uuid,text,text) TO postgres, supabase_admin;

CREATE OR REPLACE FUNCTION public.control_runtime_device_link(p_game_id uuid, p_device_type text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_owner uuid; v_session public.control_runtime_sessions; v_token uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  SELECT * INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND ended_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;
  INSERT INTO public.control_device_link_tokens(session_id,game_id,device_type)
    VALUES(v_session.id,p_game_id,p_device_type)
    ON CONFLICT(session_id,device_type) DO UPDATE SET game_id=EXCLUDED.game_id
    RETURNING token INTO v_token;
  RETURN jsonb_build_object('ok',true,'token',v_token,'session_id',v_session.id,'expires_at',v_session.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.control_runtime_device_link(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_runtime_device_link(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.control_device_share_create(
  p_game_id uuid,
  p_device_type text,
  p_recipient_user_id uuid DEFAULT NULL,
  p_recipient_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_owner uuid; v_session public.control_runtime_sessions;
  v_recipient uuid:=p_recipient_user_id; v_email text:=lower(trim(coalesce(p_recipient_email,'')));
  v_created public.control_device_shares; v_existing public.control_device_shares;
  v_target text; v_flag boolean:=true; v_mail_allowed boolean:=false; v_until timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  IF (p_recipient_user_id IS NOT NULL) = (p_recipient_email IS NOT NULL) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_required');
  END IF;
  IF p_recipient_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_email');
  END IF;

  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  SELECT * INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND ended_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;

  IF v_email<>'' THEN
    SELECT id INTO v_recipient FROM auth.users WHERE lower(email)=v_email LIMIT 1;
  END IF;
  IF v_recipient IS NOT NULL AND v_recipient=v_uid THEN RETURN jsonb_build_object('ok',false,'error','self_share'); END IF;
  IF v_recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_recipient) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_not_found');
  END IF;
  IF v_recipient IS NOT NULL THEN v_email:=''; END IF;

  SELECT * INTO v_existing FROM public.control_device_shares
  WHERE session_id=v_session.id AND device_type=p_device_type AND revoked_at IS NULL
    AND ((v_recipient IS NOT NULL AND recipient_id=v_recipient)
      OR (v_recipient IS NULL AND lower(recipient_email)=v_email))
  LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'created',false,'share_id',v_existing.id,
      'token',v_existing.token,'recipient_id',v_existing.recipient_id,
      'recipient_email',v_existing.recipient_email,'mail_allowed',false);
  END IF;

  INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_id,recipient_email,device_type)
  VALUES(v_session.id,p_game_id,v_uid,v_recipient,CASE WHEN v_recipient IS NULL THEN v_email END,p_device_type)
  RETURNING * INTO v_created;

  IF v_recipient IS NOT NULL THEN
    SELECT COALESCE(email_notifications,true) INTO v_flag FROM public.user_flags WHERE user_id=v_recipient;
    v_flag:=COALESCE(v_flag,true);
    v_target:='pair:'||v_uid::text||':'||v_recipient::text||':device:'||p_device_type||':game:'||p_game_id::text;
  ELSE
    v_target:='pair:'||v_uid::text||':'||md5(v_email)||':device:'||p_device_type||':game:'||p_game_id::text;
  END IF;
  IF v_flag THEN
    SELECT ok,next_allowed_at INTO v_mail_allowed,v_until
      FROM public.mail_cooldown_reserve('device:share',v_target);
  END IF;
  RETURN jsonb_build_object('ok',true,'created',true,'share_id',v_created.id,'token',v_created.token,
    'recipient_id',v_created.recipient_id,'recipient_email',v_created.recipient_email,
    'mail_allowed',v_mail_allowed,'mail_disabled',v_recipient IS NOT NULL AND NOT v_flag,
    'cooldown_until',v_until,'cooldown_target_key',v_target);
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_share_create(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_device_share_create(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.control_device_share_preflight(
  p_game_id uuid,p_device_type text,p_recipient_user_id uuid DEFAULT NULL,p_recipient_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_uid uuid:=auth.uid(); v_recipient uuid:=p_recipient_user_id; v_email text:=lower(trim(coalesce(p_recipient_email,'')));
  v_session uuid; v_target text; v_flag boolean:=true; v_ok boolean; v_until timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=v_uid) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  SELECT id INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND ended_at IS NULL AND expires_at>now();
  IF v_session IS NULL THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;
  IF p_recipient_email IS NOT NULL THEN
    SELECT id INTO v_recipient FROM auth.users WHERE lower(email)=v_email LIMIT 1;
  END IF;
  IF v_recipient IS NOT NULL THEN
    SELECT COALESCE(email_notifications,true) INTO v_flag FROM public.user_flags WHERE user_id=v_recipient;
    v_flag:=COALESCE(v_flag,true);
    v_target:='pair:'||v_uid::text||':'||v_recipient::text||':device:'||p_device_type||':game:'||p_game_id::text;
  ELSE
    v_target:='pair:'||v_uid::text||':'||md5(v_email)||':device:'||p_device_type||':game:'||p_game_id::text;
  END IF;
  IF EXISTS(SELECT 1 FROM public.control_device_shares WHERE session_id=v_session AND device_type=p_device_type
      AND revoked_at IS NULL AND ((v_recipient IS NOT NULL AND recipient_id=v_recipient)
        OR (v_recipient IS NULL AND recipient_email=v_email))) THEN
    RETURN jsonb_build_object('ok',true,'already_shared',true,'mail_disabled',v_recipient IS NOT NULL AND NOT v_flag);
  END IF;
  SELECT c.ok,c.next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('device:share',v_target) c;
  RETURN jsonb_build_object('ok',true,'already_shared',false,'mail_disabled',v_recipient IS NOT NULL AND NOT v_flag,
    'mail_allowed',coalesce(v_ok,true),'cooldown_until',v_until);
END $$;
REVOKE ALL ON FUNCTION public.control_device_share_preflight(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_device_share_preflight(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.control_device_share_revoke(p_share_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_share public.control_device_shares;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_share FROM public.control_device_shares WHERE id=p_share_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'revoked',false); END IF;
  IF v_share.owner_id<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  IF v_share.revoked_at IS NULL THEN
    UPDATE public.control_device_shares SET revoked_at=now() WHERE id=p_share_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'revoked',true);
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_share_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_device_share_revoke(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.control_device_shares_list(p_game_id uuid,p_device_type text)
RETURNS TABLE(
  share_id uuid, recipient_id uuid, recipient_username text, recipient_email text,
  recipient_kind text, share_token uuid, created_at timestamptz, is_friend boolean,
  cooldown_until timestamptz
)
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
    CASE WHEN sh.recipient_id IS NULL THEN sh.recipient_email ELSE u.email END,
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
REVOKE ALL ON FUNCTION public.control_device_shares_list(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_device_shares_list(uuid,text) TO authenticated;

-- /connect/ i Zadania urządzeń używają dotychczasowego kontraktu list_shared_devices_for_me;
-- zwracamy teraz token per odbiorca zamiast globalnego games.share_key_*.
CREATE OR REPLACE FUNCTION public.list_shared_devices_for_me()
RETURNS TABLE(
  share_id uuid,device_type text,owner_id uuid,owner_username text,owner_email text,
  game_id uuid,game_name text,expires_at timestamptz,share_key text
)
LANGUAGE sql SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT sh.id,sh.device_type,sh.owner_id,p.username,u.email,
    sh.game_id,g.name,s.expires_at,sh.token::text
  FROM public.control_device_shares sh
  JOIN public.control_runtime_sessions s ON s.id=sh.session_id
  JOIN public.games g ON g.id=sh.game_id
  LEFT JOIN public.profiles p ON p.id=sh.owner_id
  LEFT JOIN auth.users u ON u.id=sh.owner_id
  WHERE sh.recipient_id=auth.uid() AND sh.revoked_at IS NULL
    AND s.ended_at IS NULL AND s.expires_at>now()
  ORDER BY sh.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.list_shared_devices_for_me() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_shared_devices_for_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.control_device_share_resolve(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE sh public.control_device_shares; t public.control_device_link_tokens;
        s public.control_runtime_sessions; v_game_name text; v_owner_name text;
BEGIN
  SELECT * INTO sh FROM public.control_device_shares WHERE token=p_token;
  IF FOUND THEN
    SELECT * INTO s FROM public.control_runtime_sessions WHERE id=sh.session_id;
    IF sh.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'state','revoked'); END IF;
    IF NOT FOUND OR s.ended_at IS NOT NULL OR s.expires_at<=now() THEN
      IF FOUND AND s.ended_at IS NULL AND s.expires_at<=now() THEN PERFORM public.control_runtime_expire_one(s.id); END IF;
      RETURN jsonb_build_object('ok',false,'state','expired');
    END IF;
    SELECT g.name,p.username INTO v_game_name,v_owner_name FROM public.games g
      LEFT JOIN public.profiles p ON p.id=g.owner_id WHERE g.id=sh.game_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','expired'); END IF;
    RETURN jsonb_build_object('ok',true,'state','active','kind','share','game_id',sh.game_id,
      'device_type',sh.device_type,'key',sh.token,'game_name',v_game_name,'owner_username',v_owner_name);
  END IF;

  SELECT * INTO t FROM public.control_device_link_tokens WHERE token=p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','invalid'); END IF;
  SELECT * INTO s FROM public.control_runtime_sessions WHERE id=t.session_id;
  IF NOT FOUND OR s.ended_at IS NOT NULL OR s.expires_at<=now() THEN
    IF FOUND AND s.ended_at IS NULL AND s.expires_at<=now() THEN PERFORM public.control_runtime_expire_one(s.id); END IF;
    RETURN jsonb_build_object('ok',false,'state','expired');
  END IF;
  SELECT g.name,p.username INTO v_game_name,v_owner_name FROM public.games g
    LEFT JOIN public.profiles p ON p.id=g.owner_id WHERE g.id=t.game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','expired'); END IF;
  RETURN jsonb_build_object('ok',true,'state','active','kind','pairing','game_id',t.game_id,
    'device_type',t.device_type,'key',t.token,'game_name',v_game_name,'owner_username',v_owner_name);
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_share_resolve(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_device_share_resolve(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.control_runtime_expire_one(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
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
  DELETE FROM public.display_audio_unlock WHERE game_id = v_session.game_id;
  DELETE FROM public.shared_devices WHERE game_id = v_session.game_id;
  UPDATE public.control_runtime_sessions
  SET ended_at = now(), end_reason = 'idle'
  WHERE id = p_session_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.control_runtime_session_touch(
  p_game_id uuid,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_session public.control_runtime_sessions;
  v_expired boolean := false;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'gone'); END IF;
  IF v_owner <> v_uid THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;

  SELECT * INTO v_session FROM public.control_runtime_sessions
  WHERE game_id = p_game_id AND ended_at IS NULL FOR UPDATE;

  IF FOUND AND v_session.expires_at <= v_now THEN
    PERFORM public.control_runtime_expire_one(v_session.id);
    v_expired := true;
    v_session := NULL;
  ELSIF FOUND AND p_session_id IS NOT NULL AND p_session_id <> v_session.id THEN
    -- Stara karta po wygaśnięciu nie może odświeżać ani przejąć nowej sesji.
    RETURN jsonb_build_object('ok', true, 'expired', true, 'session_id', v_session.id,
      'expires_at', v_session.expires_at);
  END IF;

  IF v_session.id IS NULL THEN
    IF p_session_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.control_runtime_sessions
        WHERE game_id = p_game_id AND id = p_session_id
          AND end_reason = 'idle' AND ended_at > v_now - interval '2 hours'
      ) INTO v_expired;
    END IF;
    INSERT INTO public.control_runtime_sessions(game_id, owner_id, last_activity_at, expires_at)
    VALUES (p_game_id, v_uid, v_now, v_now + interval '1 hour')
    RETURNING * INTO v_session;
  ELSE
    UPDATE public.control_runtime_sessions
    SET last_activity_at = v_now, expires_at = v_now + interval '1 hour'
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object('ok', true, 'expired', v_expired, 'session_id', v_session.id,
    'expires_at', v_session.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.control_runtime_expire_due()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_session record;
  v_count integer := 0;
BEGIN
  FOR v_session IN
    SELECT id FROM public.control_runtime_sessions
    WHERE ended_at IS NULL AND expires_at <= now()
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.control_runtime_expire_one(v_session.id) THEN v_count := v_count + 1; END IF;
  END LOOP;
  DELETE FROM public.control_runtime_sessions
  WHERE ended_at IS NOT NULL AND ended_at < now() - interval '90 days';
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.control_runtime_expire_one(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.control_runtime_expire_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.control_runtime_expire_due() TO postgres, supabase_admin;
REVOKE ALL ON FUNCTION public.control_runtime_session_touch(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_runtime_session_touch(uuid, uuid) TO authenticated;

-- Cron jest wyłączony w lekkich lokalnych stubach; produkcyjnie utrzymuje TTL
-- nawet wtedy, gdy właściciel nie wraca na stronę.
DO $$
DECLARE v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''control-runtime-expiry'' LIMIT 1'
      INTO v_job_id;
    IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
    PERFORM cron.schedule('control-runtime-expiry', '* * * * *',
      'SELECT public.control_runtime_expire_due()');
  END IF;
END $$;

-- Wszystkie RPC używane przez urządzenia akceptują wyłącznie token konkretnego
-- linku (lub token parowania bieżącej sesji). Dzięki temu cofnięcie grantu i
-- wygaśnięcie sesji działają także dla już otwartej karty urządzenia.
CREATE OR REPLACE FUNCTION public.device_ping(
  p_game_id uuid, p_device_type public.device_type, p_key text,
  p_device_id text DEFAULT NULL, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE did text;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type::text,p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  did:=nullif(trim(coalesce(p_device_id,'')),'');
  IF did IS NULL THEN did:=encode(gen_random_bytes(8),'hex'); END IF;
  INSERT INTO public.device_presence(game_id,device_type,device_id,last_seen_at,meta)
  VALUES(p_game_id,p_device_type,did,now(),coalesce(p_meta,'{}'::jsonb))
  ON CONFLICT(game_id,device_type,device_id) DO UPDATE
    SET last_seen_at=excluded.last_seen_at,meta=excluded.meta;
  RETURN jsonb_build_object('ok',true,'device_id',did,'ts',now());
END $$;

CREATE OR REPLACE FUNCTION public.display_auth(p_game_id uuid,p_key text)
RETURNS TABLE(id uuid,name text,type public.game_type,status public.game_status)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT g.id,g.name,g.type,g.status FROM public.games g
  WHERE g.id=p_game_id AND public.control_device_key_valid(p_game_id,'display',p_key)
$$;

CREATE OR REPLACE FUNCTION public.game_state_get(
  p_game_id uuid,p_device_type public.device_type,p_key text
) RETURNS public.game_state LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE out public.game_state;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type::text,p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO out FROM public.game_state WHERE game_id=p_game_id;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.game_state_buzzer_press(
  p_game_id uuid,p_key text,p_team public.game_team
) RETURNS public.game_state LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_new public.game_state;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'buzzer',p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.game_state SET detail=jsonb_set(detail,'{rounds,duel,lastPressed}',to_jsonb(p_team::text)),
    rev=rev+1,updated_at=now()
  WHERE game_id=p_game_id AND step='r_duel'
    AND (detail #>> '{rounds,duel,lastPressed}') IS NULL
  RETURNING * INTO v_new;
  IF NOT FOUND THEN RAISE EXCEPTION 'already_pressed'; END IF;
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.game_state_display_complete(p_game_id uuid,p_key text,p_rev bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_rev bigint;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'display',p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT rev INTO current_rev FROM public.game_state WHERE game_id=p_game_id;
  IF current_rev IS NULL OR p_rev IS NULL OR p_rev<0 OR p_rev>current_rev THEN RAISE EXCEPTION 'invalid revision'; END IF;
  INSERT INTO public.game_state_display_completion(game_id,rendered_rev) VALUES(p_game_id,p_rev)
  ON CONFLICT(game_id) DO UPDATE SET rendered_rev=greatest(game_state_display_completion.rendered_rev,excluded.rendered_rev);
END $$;

CREATE OR REPLACE FUNCTION public.game_state_display_is_ready(p_game_id uuid,p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'display',p_key)
     AND NOT public.control_device_key_valid(p_game_id,'buzzer',p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN coalesce((SELECT rendered_rev>=requested_rev FROM public.game_state_display_completion WHERE game_id=p_game_id),false);
END $$;

CREATE OR REPLACE FUNCTION public.begin_display_audio_session(p_game_id uuid,p_key text,p_session_nonce text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'display',p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_session_nonce IS NULL OR length(p_session_nonce)<8 OR length(p_session_nonce)>100 THEN RAISE EXCEPTION 'invalid nonce'; END IF;
  INSERT INTO public.display_audio_unlock(game_id,session_nonce,request_nonce,acknowledged_nonce,requested_at,acknowledged_at)
  VALUES(p_game_id,p_session_nonce,p_session_nonce,NULL,now(),NULL)
  ON CONFLICT(game_id) DO UPDATE SET session_nonce=EXCLUDED.session_nonce,
    request_nonce=EXCLUDED.request_nonce,acknowledged_nonce=NULL,requested_at=now(),acknowledged_at=NULL;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.acknowledge_display_audio_unlock(p_game_id uuid,p_key text,p_nonce text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'display',p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.display_audio_unlock SET acknowledged_nonce=request_nonce,acknowledged_at=now()
    WHERE game_id=p_game_id AND request_nonce=p_nonce;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.display_logo_get_public(p_game_id uuid,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid; v_logo_id uuid; v_logo jsonb;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'display',p_key)
     AND NOT public.control_device_key_valid(p_game_id,'host',p_key) THEN RETURN NULL; END IF;
  SELECT owner_id,nullif(settings->'display'->>'logoId','')::uuid INTO v_owner,v_logo_id
    FROM public.games WHERE id=p_game_id;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF v_logo_id IS NOT NULL THEN
    SELECT jsonb_build_object('type',type,'payload',payload,'name',name) INTO v_logo
      FROM public.user_logos WHERE id=v_logo_id AND user_id=v_owner;
  END IF;
  RETURN v_logo;
END $$;

CREATE OR REPLACE FUNCTION public.host2_logo_get_public(p_game_id uuid,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.games; logo_id uuid; logo jsonb; busy boolean;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'host',p_key) THEN RETURN NULL; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id;
  logo_id:=nullif(g.settings->'display'->>'logoId','')::uuid;
  IF logo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_logos l WHERE l.id=logo_id AND l.user_id=g.owner_id) THEN logo_id:=NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM public.edit_locks l WHERE l.resource_type='logo' AND l.resource_id=logo_id
    AND l.heartbeat_at>now()-public.edit_lock_ttl()) INTO busy;
  IF NOT busy AND logo_id IS NOT NULL THEN
    SELECT jsonb_build_object('type',l.type,'payload',l.payload,'name',l.name) INTO logo
      FROM public.user_logos l WHERE l.id=logo_id AND l.user_id=g.owner_id;
  END IF;
  RETURN jsonb_build_object('busy',busy,'logo',logo,'logoId',logo_id);
END $$;

REVOKE ALL ON FUNCTION public.device_ping(uuid,public.device_type,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.device_ping(uuid,public.device_type,text,text,jsonb) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.display_auth(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.display_auth(uuid,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.game_state_get(uuid,public.device_type,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_get(uuid,public.device_type,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.game_state_buzzer_press(uuid,text,public.game_team) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_buzzer_press(uuid,text,public.game_team) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.game_state_display_complete(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_display_complete(uuid,text,bigint) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.game_state_display_is_ready(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_state_display_is_ready(uuid,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.begin_display_audio_session(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_display_audio_session(uuid,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.acknowledge_display_audio_unlock(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_display_audio_unlock(uuid,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.display_logo_get_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.display_logo_get_public(uuid,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.host2_logo_get_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host2_logo_get_public(uuid,text) TO anon,authenticated;

NOTIFY pgrst, 'reload schema';
