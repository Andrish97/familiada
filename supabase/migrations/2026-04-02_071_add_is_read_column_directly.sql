-- 071: Add is_read column directly (not via function)

-- Add is_read column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'is_read'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN is_read boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add read_at column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'read_at'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN read_at timestamp with time zone;
  END IF;
END $$;

-- Create index for faster unread queries
CREATE INDEX IF NOT EXISTS idx_messages_unread 
ON public.messages (direction, is_read, report_id)
WHERE deleted_at IS NULL;
