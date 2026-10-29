-- 245: get_trash_attachments — lista załączników wiadomości które zaraz
-- przepadną z kosza (te same warunki co DELETE w cleanup_trash), do
-- skasowania ze Storage PRZED wywołaniem cleanup_trash/delete_message.

CREATE OR REPLACE FUNCTION public.get_trash_attachments()
RETURNS TABLE(id uuid, storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.storage_path
  FROM public.message_attachments a
  JOIN public.messages m ON m.id = a.message_id
  WHERE m.deleted_at IS NOT NULL
    AND m.deleted_at < now() - interval '30 days'
    AND a.storage_path <> '';
END;
$$;
