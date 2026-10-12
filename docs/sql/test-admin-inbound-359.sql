-- Safe production contract: all fixture changes roll back; no outgoing mail.
BEGIN;
DO $$
DECLARE v_sender text; v_id uuid; v_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.messages WHERE source = 'email' AND direction = 'inbound'
    AND lower(btrim(from_email)) ~ '^bounce[+][a-z0-9_-]+@bounce-zem[.]familiada[.]online$'
    AND deleted_at IS NULL) THEN
    RAISE EXCEPTION '359: own technical copies remain visible';
  END IF;
  FOR v_sender IN SELECT unnest(ARRAY[
    'bounce+948a5050-c564-11f1-8b41-16423a433ff6_vt1@bounce-zem.familiada.online',
    ' BOUNCE+ABC@BOUNCE-ZEM.FAMILIADA.ONLINE '
  ]) LOOP
    SELECT count(*) INTO v_count FROM public.save_inbound_message(v_sender, '359 fixture', 'fixture');
    IF v_count <> 0 THEN RAISE EXCEPTION '359: technical sender accepted'; END IF;
  END LOOP;
  FOR v_sender IN SELECT unnest(ARRAY[
    'fixture359@example.com', 'bounce+abc@other.example.com',
    'bounce+abc@bounce-zem.familiada.online.attacker.example',
    'support@bounce-zem.familiada.online'
  ]) LOOP
    SELECT id INTO v_id FROM public.save_inbound_message(v_sender, '359 fixture', 'fixture');
    IF v_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.messages WHERE id = v_id AND from_email = v_sender) THEN
      RAISE EXCEPTION '359: ordinary sender rejected';
    END IF;
  END LOOP;
END $$;
ROLLBACK;
