-- 505: tekstowa część maila potwierdzenia centrum poczty prowadzi do familijna.app.
BEGIN;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds) VALUES('mail:center_verify','email',60),('baseline:recipient','email',60) ON CONFLICT DO NOTHING;
DO $$
DECLARE r jsonb; t text;
BEGIN
  r := public.mail_center_request_link('odbiorca505@example.invalid', repeat('b',64), 'Temat 505',
    '<a href="https://www.familijna.app/go/?m=MAIL_CENTER_ACCESS_TOKEN">x</a>', 'pl');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '505: %', r; END IF;
  SELECT text INTO t FROM public.mail_queue WHERE to_email='odbiorca505@example.invalid' ORDER BY created_at DESC LIMIT 1;
  IF t NOT LIKE '%https://www.familijna.app/go/?m=%' OR t LIKE '%familiada.online%' THEN RAISE EXCEPTION '505: zły link %', t; END IF;
END $$;
ROLLBACK;
