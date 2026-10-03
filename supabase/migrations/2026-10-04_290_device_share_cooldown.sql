-- Ujednolicenie cooldownów maili (warstwa 1, część 3/7).
--
-- Naprawa usterki znalezionej w migracji 287 (ta sama sesja): v_created
-- liczył się tylko z (owner,recipient,device_type) — BEZ game_id — mimo
-- że UNIQUE na shared_devices też nie ma game_id. Skutek: udostępnienie
-- tego samego typu urządzenia tej samej osobie dla INNEJ gry już DZIŚ
-- cicho nie wysyłało maila (wiersz dla tej trójki istniał z poprzedniej
-- gry) — a to jest przypadek, w którym odbiorca NAPRAWDĘ potrzebuje
-- nowego maila: inna gra = inny games.share_key_host = stary link w
-- starym mailu nie działa dla nowej gry. v_created musi więc też
-- porównywać game_id.
--
-- Po tej poprawce: cooldown dla device:share jest per (owner,recipient,
-- device_type,game_id) — zmiana gry ZAWSZE przechodzi (świeży, potrzebny
-- link), tylko powtórka dla TEJ SAMEJ gry/osoby/urządzenia jest
-- ograniczona czasowo. Cooldown musi żyć NIEZALEŻNIE od shared_devices'
-- wiersza (nowa tabela mail_cooldowns, migracja 288), bo inaczej cykl
-- "udostępnij → cofnij → udostępnij ponownie" resetowałby v_created do
-- true i spamował mailem bez ograniczeń (zgłoszony przez właściciela
-- realny scenariusz spamu, dokładnie to miało zamykać to ujednolicenie).
--
-- SAM DOSTĘP (wiersz shared_devices) NIGDY nie jest blokowany cooldownem —
-- zawsze natychmiastowy, bo może być operacyjnie krytyczny (operator na
-- żywo). Blokowany jest wyłącznie e-mail — stąd nowe pole "mail_allowed" w
-- odpowiedzi, które control2/js/shareDevice.js i control/js/share-device.js
-- muszą sprawdzić ZAMIAST samego "created" przy decyzji "wysłać mail".
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
  v_mail_allowed boolean := false;
  v_cooldown_until timestamptz;
  v_target text;
BEGIN
  IF v_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated'); END IF;
  IF v_owner = p_recipient_user_id THEN RETURN jsonb_build_object('ok', false, 'err', 'self_share'); END IF;
  IF p_device_type NOT IN ('host', 'buzzer', 'display') THEN RETURN jsonb_build_object('ok', false, 'err', 'invalid_type'); END IF;

  v_created := NOT EXISTS (
    SELECT 1 FROM public.shared_devices
    WHERE owner_id = v_owner AND recipient_id = p_recipient_user_id AND device_type = p_device_type
      AND game_id IS NOT DISTINCT FROM p_game_id
  );

  INSERT INTO public.shared_devices (owner_id, recipient_id, device_type, game_id, game_name, expires_at)
  VALUES (v_owner, p_recipient_user_id, p_device_type, p_game_id, p_game_name, p_expires_at)
  ON CONFLICT (owner_id, recipient_id, device_type)
  DO UPDATE SET game_id = EXCLUDED.game_id, game_name = EXCLUDED.game_name, expires_at = EXCLUDED.expires_at;

  IF v_created THEN
    v_target := 'pair:' || v_owner::text || ':' || p_recipient_user_id::text
      || ':device:' || p_device_type || ':game:' || coalesce(p_game_id::text, 'none');

    SELECT ok, next_allowed_at INTO v_mail_allowed, v_cooldown_until
    FROM public.mail_cooldown_reserve('device:share', v_target);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'mail_allowed', v_mail_allowed,
    'cooldown_until', v_cooldown_until
  );
END;
$$;
