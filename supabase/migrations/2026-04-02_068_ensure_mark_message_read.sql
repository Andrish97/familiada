-- 068: Ensure mark_message_read function exists

CREATE OR REPLACE FUNCTION public.mark_message_read(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.messages
  SET is_read = true, read_at = now()
  WHERE id = p_message_id;

  RETURN FOUND;
END;
$$;
