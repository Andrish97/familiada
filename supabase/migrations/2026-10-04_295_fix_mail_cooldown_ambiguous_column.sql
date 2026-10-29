-- Ujednolicenie cooldownów maili -- HOTFIX (znaleziony po pierwszym
-- wdrożeniu na produkcję, migracje 288-294 same w sobie zaaplikowały się
-- bez błędu SQL, ale RUNTIME okazał się błędny w praktyce).
--
-- Realna przyczyna masowej awarii (base_share_by_email/by_user,
-- polls_hub_subscription_invite/subscriber_resend, share_device,
-- mail_cooldown_email_reserve -- WSZYSTKIE zwracały 400): klasyczna
-- pułapka PL/pgSQL -- "column reference ... is ambiguous (mogłoby
-- odnosić się albo do zmiennej PL/pgSQL, albo do kolumny tabeli)".
--
-- mail_cooldown_reserve ma RETURNS TABLE(ok boolean, next_allowed_at
-- timestamptz) -- te nazwy stają się NIEJAWNYMI ZMIENNYMI PL/pgSQL
-- widocznymi w całym ciele funkcji. Linia
--   SELECT next_allowed_at INTO v_cur_next FROM public.mail_cooldowns ...
-- odwołuje się do GOŁEGO "next_allowed_at" -- Postgres nie wie, czy to
-- kolumna tabeli mail_cooldowns czy własna zmienna wyjściowa funkcji, i
-- zawsze rzuca wyjątkiem (nie błąd danych -- błąd w KAŻDYM wywołaniu, stąd
-- 100% awaria, nie flaky). Ten sam błąd, niezależnie, w base_share_by_email/
-- by_user: ich RETURNS TABLE ma kolumnę "ok", a linia
--   SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM mail_cooldown_check(...)
-- odwołuje się do gołego "ok", niejednoznacznego z własnym OUT-parametrem.
--
-- Naprawa: kwalifikacja aliasem tabeli/funkcji wszędzie, gdzie nazwa
-- kolumny z zapytania koliduje z nazwą kolumny RETURNS TABLE otaczającej
-- funkcji -- CREATE OR REPLACE, bez zmiany sygnatury/listy kolumn (więc
-- bez DROP FUNCTION, w odróżnieniu od migracji 291, która zmieniała samą
-- listę kolumn).

CREATE OR REPLACE FUNCTION public.mail_cooldown_reserve(p_action_key text, p_target_key text)
RETURNS TABLE(ok boolean, next_allowed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seconds integer;
  v_cur_next timestamptz;
  v_new_next timestamptz;
BEGIN
  SELECT cooldown_seconds INTO v_seconds
  FROM public.mail_cooldown_policies
  WHERE action_key = p_action_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mail_cooldown_reserve: unknown action_key %', p_action_key;
  END IF;

  SELECT mc.next_allowed_at INTO v_cur_next
  FROM public.mail_cooldowns mc
  WHERE mc.action_key = p_action_key AND mc.target_key = p_target_key
  FOR UPDATE;

  IF NOT FOUND THEN
    v_new_next := now() + make_interval(secs => v_seconds);
    INSERT INTO public.mail_cooldowns(action_key, target_key, next_allowed_at, updated_at)
    VALUES (p_action_key, p_target_key, v_new_next, now());
    RETURN QUERY SELECT true, v_new_next;
    RETURN;
  END IF;

  IF v_cur_next <= now() THEN
    v_new_next := now() + make_interval(secs => v_seconds);
    UPDATE public.mail_cooldowns
      SET next_allowed_at = v_new_next, updated_at = now()
      WHERE action_key = p_action_key AND target_key = p_target_key;
    RETURN QUERY SELECT true, v_new_next;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, v_cur_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.base_share_by_email(p_base_id uuid, p_email text, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamptz, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_owner uuid;
  v_recipient uuid;
  v_norm_email text;
  v_base_name text;
  v_owner_label text;
  v_task public.base_share_tasks%rowtype;
  v_target text;
  v_cd_ok boolean;
  v_cd_until timestamptz;
BEGIN
  PERFORM public.base_share_tasks_cleanup();

  v_norm_email := lower(trim(p_email));

  SELECT owner_id, name INTO v_owner, v_base_name
  FROM public.question_bases
  WHERE id = p_base_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT id INTO v_recipient FROM public.profiles WHERE lower(email) = v_norm_email;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF v_recipient = v_owner THEN
    RETURN QUERY SELECT false, 'owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.question_base_shares s WHERE s.base_id = p_base_id AND s.user_id = v_recipient) THEN
    UPDATE public.question_base_shares SET role = p_role WHERE base_id = p_base_id AND user_id = v_recipient;
    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text, v_base_name, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  v_target := 'pair:' || v_owner::text || ':' || v_recipient::text || ':base:' || p_base_id::text;
  SELECT mcc.ok, mcc.next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('base:share', v_target) AS mcc;
  IF NOT v_cd_ok THEN
    RETURN QUERY SELECT false, 'cooldown', NULL::text, NULL::text, NULL::text, NULL::text, v_cd_until, v_recipient;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.base_share_tasks t
    WHERE t.owner_id = v_owner AND t.base_id = p_base_id AND t.recipient_user_id = v_recipient
      AND t.status IN ('pending', 'opened')
  ) THEN
    RETURN QUERY SELECT false, 'already_pending', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  SELECT coalesce(pr.username, pr.email) INTO v_owner_label FROM public.profiles pr WHERE pr.id = v_owner;

  INSERT INTO public.base_share_tasks(owner_id, base_id, recipient_user_id, recipient_email, role, status)
  VALUES (v_owner, p_base_id, v_recipient, v_norm_email, p_role, 'pending')
  RETURNING * INTO v_task;

  PERFORM public.mail_cooldown_reserve('base:share', v_target);

  RETURN QUERY
  SELECT true, NULL::text, v_norm_email, ('/bases?share=' || v_task.token::text), v_base_name, v_owner_label, NULL::timestamptz, v_recipient;
END;
$$;

CREATE OR REPLACE FUNCTION public.base_share_by_user(p_base_id uuid, p_recipient_user_id uuid, p_role public.base_share_role)
RETURNS TABLE(ok boolean, err text, mail_to text, mail_link text, base_name text, owner_label text, cooldown_until timestamptz, recipient_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_owner uuid;
  v_recipient uuid;
  v_base_name text;
  v_owner_label text;
  v_norm_email text;
  v_task public.base_share_tasks%rowtype;
  v_target text;
  v_cd_ok boolean;
  v_cd_until timestamptz;
BEGIN
  PERFORM public.base_share_tasks_cleanup();

  v_recipient := p_recipient_user_id;

  SELECT owner_id, name INTO v_owner, v_base_name FROM public.question_bases WHERE id = p_base_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  IF v_recipient = v_owner THEN
    RETURN QUERY SELECT false, 'owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT nullif(lower(trim(pr.email)), '') INTO v_norm_email FROM public.profiles pr WHERE pr.id = v_recipient;

  IF EXISTS (SELECT 1 FROM public.question_base_shares s WHERE s.base_id = p_base_id AND s.user_id = v_recipient) THEN
    UPDATE public.question_base_shares SET role = p_role WHERE base_id = p_base_id AND user_id = v_recipient;
    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text, v_base_name, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  v_target := 'pair:' || v_owner::text || ':' || v_recipient::text || ':base:' || p_base_id::text;
  SELECT mcc.ok, mcc.next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('base:share', v_target) AS mcc;
  IF NOT v_cd_ok THEN
    RETURN QUERY SELECT false, 'cooldown', NULL::text, NULL::text, NULL::text, NULL::text, v_cd_until, v_recipient;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.base_share_tasks t
    WHERE t.owner_id = v_owner AND t.base_id = p_base_id AND t.recipient_user_id = v_recipient
      AND t.status IN ('pending', 'opened')
  ) THEN
    RETURN QUERY SELECT false, 'already_pending', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, v_recipient;
    RETURN;
  END IF;

  SELECT coalesce(pr.username, pr.email) INTO v_owner_label FROM public.profiles pr WHERE pr.id = v_owner;

  INSERT INTO public.base_share_tasks(owner_id, base_id, recipient_user_id, recipient_email, role, status)
  VALUES (v_owner, p_base_id, v_recipient, v_norm_email, p_role, 'pending')
  RETURNING * INTO v_task;

  PERFORM public.mail_cooldown_reserve('base:share', v_target);

  RETURN QUERY
  SELECT true, NULL::text, v_norm_email, ('/bases?share=' || v_task.token::text), v_base_name, v_owner_label, NULL::timestamptz, v_recipient;
END;
$$;
