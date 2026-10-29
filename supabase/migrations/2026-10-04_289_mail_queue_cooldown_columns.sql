-- Ujednolicenie cooldownów maili (warstwa 1, część 2/7) — zamknięcie
-- realnej dziury: mail_queue's RLS (mail_queue_insert_own) pozwala KAŻDEMU
-- zalogowanemu użytkownikowi wstawić wiersz z dowolnym to_email/subject/
-- html, bez żadnego limitu — send-mail Edge Function sprawdza tylko JWT,
-- nic więcej. Każdy dotychczasowy "cooldown" w base_share_by_email/
-- polls_hub_*/share_device był więc czysto klienckim obyczajem — nic nie
-- stało na przeszkodzie, żeby ktoś ominął RPC i wstawił wprost do
-- mail_queue albo wywołał send-mail z wymyślonymi parametrami.
--
-- Rozwiązanie: KAŻDY wiersz mail_queue musi nieść cooldown_action_key/
-- cooldown_target_key, a BEFORE INSERT trigger wymusza na nich
-- nieprzekraczalną "podłogę" (baseline:recipient, migracja 288) —
-- niezależnie od tego, jaki action_key deklaruje wywołujący. To NIE
-- duplikuje per-akcji cooldownu (ten rezerwuje samo RPC danej funkcji, w
-- swojej transakcji, razem ze zmianą stanu biznesowego — patrz migracje
-- 290-292) — trigger chroni tylko przed obejściem RPC w ogóle.
ALTER TABLE public.mail_queue ADD COLUMN cooldown_action_key text;
ALTER TABLE public.mail_queue ADD COLUMN cooldown_target_key text;

-- Backfill istniejących (transientnych, szybko drenowanych przez
-- mail-worker) wierszy wartością-mostkiem — przez UPDATE, nie INSERT, więc
-- trigger (dodany niżej, działa tylko na INSERT) ich nie widzi.
UPDATE public.mail_queue
SET cooldown_action_key = 'legacy:unclassified',
    cooldown_target_key = 'email:' || md5(lower(trim(to_email)))
WHERE cooldown_action_key IS NULL;

ALTER TABLE public.mail_queue ALTER COLUMN cooldown_action_key SET NOT NULL;
ALTER TABLE public.mail_queue ALTER COLUMN cooldown_target_key SET NOT NULL;

CREATE FUNCTION public.mail_queue_cooldown_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enforce boolean;
  v_ok boolean;
  v_until timestamptz;
  v_baseline_target text;
BEGIN
  SELECT enforce INTO v_enforce
  FROM public.mail_cooldown_policies
  WHERE action_key = NEW.cooldown_action_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mail_queue: unknown cooldown_action_key %', NEW.cooldown_action_key;
  END IF;

  IF v_enforce THEN
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mail_queue_cooldown_guard
  BEFORE INSERT ON public.mail_queue
  FOR EACH ROW EXECUTE FUNCTION public.mail_queue_cooldown_guard();
