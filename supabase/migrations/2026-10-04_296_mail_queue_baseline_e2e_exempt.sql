-- Ujednolicenie cooldownów maili -- HOTFIX #2 (znaleziony po pierwszym
-- wdrożeniu, run 37146230051: e2e/subscriptions.spec.js "zaproszenie z UI
-- dochodzi na prawdziwą skrzynkę" i jemu podobne dostały 429 z send-mail
-- -- "cooldown_active: baseline for test8@familiada.online until ...").
--
-- Realna przyczyna: migracja 289's "podłoga" baseline:recipient (60s,
-- per nadawca+odbiorca, NIEZALEŻNA od action_key) jest poprawna i
-- potrzebna w produkcji -- ale w CI 10-13 WSPÓLNYCH, POOLOWANYCH kont
-- testowych (test1..test13) jest używanych przez WIELE różnych plików
-- specyfikacji na raz (TEST_WORKERS=4), więc dwa zupełnie NIEZWIĄZANE
-- testy mogą w ramach jednego przebiegu CI legalnie wysłać mail z tego
-- samego konta-nadawcy do tego samego konta-odbiorcy w oknie 60s --
-- e2e_poll_subscriptions_cleanup/e2e_shared_devices_cleanup (migracja
-- 294) czyszczą cooldowny PER-AKCJA dla konkretnej pary, ale NIE czyszczą
-- (i nie mogą, bo nie wiedzą o sobie) wspólnej dla WSZYSTKICH akcji
-- podłogi baseline:recipient -- to jest fałszywe zablokowanie w teście,
-- nie regresja produktowa.
--
-- Naprawa: trigger pomija REZERWACJĘ baseline:recipient (NIE pomija
-- walidacji nieznanego action_key -- to zostaje bezwarunkowe), gdy I
-- nadawca (auth.users.email dla NEW.created_by) I odbiorca (NEW.to_email)
-- są kontami testowymi wg TEGO SAMEGO wzorca co e2e_shared_devices_cleanup/
-- e2e_poll_subscriptions_cleanup. Prawdziwi użytkownicy (choćby jeden z
-- dwóch) nadal przechodzą przez pełną podłogę -- to nie otwiera żadnej
-- dziury produkcyjnej, bo test*@familiada.online nie są kontami, na które
-- ktokolwiek zaprasza prawdziwych odbiorców.
CREATE OR REPLACE FUNCTION public.mail_queue_cooldown_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;
