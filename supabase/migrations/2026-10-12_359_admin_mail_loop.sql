-- Own SMTP technical copies must never enter the admin inbox.
-- Test envelope recipients are handled separately by the Worker.
BEGIN;
CREATE OR REPLACE FUNCTION "public"."save_inbound_message"("p_from_email" "text", "p_subject" "text", "p_body" "text", "p_body_html" "text" DEFAULT NULL::"text", "p_ticket_number" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "report_id" "uuid", "ticket_number" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_report_id  uuid;
  v_ticket     text;
  v_msg_id     uuid;
  v_clean_ticket text;
BEGIN
  -- Same envelope sender boundary as the Worker; protects older deployments.
  IF lower(btrim(p_from_email)) ~ '^bounce[+][a-z0-9_-]+@bounce-zem[.]familiada[.]online$' THEN
    RETURN;
  END IF;
  -- normalise ticket: strip TICKET- prefix if present, keep YYYY-NNNN part
  IF p_ticket_number IS NOT NULL AND p_ticket_number <> '' THEN
    v_clean_ticket := regexp_replace(p_ticket_number, '^TICKET-', '');
    -- try full match first
    SELECT r.id, r.ticket_number INTO v_report_id, v_ticket
      FROM public.reports r
     WHERE r.ticket_number = p_ticket_number
        OR r.ticket_number = 'TICKET-' || v_clean_ticket
     LIMIT 1;
  END IF;

  INSERT INTO public.messages (source, direction, from_email, subject, body, body_html, report_id)
  VALUES ('email', 'inbound', p_from_email, COALESCE(p_subject,''), COALESCE(p_body,''), p_body_html, v_report_id)
  RETURNING messages.id INTO v_msg_id;

  RETURN QUERY SELECT v_msg_id, v_report_id, v_ticket;
END;
$$;

-- Preserve report threads and attachments. Attached copies leave the inbox
-- through the existing trash/storage cleanup lifecycle; other copies are removed.
DO $$
DECLARE v_removed integer; v_trashed integer;
BEGIN
  UPDATE public.messages m SET deleted_at = coalesce(m.deleted_at, now())
  WHERE m.source = 'email' AND m.direction = 'inbound'
    AND lower(btrim(m.from_email)) ~ '^bounce[+][a-z0-9_-]+@bounce-zem[.]familiada[.]online$'
    AND m.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.message_attachments a WHERE a.message_id = m.id);
  GET DIAGNOSTICS v_trashed = ROW_COUNT;
  DELETE FROM public.messages m
  WHERE m.source = 'email' AND m.direction = 'inbound'
    AND lower(btrim(m.from_email)) ~ '^bounce[+][a-z0-9_-]+@bounce-zem[.]familiada[.]online$'
    AND NOT EXISTS (SELECT 1 FROM public.message_attachments a WHERE a.message_id = m.id);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RAISE NOTICE '359: removed % own technical copies, trashed % with attachments', v_removed, v_trashed;
END $$;
COMMIT;
