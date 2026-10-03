-- Zgłoszony realny bug: share_device() robi ON CONFLICT ... DO UPDATE bez
-- informowania wywołującego, czy to był nowy wiersz czy aktualizacja
-- istniejącego -- control2/js/shareDevice.js wysyła więc pełny mail z
-- zaproszeniem przy KAŻDYM kliknięciu "Dodaj", nawet gdy urządzenie jest
-- już udostępnione temu samemu odbiorcy (czysty powtórny klik operatora).
-- question_base_shares (udostępnianie baz pytań) ma ten sam problem
-- rozwiązany: gdy share już istnieje, aktualizuje tylko rolę i zwraca
-- mail_link=null, więc wołający (JS) nie wysyła drugiego maila -- patrz
-- base_share_by_email()/base_share_by_user() w baseline.sql. Ten sam
-- mechanizm tutaj: RPC zwraca "created" (bool), JS wysyła mail TYLKO gdy
-- created=true.
CREATE OR REPLACE FUNCTION public.share_device(
  p_recipient_user_id uuid,
  p_device_type text,
  p_game_id uuid DEFAULT NULL,
  p_game_name text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_created boolean;
BEGIN
  IF v_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated'); END IF;
  IF v_owner = p_recipient_user_id THEN RETURN jsonb_build_object('ok', false, 'err', 'self_share'); END IF;
  IF p_device_type NOT IN ('host', 'buzzer', 'display') THEN RETURN jsonb_build_object('ok', false, 'err', 'invalid_type'); END IF;

  v_created := NOT EXISTS (
    SELECT 1 FROM public.shared_devices
    WHERE owner_id = v_owner AND recipient_id = p_recipient_user_id AND device_type = p_device_type
  );

  INSERT INTO public.shared_devices (owner_id, recipient_id, device_type, game_id, game_name, expires_at)
  VALUES (v_owner, p_recipient_user_id, p_device_type, p_game_id, p_game_name, p_expires_at)
  ON CONFLICT (owner_id, recipient_id, device_type)
  DO UPDATE SET game_id = EXCLUDED.game_id, game_name = EXCLUDED.game_name, expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;

-- Analogiczne do e2e_poll_subscriptions_cleanup (migracja 285): czyszczenie
-- udostępnień urządzeń między dwoma kontami testowymi, do użycia w e2e
-- przed testem zamiast klikania "Cofnij" w UI za każdym retry -- shared_devices
-- ma TTL 4h i UNIQUE (owner_id, recipient_id, device_type) globalnie na
-- konto (nie per-grę), więc powtórny przebieg tego samego testu w tym
-- samym dniu inaczej zawsze zastaje już istniejące udostępnienie z
-- poprzedniego przebiegu.
CREATE OR REPLACE FUNCTION public.e2e_shared_devices_cleanup(p_other_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     OR v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.shared_devices
  WHERE (owner_id = v_uid AND recipient_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND recipient_id = v_uid);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_shared_devices_cleanup(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.e2e_shared_devices_cleanup(uuid) TO authenticated;
