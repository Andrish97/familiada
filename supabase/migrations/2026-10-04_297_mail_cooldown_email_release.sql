-- Ujednolicenie cooldownów maili -- HOTFIX #3 (znaleziony po pierwszym
-- wdrożeniu, run 37146230051: e2e/account-password-email.spec.js "konto
-- test11: reset hasla..." -- "Nie otrzymano maila w 90000 ms").
--
-- Realna przyczyna: cloudflare/maintenance-worker's restoreE2EAccount
-- ("/accounts/restore", wołane przez tests/e2e/helpers/mailbox.js's
-- restoreTestAccount przed KAŻDYM przebiegiem tego testu) czyści tylko
-- STARĄ tabelę email_cooldowns (przez cooldown_email_release) -- ale
-- migracja 293 przeniosła auth:reset_password na NOWY mechanizm
-- (mail_cooldowns, scope=email) -- login.js's mailCooldownEmailReserve
-- czyta właśnie z mail_cooldowns, nie z email_cooldowns. Efekt: cooldown
-- z WCZEŚNIEJSZEGO przebiegu tego samego dnia (1h okno) zostaje aktywny,
-- login.js pokazuje "Wysłano" (celowo, żeby nie zdradzać istnienia konta)
-- mimo że żadny request do GoTrue nigdy nie poszedł -- test czeka 90s na
-- maila, który nigdy nie powstał.
--
-- Naprawa: analogiczny RPC do istniejącego cooldown_email_release (ten
-- sam wzorzec -- md5(lower(trim(email))), "release" = przesunięcie
-- next_allowed_at na now(), z tą samą osłoną p_max_age_seconds żeby nie
-- dało się zwolnić cudzego, dawno nieaktywnego wpisu), tylko dla nowej
-- tabeli/schematu (target_key = 'email:'||md5, nie email_hash). Wołane
-- przez restoreE2EAccount tak jak cooldown_email_release już jest.
CREATE FUNCTION public.mail_cooldown_email_release(p_email text, p_action_key text, p_max_age_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target text;
BEGIN
  v_target := 'email:' || md5(lower(trim(p_email)));

  UPDATE public.mail_cooldowns
     SET next_allowed_at = now(),
         updated_at = now()
   WHERE target_key = v_target
     AND action_key = p_action_key
     AND updated_at >= (now() - make_interval(secs => p_max_age_seconds));

  RETURN true;
END;
$$;
