-- Ujednolicenie cooldownów maili (warstwa 1, część 4/7).
--
-- base_share_by_email/by_user liczyły cooldown inline (greatest(max(
-- declined_at),max(cancelled_at)) > now()-24h) — zamieniamy na wspólny
-- mail_cooldown_check/reserve (migracja 288), z zachowaniem TEJ SAMEJ
-- granularności (per owner+base+recipient, nie per owner+recipient w
-- ogóle — inna baza = inny cooldown). RETURNS TABLE zmienia listę kolumn
-- (dokładamy cooldown_until), więc CREATE OR REPLACE nie wystarczy —
-- trzeba DROP FUNCTION najpierw (krótkie okno niedostępności funkcji w
-- tej samej transakcji migracji, nie ma znaczenia praktycznego).
--
-- ZASTRZEŻENIE (świadoma zmiana zachowania): cooldown zaczyna się teraz
-- w momencie FAKTYCZNEJ WYSYŁKI (mail_cooldown_reserve wołane tuż przed
-- zwróceniem mail_link), nie w momencie decline/cancel jak dotąd. Dla
-- przypadku "cancel tuż po wysłaniu i odrazu reinvite" zachowanie jest
-- identyczne (oba znaczniki czasu praktycznie się zgadzają); różni się
-- tylko przypadek "zaproszenie wisiało tydzień nieodebrane, potem
-- cancel" — dziś cooldown liczyłby się od cancel, teraz od oryginalnej
-- wysyłki (więc może już być wygasły) — uznane za rozsądne uproszczenie,
-- nie błąd. Brak testu e2e zależnego od starego zachowania (zweryfikowane).
DROP FUNCTION IF EXISTS public.base_share_by_email(uuid, text, public.base_share_role);
DROP FUNCTION IF EXISTS public.base_share_by_user(uuid, uuid, public.base_share_role);

CREATE FUNCTION public.base_share_by_email(p_base_id uuid, p_email text, p_role public.base_share_role)
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
  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('base:share', v_target);
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

CREATE FUNCTION public.base_share_by_user(p_base_id uuid, p_recipient_user_id uuid, p_role public.base_share_role)
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
  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('base:share', v_target);
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

-- Martwy kod: base_share_cooldown_until nigdy nie było wywoływane z UI
-- (bases.js's msLeftLabel/getCooldownUntil też martwe — usuwane w JS
-- osobno, poza migracjami). Zastąpione przez mail_cooldown_check.
DROP FUNCTION IF EXISTS public.base_share_cooldown_until(uuid, uuid);
