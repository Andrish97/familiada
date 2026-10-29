-- Ujednolicenie cooldownów maili (warstwa 1, część 7/7).
--
-- Trzy klucze auth:reset_password/auth:guest_upgrade_email/auth:signup_confirm
-- przechodzą z cooldown_email_reserve/email_cooldowns (generyczny, bierze
-- czas trwania jako PARAMETR) na mail_cooldown_reserve/mail_cooldowns
-- (czas z mail_cooldown_policies, migracja 288) -- czysta konsolidacja
-- kodu, NIE zamknięcie żadnej dziury bezpieczeństwa: te trzy akcje nigdy
-- nie dotykały mail_queue, idą przez send-email (webhook Supabase Auth,
-- podpisany, nieforgeable przez zwykły JWT) -- tam dziury nigdy nie było.
-- Faktyczna zmiana RPC-wywołań jest w js/pages/login.js/account.js (poza
-- migracjami); tu tylko przenosimy EWENTUALNIE aktywny, jeszcze nie
-- wygasły cooldown ze starej tabeli do nowej, żeby komuś w trakcie
-- odliczania nie zresetować go do zera w momencie wdrożenia.
INSERT INTO public.mail_cooldowns (action_key, target_key, next_allowed_at, updated_at)
SELECT ec.action_key, 'email:' || ec.email_hash, ec.next_allowed_at, ec.updated_at
FROM public.email_cooldowns ec
WHERE ec.action_key IN ('auth:reset_password', 'auth:guest_upgrade_email', 'auth:signup_confirm')
  AND ec.next_allowed_at > now()
ON CONFLICT (action_key, target_key) DO UPDATE
  SET next_allowed_at = greatest(public.mail_cooldowns.next_allowed_at, EXCLUDED.next_allowed_at),
      updated_at = now();

-- email_cooldowns/user_cooldowns i cooldown_email_*/cooldown_* ZOSTAJĄ
-- nietknięte -- używane też do rzeczy niemailowych (account.js's throttle
-- zmiany username/hasła), poza zakresem tego ujednolicenia.
