-- 067: message_attachments — przechowywanie załączników i inline obrazków

CREATE TABLE IF NOT EXISTS public.message_attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid        REFERENCES public.messages(id) ON DELETE CASCADE,
  filename     text        NOT NULL DEFAULT '',
  mime_type    text        NOT NULL DEFAULT 'application/octet-stream',
  size         int         NOT NULL DEFAULT 0,
  storage_path text        NOT NULL DEFAULT '',  -- path w buckecie message-attachments
  content_id   text,                             -- CID dla inline obrazków
  inline       boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_attachments_message_id_idx ON public.message_attachments (message_id);

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_attachments' AND policyname = 'No public access') THEN
    CREATE POLICY "No public access" ON public.message_attachments FOR ALL USING (false);
  END IF;
END $$;

-- RPC: get_message_attachments — lista załączników dla wiadomości
CREATE OR REPLACE FUNCTION public.get_message_attachments(p_message_id uuid)
RETURNS TABLE(id uuid, filename text, mime_type text, size int, storage_path text, content_id text, inline boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.filename, a.mime_type, a.size, a.storage_path, a.content_id, a.inline, a.created_at
  FROM message_attachments a
  WHERE a.message_id = p_message_id
  ORDER BY a.inline DESC, a.created_at ASC;
END;
$$;

-- RPC: save_attachment — zapisuje załącznik
CREATE OR REPLACE FUNCTION public.save_attachment(
  p_message_id  uuid,
  p_filename    text,
  p_mime_type   text,
  p_size        int,
  p_storage_path text,
  p_content_id  text DEFAULT NULL,
  p_inline      boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO message_attachments(message_id, filename, mime_type, size, storage_path, content_id, inline)
  VALUES (p_message_id, p_filename, p_mime_type, p_size, p_storage_path, p_content_id, p_inline)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Storage bucket (prywatny — dostęp tylko przez service_role)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('message-attachments', 'message-attachments', false, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;
