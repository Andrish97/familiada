-- 222: Dodanie 'poll_qr' jako dozwolonego device_type w device_connect_codes
-- poll_qr = wyświetlacz QR ankiety (poll-qr.html), może być podłączony np. na TV

ALTER TABLE public.device_connect_codes
  DROP CONSTRAINT device_connect_codes_device_type_check;

ALTER TABLE public.device_connect_codes
  ADD CONSTRAINT device_connect_codes_device_type_check
  CHECK (device_type IN ('display', 'host', 'buzzer', 'poll_qr'));

NOTIFY pgrst, 'reload schema';
