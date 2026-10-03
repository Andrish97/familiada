-- Ujednolicenie cooldownów maili (warstwa 1, część 1/7) — czysto dodatkowe.
-- Dziś 5 niezależnych implementacji tego samego pojęcia (bazy: 24h po
-- decline/cancel liczone inline; ankiety: 3 różne RPC z własnym liczeniem;
-- urządzenia: brak w ogóle) + istniejący generyczny mechanizm cooldown_get/
-- cooldown_reserve (user_cooldowns) i cooldown_email_get/cooldown_email_
-- reserve (email_cooldowns), który bierze czas trwania jako PARAMETR
-- wywołania, nie z bazy. user_cooldowns/email_cooldowns ZOSTAJĄ nietknięte —
-- są używane też do rzeczy niemailowych (np. account.js's throttle zmiany
-- username/hasła), to nowa, osobna tabela/RPC tylko dla maili.
--
-- "Tabela wymiarów" (action_key→cooldown_seconds jako DANE, nie zakodowane
-- w każdym RPC) — to jest ta część ujednolicenia, o którą właściciel
-- wprost poprosił. `enforce=false` to wyjątek dla wywołań serwisowych
-- (kontaktowy formularz, admin marketing/compose), które MUSZĄ móc wysyłać
-- wielokrotnie do tego samego adresu — patrz migracja 289 (trigger na
-- mail_queue, który i tak wymaga ROZPOZNANEGO action_key nawet gdy
-- enforce=false, żeby nie dało się obejść wymyślając nową nazwę).
CREATE TABLE public.mail_cooldown_policies (
  action_key      text PRIMARY KEY,
  scope           text NOT NULL CHECK (scope IN ('email', 'user', 'pair')),
  cooldown_seconds integer NOT NULL CHECK (cooldown_seconds >= 0),
  enforce         boolean NOT NULL DEFAULT true,
  description     text
);

INSERT INTO public.mail_cooldown_policies (action_key, scope, cooldown_seconds, enforce, description) VALUES
  ('base:share',             'pair',  86400,  true,  'Udostępnianie bazy pytań — 24h po ostatniej wysyłce do tej samej pary (owner,recipient,base)'),
  ('poll:invite',            'pair',  432000, true,  'Zaproszenie do subskrypcji ankiet — 5 dni'),
  ('poll:resend',            'pair',  86400,  true,  'Ponowne wysłanie zaproszenia subskrypcji — 24h'),
  ('poll:share',             'pair',  86400,  true,  'Udostępnienie konkretnej ankiety podpisanym subskrybentom — 24h per (owner,recipient,game)'),
  ('device:share',           'pair',  3600,   true,  'Udostępnianie urządzenia Control — 1h per (owner,recipient,device_type,game); samo udostępnienie (dostęp) NIGDY nie jest blokowane, tylko mail'),
  ('auth:reset_password',    'email', 3600,   true,  'Reset hasła — migracja z cooldown_email_reserve (konsolidacja, nie dotyczy mail_queue)'),
  ('auth:guest_upgrade_email','email', 3600,  true,  'Weryfikacja e-mail przy upgrade z gościa — jak wyżej'),
  ('auth:signup_confirm',    'email', 3600,   true,  'Ponowne wysłanie potwierdzenia rejestracji — jak wyżej'),
  ('baseline:recipient',     'pair',  60,     true,  'Nieprzekraczalna podłoga per (nadawca,odbiorca), niezależna od action_key — wymuszana przez trigger na mail_queue, nie przez żadne RPC wprost'),
  ('legacy:unclassified',    'email', 0,      false, 'Wartość-mostek dla wierszy mail_queue istniejących PRZED tą migracją (backfill), nigdy do użycia przez nowy kod'),
  ('admin:marketing',        'pair',  0,      false, 'Masowa wysyłka z panelu admina — celowo powtarzalna, bez throttlingu'),
  ('admin:compose',          'pair',  0,      false, 'Odpowiedzi admina 1:1 z panelu — celowo powtarzalne'),
  ('contact:confirmation',   'email', 0,      false, 'Potwierdzenie formularza kontaktowego — ma już własny rate-limit w save_form_message');

-- Stan cooldownów. target_key zachowuje dokładnie taką granularność, jaką
-- dana funkcja ma dziś (np. "pair:<owner>:<recipient>:base:<base_id>" dla
-- baz — per konkretna baza, nie per cały właściciel) — konwencja:
--   scope='email' -> 'email:'||md5(lower(trim(email)))
--   scope='user'  -> 'user:'||user_id
--   scope='pair'  -> 'pair:'||actor||':'||recipient[||':'<zasób>:<id>]
CREATE TABLE public.mail_cooldowns (
  action_key      text NOT NULL REFERENCES public.mail_cooldown_policies(action_key),
  target_key      text NOT NULL,
  next_allowed_at timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_key, target_key)
);

-- RLS włączone, BEZ żadnych polityk dla anon/authenticated -- wzorem
-- device_state/shared_devices: jedyna droga odczytu/zapisu to poniższe
-- SECURITY DEFINER RPC. Inaczej dowolny klient mógłby czytać/pisać wprost
-- przez REST (`.from("mail_cooldowns")...`), z pominięciem jakiejkolwiek
-- logiki (np. ustawić next_allowed_at w przeszłości, obchodząc cooldown).
ALTER TABLE public.mail_cooldown_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_cooldowns ENABLE ROW LEVEL SECURITY;

-- Odczyt bez rezerwacji — do pokazania licznika w UI bez konsumowania
-- niczego (np. przy otwarciu modala, zanim operator kliknie "Udostępnij").
-- SECURITY DEFINER: wywoływane też wprost jako RPC z klienta (nie tylko
-- zagnieżdżone w innych SECURITY DEFINER funkcjach), więc musi samo omijać
-- RLS -- bez tego, dla anon/authenticated (bez żadnej polityki) zawsze
-- zwracałoby pusty wynik.
CREATE FUNCTION public.mail_cooldown_check(p_action_key text, p_target_key text)
RETURNS TABLE(ok boolean, next_allowed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (mc.next_allowed_at IS NULL OR mc.next_allowed_at <= now()), mc.next_allowed_at
  FROM (SELECT 1) AS _dummy
  LEFT JOIN public.mail_cooldowns mc
    ON mc.action_key = p_action_key AND mc.target_key = p_target_key;
$$;

-- Atomowa rezerwacja — czas trwania czytany z mail_cooldown_policies, NIE
-- przyjmowany jako parametr (to jest różnica względem istniejącego
-- cooldown_reserve/cooldown_email_reserve, które zostają nietknięte dla
-- swoich obecnych, niemailowych wywołujących). Nieznany action_key = błąd,
-- nie "brak cooldownu" — to jest to, co nie pozwala obejść wymuszenia
-- (migracja 289) wymyślając nową nazwę akcji.
CREATE FUNCTION public.mail_cooldown_reserve(p_action_key text, p_target_key text)
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

  SELECT next_allowed_at INTO v_cur_next
  FROM public.mail_cooldowns
  WHERE action_key = p_action_key AND target_key = p_target_key
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

-- Wygodne nakładki dla scope='email' (auth:reset_password/guest_upgrade_
-- email/signup_confirm, migracja 293) -- md5 liczony TU, po stronie bazy,
-- bo login.js woła to jeszcze PRZED zalogowaniem (anon) i nie ma w
-- przeglądarce żadnej implementacji md5 do policzenia target_key samemu
-- (mirror istniejącego cooldown_email_get/cooldown_email_reserve).
CREATE FUNCTION public.mail_cooldown_email_check(p_action_key text, p_email text)
RETURNS TABLE(ok boolean, next_allowed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.mail_cooldown_check(p_action_key, 'email:' || md5(lower(trim(p_email))));
$$;

CREATE FUNCTION public.mail_cooldown_email_reserve(p_action_key text, p_email text)
RETURNS TABLE(ok boolean, next_allowed_at timestamptz)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.mail_cooldown_reserve(p_action_key, 'email:' || md5(lower(trim(p_email))));
$$;
