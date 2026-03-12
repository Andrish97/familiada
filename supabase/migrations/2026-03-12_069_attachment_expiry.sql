-- 069: attachment_expiry — załączniki wygasają po 30 dniach

ALTER TABLE public.message_attachments
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  ADD COLUMN IF NOT EXISTS expired    boolean      NOT NULL DEFAULT false;

-- Aktualizuj istniejące wiersze (expires_at = created_at + 30 dni)
UPDATE public.message_attachments
  SET expires_at = created_at + interval '30 days'
  WHERE expires_at > created_at + interval '30 days' + interval '1 minute'
     OR expires_at < created_at + interval '30 days' - interval '1 minute';

CREATE INDEX IF NOT EXISTS message_attachments_expires_at_idx
  ON public.message_attachments (expires_at) WHERE NOT expired;

-- Zaktualizuj save_attachment: ustaw expires_at
CREATE OR REPLACE FUNCTION public.save_attachment(
  p_message_id   uuid,
  p_filename     text,
  p_mime_type    text,
  p_size         int,
  p_storage_path text,
  p_content_id   text    DEFAULT NULL,
  p_inline       boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO message_attachments(message_id, filename, mime_type, size, storage_path, content_id, inline, expires_at)
  VALUES (p_message_id, p_filename, p_mime_type, p_size, p_storage_path, p_content_id, p_inline,
          now() + interval '30 days')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Zaktualizuj get_message_attachments: zwróć expires_at i expired
CREATE OR REPLACE FUNCTION public.get_message_attachments(p_message_id uuid)
RETURNS TABLE(id uuid, filename text, mime_type text, size int, storage_path text,
              content_id text, inline boolean, created_at timestamptz,
              expires_at timestamptz, expired boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.filename, a.mime_type, a.size, a.storage_path,
         a.content_id, a.inline, a.created_at, a.expires_at, a.expired
  FROM message_attachments a
  WHERE a.message_id = p_message_id
  ORDER BY a.inline DESC, a.created_at ASC;
END;
$$;

-- RPC: get_expired_attachments — lista wygasłych do usunięcia ze storage
CREATE OR REPLACE FUNCTION public.get_expired_attachments()
RETURNS TABLE(id uuid, storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.storage_path
  FROM message_attachments a
  WHERE a.expires_at < now()
    AND NOT a.expired
    AND a.storage_path <> ''
  ORDER BY a.expires_at ASC
  LIMIT 200;
END;
$$;

-- RPC: mark_attachment_expired — oznacz jako wygasły po usunięciu ze storage
CREATE OR REPLACE FUNCTION public.mark_attachment_expired(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE message_attachments
  SET expired = true, storage_path = ''
  WHERE id = p_id;
END;
$$;
