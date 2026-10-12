-- E19: globalna preferencja powiadomień obowiązuje przed dodaniem maila do
-- kolejki. Działa również dla klientów i RPC, które nie pamiętają o fladze.
-- Adres bez konta nie ma user_flags i nadal może dostać wymagane zaproszenie.
CREATE OR REPLACE FUNCTION public.mail_queue_notification_preference_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_notifications_enabled boolean;
BEGIN
  SELECT COALESCE(uf.email_notifications, true)
    INTO v_notifications_enabled
  FROM auth.users u
  LEFT JOIN public.user_flags uf ON uf.user_id = u.id
  WHERE lower(trim(u.email)) = lower(trim(NEW.to_email))
  LIMIT 1;

  IF FOUND AND NOT v_notifications_enabled THEN
    -- Pominięcie insercji jest celowe: wyłączona preferencja nie tworzy
    -- oczekującego maila, ale też nie blokuje nadania samego dostępu.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mail_queue_notification_preference_guard() FROM PUBLIC, anon, authenticated;

-- „000” sortuje trigger przed mail_queue_cooldown_guard: wyłączona flaga
-- nie zużywa również rezerwacji cooldownu.
CREATE TRIGGER trg_mail_queue_000_notification_preference_guard
  BEFORE INSERT ON public.mail_queue
  FOR EACH ROW EXECUTE FUNCTION public.mail_queue_notification_preference_guard();

COMMENT ON FUNCTION public.mail_queue_notification_preference_guard() IS
  'Omija powiadomienia mailowe dla kont z email_notifications=false przed insercją do kolejki; adresy bez konta nie są blokowane.';

NOTIFY pgrst, 'reload schema';
