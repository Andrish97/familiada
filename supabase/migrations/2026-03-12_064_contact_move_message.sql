-- 064: admin can move a message to a different ticket thread

ALTER TABLE public.contact_report_messages
  ADD COLUMN IF NOT EXISTS moved_from_report_id uuid REFERENCES public.contact_reports(id) ON DELETE SET NULL;

-- RPC: admin_move_message
CREATE OR REPLACE FUNCTION public.admin_move_message(
  p_message_id    uuid,
  p_target_ticket text
)
RETURNS TABLE(ok boolean, err text, old_ticket text, new_ticket text, old_email text, new_email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_msg    public.contact_report_messages%ROWTYPE;
  v_old    public.contact_reports%ROWTYPE;
  v_new    public.contact_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_msg FROM public.contact_report_messages WHERE id = p_message_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'message_not_found'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  SELECT * INTO v_old FROM public.contact_reports WHERE id = v_msg.report_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'source_ticket_not_found'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  SELECT * INTO v_new FROM public.contact_reports WHERE ticket_number = p_target_ticket LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'target_ticket_not_found'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  IF v_old.id = v_new.id THEN
    RETURN QUERY SELECT false, 'same_ticket'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  UPDATE public.contact_report_messages
  SET report_id = v_new.id, moved_from_report_id = v_old.id
  WHERE id = p_message_id;

  RETURN QUERY SELECT true, null::text, v_old.ticket_number, v_new.ticket_number, v_old.email, v_new.email;
END;
$$;
