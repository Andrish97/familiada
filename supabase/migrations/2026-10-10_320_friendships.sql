-- Migracja 320 (E19 krok 1): znajomi (friendships), skrzynka zadań i plakietki.
-- Wyłącznie dodająca: nowa tabela i nowe funkcje; jedyna zmiana istniejącego
-- obiektu to site_activity_ping (trzy nowe nazwy stron). Żadna dotychczasowa
-- funkcja (poll_claim_email_records, polls_hub_*) nie jest zmieniana ani
-- podpinana — to kroki 3+ (docs/e19-znajomi-plan.md).
--
-- Obiekty: tabela friendships (+ indeksy, RLS ENABLE+FORCE, polityka SELECT),
-- are_friends, _friend_mail_limit_until, _friend_drop_pair_tasks (wewnętrzna),
-- polityki mail_cooldown_policies friend:invite / friend:resend /
-- friend:invite_after_reject, RPC: friends_invite, friends_list,
-- friends_accept, friends_reject, friends_cancel, friends_remove,
-- friends_resend, friends_token_info, friend_invites_from_subscriptions,
-- tasks_list, badges_get, e2e_friendships_cleanup; jednorazowa idempotentna
-- kopia poll_subscriptions (konta) -> friendships; site_activity_ping.
BEGIN;

-- ============================================================================
-- 1. Tabela friendships
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.friendships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending',
  token            uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at      timestamptz,
  email_sent_at    timestamptz,
  email_send_count integer NOT NULL DEFAULT 0,
  CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'active')),
  CONSTRAINT friendships_distinct_chk CHECK (requester_id <> addressee_id),
  CONSTRAINT friendships_token_key UNIQUE (token)
);

-- Jedna relacja na parę nieuporządkowaną.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uniq
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships (addressee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friendships_select_parties ON public.friendships;
CREATE POLICY friendships_select_parties ON public.friendships
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Zapis wyłącznie przez RPC SECURITY DEFINER; klient może tylko czytać.
REVOKE ALL ON TABLE public.friendships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;

-- ============================================================================
-- 2. are_friends
-- ============================================================================
CREATE OR REPLACE FUNCTION public.are_friends(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'active'
      AND ((f.requester_id = a AND f.addressee_id = b)
        OR (f.requester_id = b AND f.addressee_id = a))
  )
$$;
REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;

-- ============================================================================
-- 3. Polityki cooldownów maili
-- ============================================================================
INSERT INTO public.mail_cooldown_policies (action_key, scope, cooldown_seconds, enforce, description) VALUES
  ('friend:invite', 'pair', 432000, true,
   'Zaproszenie do znajomych — 5 dni na parę (rezerwuje friends_invite)'),
  ('friend:resend', 'pair', 432000, true,
   'Ponowne wysłanie zaproszenia do znajomych — 5 dni; najwyżej 2 maile na parę w oknie 30 dni (_friend_mail_limit_until)'),
  ('friend:invite_after_reject', 'pair', 2592000, true,
   'Po odrzuceniu zaproszenia do znajomych — 30 dni bez nowego zaproszenia od tego nadawcy (rezerwuje friends_reject, sprawdza friends_invite)')
ON CONFLICT (action_key) DO NOTHING;

-- ============================================================================
-- Funkcje pomocnicze (wewnętrzne)
-- ============================================================================

-- Limit maili zaproszenia na parę: po 2 wysłanych w oknie 30 dni — blokada
-- do 30 dni od ostatniego (jak _poll_sub_mail_limit_until).
CREATE OR REPLACE FUNCTION public._friend_mail_limit_until(p_requester uuid, p_addressee uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN coalesce(sum(f.email_send_count), 0) >= 2
              THEN max(f.email_sent_at) + interval '30 days' END
  FROM public.friendships f
  WHERE f.requester_id = p_requester
    AND f.addressee_id = p_addressee
    AND f.email_sent_at > now() - interval '30 days'
$$;
REVOKE ALL ON FUNCTION public._friend_mail_limit_until(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Usuwa oczekujące zaproszenia do ankiet i baz między parą (oba kierunki).
-- Przyjęte udostępnienia baz/urządzeń zostają.
CREATE OR REPLACE FUNCTION public._friend_drop_pair_tasks(p_a uuid, p_b uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.poll_tasks pt
  WHERE pt.status IN ('pending', 'opened')
    AND ((pt.owner_id = p_a AND pt.recipient_user_id = p_b)
      OR (pt.owner_id = p_b AND pt.recipient_user_id = p_a));

  DELETE FROM public.base_share_tasks bt
  WHERE bt.status IN ('pending', 'opened')
    AND ((bt.owner_id = p_a AND bt.recipient_user_id = p_b)
      OR (bt.owner_id = p_b AND bt.recipient_user_id = p_a));
END;
$$;
REVOKE ALL ON FUNCTION public._friend_drop_pair_tasks(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. RPC znajomych
-- ============================================================================

-- Zaproszenie po nazwie użytkownika albo e-mailu konta. Mail wysyła klient
-- (link go?f=<token>); tu tylko rezerwacja cooldownu friend:invite.
CREATE OR REPLACE FUNCTION public.friends_invite(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_h        text := trim(coalesce(p_handle, ''));
  v_is_email boolean := position('@' in trim(coalesce(p_handle, ''))) > 1;
  v_prof     public.profiles%rowtype;
  v_ex       public.friendships%rowtype;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_id       uuid;
  v_token    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  IF v_h = '' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'empty handle');
  END IF;

  SELECT * INTO v_prof
  FROM public.profiles p
  WHERE (lower(p.username) = lower(v_h) OR lower(p.email) = lower(v_h))
    AND NOT p.is_guest
  ORDER BY (lower(p.username) = lower(v_h)) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'unknown_user', 'has_email_only', v_is_email);
  END IF;

  IF v_prof.id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'err', 'self');
  END IF;

  SELECT * INTO v_ex
  FROM public.friendships f
  WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(v_uid, v_prof.id)
    AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(v_uid, v_prof.id);

  IF FOUND THEN
    IF v_ex.status = 'pending' AND v_ex.addressee_id = v_uid THEN
      -- Zaproszenie krzyżowe: druga strona już zaprosiła mnie — od razu aktywne, bez maila.
      UPDATE public.friendships
         SET status = 'active', accepted_at = now()
       WHERE id = v_ex.id;
      RETURN jsonb_build_object('ok', true, 'id', v_ex.id, 'token', v_ex.token,
                                'to', v_prof.email, 'mail_allowed', false,
                                'accepted', true, 'status', 'active');
    END IF;
    RETURN jsonb_build_object('ok', false, 'err', 'already', 'id', v_ex.id, 'status', v_ex.status);
  END IF;

  v_target := 'pair:' || v_uid::text || ':' || v_prof.id::text;

  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:invite_after_reject', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until, 'reason', 'after_reject');
  END IF;

  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:invite', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until, 'reason', 'invite');
  END IF;

  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status, email_sent_at, email_send_count)
    VALUES (v_uid, v_prof.id, 'pending', now(), 1)
    RETURNING id, token INTO v_id, v_token;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'err', 'already');
  END;

  PERFORM public.mail_cooldown_reserve('friend:invite', v_target);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                            'to', v_prof.email, 'mail_allowed', true,
                            'accepted', false, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.friends_list()
RETURNS TABLE (
  id uuid, user_id uuid, label text, email text, status text, direction text,
  created_at timestamptz, accepted_at timestamptz,
  email_sent_at timestamptz, email_send_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT f.id,
         p.id,
         coalesce(nullif(p.username, ''), p.email),
         p.email,
         f.status,
         CASE WHEN f.status = 'active' THEN 'friend'
              WHEN f.requester_id = v_uid THEN 'outgoing'
              ELSE 'incoming' END,
         f.created_at, f.accepted_at, f.email_sent_at, f.email_send_count
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END
  WHERE f.requester_id = v_uid OR f.addressee_id = v_uid
  ORDER BY f.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.friends_accept(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  UPDATE public.friendships
     SET status = 'active', accepted_at = now()
   WHERE id = p_id AND addressee_id = v_uid AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', 'accepted', 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.friends_reject(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  DELETE FROM public.friendships
   WHERE id = p_id AND addressee_id = v_uid AND status = 'pending'
  RETURNING requester_id INTO v_req;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  PERFORM public._friend_drop_pair_tasks(v_req, v_uid);
  -- blokada ponownego zaproszenia od zapraszającego na 30 dni
  PERFORM public.mail_cooldown_reserve('friend:invite_after_reject', 'pair:' || v_req::text || ':' || v_uid::text);
  RETURN jsonb_build_object('ok', true, 'action', 'rejected', 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.friends_cancel(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_addr uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  DELETE FROM public.friendships
   WHERE id = p_id AND requester_id = v_uid AND status = 'pending'
  RETURNING addressee_id INTO v_addr;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  PERFORM public._friend_drop_pair_tasks(v_uid, v_addr);
  RETURN jsonb_build_object('ok', true, 'action', 'cancelled', 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.friends_remove(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req uuid;
  v_adr uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  DELETE FROM public.friendships
   WHERE id = p_id AND status = 'active'
     AND (requester_id = v_uid OR addressee_id = v_uid)
  RETURNING requester_id, addressee_id INTO v_req, v_adr;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  PERFORM public._friend_drop_pair_tasks(v_req, v_adr);
  RETURN jsonb_build_object('ok', true, 'action', 'removed', 'id', p_id);
END;
$$;

-- Ponowne wysłanie maila zaproszenia (tylko zapraszający, tylko pending).
-- Limit jak polls_hub_subscriber_resend: 2 maile / 30 dni + friend:resend.
CREATE OR REPLACE FUNCTION public.friends_resend(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_f        public.friendships%rowtype;
  v_to       text;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_lim      timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT * INTO v_f FROM public.friendships WHERE id = p_id AND requester_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  IF v_f.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'only pending can be resent');
  END IF;

  v_lim := public._friend_mail_limit_until(v_uid, v_f.addressee_id);
  IF v_lim IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim, 'reason', 'mail_limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' || v_f.addressee_id::text;
  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:resend', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  SELECT lower(p.email) INTO v_to FROM public.profiles p WHERE p.id = v_f.addressee_id;
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this user');
  END IF;

  UPDATE public.friendships
     SET email_sent_at = now(), email_send_count = email_send_count + 1
   WHERE id = p_id;

  PERFORM public.mail_cooldown_reserve('friend:resend', v_target);

  RETURN jsonb_build_object('ok', true, 'to', v_to, 'kind', 'friend_invite',
                            'link', 'go?f=' || v_f.token::text, 'token', v_f.token);
END;
$$;

-- Dla /go/?f=<token>. Działa też bez logowania: tylko etykieta zapraszającego
-- i stan; addressee_matches_me jest fałszem dla niezalogowanego.
CREATE OR REPLACE FUNCTION public.friends_token_info(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_f     public.friendships%rowtype;
  v_label text;
BEGIN
  SELECT * INTO v_f FROM public.friendships WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  SELECT coalesce(nullif(p.username, ''), p.email) INTO v_label
  FROM public.profiles p WHERE p.id = v_f.requester_id;
  RETURN jsonb_build_object(
    'ok', true,
    'status', v_f.status,
    'requester_label', v_label,
    'addressee_matches_me', (auth.uid() IS NOT NULL AND v_f.addressee_id = auth.uid())
  );
END;
$$;

-- Subskrybent założył konto na e-mail z subskrypcji: zaproszenie do znajomych
-- od właściciela (bez maila). NIE podpięte do poll_claim_email_records (krok 3).
CREATE OR REPLACE FUNCTION public.friend_invites_from_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_created integer := 0;
  r         record;
  v_cd_ok   boolean;
  v_n       integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  v_email := public.poll_my_email();

  FOR r IN
    SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.subscriber_user_id = v_uid
        OR (v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(r.owner_id, v_uid)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(r.owner_id, v_uid)
    ) THEN
      CONTINUE;
    END IF;

    SELECT c.ok INTO v_cd_ok
    FROM public.mail_cooldown_check('friend:invite_after_reject', 'pair:' || r.owner_id::text || ':' || v_uid::text) c;
    IF NOT v_cd_ok THEN
      CONTINUE;
    END IF;

    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (r.owner_id, v_uid, 'pending')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_created := v_created + v_n;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;

-- ============================================================================
-- Zadania i plakietki
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tasks_list(p_kind text DEFAULT NULL)
RETURNS TABLE (
  kind text, id uuid, state text, title text, owner_label text,
  created_at timestamptz, done_at timestamptz, token uuid,
  poll_type text, role text, device_type text, game_id uuid, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.poll_claim_email_records();

  IF p_kind IS NULL OR p_kind = 'poll' THEN
    RETURN QUERY
    SELECT 'poll'::text, t.id,
           CASE WHEN t.done_at IS NOT NULL THEN 'done' ELSE 'todo' END,
           coalesce(g.name, ('Sondaż ' || left(t.game_id::text, 8))::text),
           coalesce(nullif(p.username, ''), p.email),
           t.created_at, t.done_at, t.token,
           t.poll_type, NULL::text, NULL::text, t.game_id, NULL::timestamptz
    FROM public.poll_tasks t
    LEFT JOIN public.games g ON g.id = t.game_id
    LEFT JOIN public.profiles p ON p.id = t.owner_id
    WHERE t.recipient_user_id = v_uid
      AND t.declined_at IS NULL AND t.cancelled_at IS NULL
      AND (t.done_at IS NULL OR t.done_at > now() - interval '5 days')
    ORDER BY t.created_at DESC;
  END IF;

  IF p_kind IS NULL OR p_kind = 'base' THEN
    RETURN QUERY
    SELECT 'base'::text, bt.id,
           CASE WHEN bt.status IN ('pending', 'opened') THEN 'todo' ELSE 'done' END,
           coalesce(b.name, 'Baza pytań'),
           coalesce(nullif(p.username, ''), p.email),
           bt.created_at,
           CASE WHEN bt.status = 'done' THEN bt.accepted_at END,
           bt.token,
           NULL::text, bt.role::text, NULL::text, NULL::uuid, NULL::timestamptz
    FROM public.base_share_tasks bt
    LEFT JOIN public.question_bases b ON b.id = bt.base_id
    LEFT JOIN public.profiles p ON p.id = bt.owner_id
    WHERE bt.recipient_user_id = v_uid
      AND (bt.status IN ('pending', 'opened')
        OR (bt.status = 'done' AND bt.accepted_at > now() - interval '5 days'))
    ORDER BY bt.created_at DESC;
  END IF;

  IF p_kind IS NULL OR p_kind = 'device' THEN
    RETURN QUERY
    SELECT 'device'::text, sd.id, 'todo'::text,
           coalesce(nullif(sd.game_name, ''), sd.device_type),
           coalesce(nullif(p.username, ''), p.email),
           sd.created_at, NULL::timestamptz, NULL::uuid,
           NULL::text, NULL::text, sd.device_type, sd.game_id, sd.expires_at
    FROM public.shared_devices sd
    LEFT JOIN public.profiles p ON p.id = sd.owner_id
    WHERE sd.recipient_id = v_uid
      AND (sd.expires_at IS NULL OR sd.expires_at > now())
    ORDER BY sd.created_at DESC;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.badges_get()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_polls   integer;
  v_bases   integer;
  v_friends integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('tasks_pending', 0, 'friends_pending', 0);
  END IF;
  PERFORM public.poll_claim_email_records();

  SELECT count(*) INTO v_polls
  FROM public.poll_tasks t
  WHERE t.recipient_user_id = v_uid
    AND t.done_at IS NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL;

  SELECT count(*) INTO v_bases
  FROM public.base_share_tasks bt
  WHERE bt.recipient_user_id = v_uid AND bt.status IN ('pending', 'opened');

  SELECT count(*) INTO v_friends
  FROM public.friendships f
  WHERE f.addressee_id = v_uid AND f.status = 'pending';

  RETURN jsonb_build_object('tasks_pending', v_polls + v_bases, 'friends_pending', v_friends);
END;
$$;

-- ============================================================================
-- e2e: czyszczenie pary kont testowych
-- ============================================================================
CREATE OR REPLACE FUNCTION public.e2e_friendships_cleanup(p_other_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
     OR v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     OR v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' THEN
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
$$;

-- Uprawnienia: tylko zalogowani (friends_token_info także niezalogowani — /go/).
REVOKE ALL ON FUNCTION public.friends_invite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.friends_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.friends_accept(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.friends_reject(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.friends_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.friends_remove(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.friends_resend(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.friends_token_info(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_invites_from_subscriptions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tasks_list(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.badges_get() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.e2e_friendships_cleanup(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.friends_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_reject(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_resend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_token_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_invites_from_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.badges_get() TO authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_friendships_cleanup(uuid) TO authenticated;

-- ============================================================================
-- 5. Jednorazowa, idempotentna kopia: subskrypcje kont -> friendships
-- ============================================================================
-- Aktywne przed oczekującymi (przy wzajemnych subskrypcjach wygrywa aktywna;
-- unikalna para nieuporządkowana odrzuca resztę). Stare wiersze zostają.
INSERT INTO public.friendships
  (requester_id, addressee_id, status, token, created_at, accepted_at, email_sent_at, email_send_count)
SELECT s.owner_id, s.subscriber_user_id, s.status, s.token, s.created_at,
       CASE WHEN s.status = 'active' THEN coalesce(s.accepted_at, s.created_at) END,
       s.email_sent_at, s.email_send_count
FROM public.poll_subscriptions s
JOIN public.profiles po ON po.id = s.owner_id
JOIN public.profiles ps ON ps.id = s.subscriber_user_id
WHERE s.subscriber_user_id IS NOT NULL
  AND s.owner_id <> s.subscriber_user_id
  AND s.status IN ('active', 'pending')
ORDER BY (s.status = 'active') DESC, s.created_at
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. site_activity_ping: strony friends, subscribers, tasks
-- ============================================================================
CREATE OR REPLACE FUNCTION public.site_activity_ping(p_tab_id uuid, p_page text, p_game_id uuid DEFAULT NULL, p_visible boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE uid uuid := auth.uid(); gid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF p_tab_id IS NULL OR p_page IS NULL OR p_page NOT IN
 ('home','games','control','editor','game-settings','bases','base-explorer','logo','polls','polls-hub','subscriptions','friends','subscribers','tasks','account','marketplace','manual','connect-device') THEN RAISE EXCEPTION 'invalid_page'; END IF;
 IF p_game_id IS NOT NULL AND p_page IN ('control','editor','game-settings','polls') THEN
   SELECT id INTO gid FROM public.games WHERE id=p_game_id AND owner_id=uid;
 END IF;
 -- One row per tab, bounded lifetime. No historical log.
 DELETE FROM public.site_activity WHERE last_seen_at < now()-interval '1 day';
 DELETE FROM public.site_activity_hours WHERE bucket < now()-interval '90 days';
 INSERT INTO public.site_activity_hours(bucket,user_id) VALUES(date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',uid) ON CONFLICT DO NOTHING;
 INSERT INTO public.site_activity(user_id,tab_id,page,game_id,visible,last_seen_at)
 VALUES(uid,p_tab_id,p_page,gid,coalesce(p_visible,true),now())
 ON CONFLICT(user_id,tab_id) DO UPDATE SET page=excluded.page,game_id=excluded.game_id,visible=excluded.visible,last_seen_at=excluded.last_seen_at;
END $$;

COMMIT;
