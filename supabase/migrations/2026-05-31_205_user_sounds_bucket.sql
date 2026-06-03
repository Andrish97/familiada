-- 205: Create user-sounds storage bucket and set up RLS policies

-- 1. Create the bucket (private: users access only their own files)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-sounds',
  'user-sounds',
  false,
  2097152, -- 2MB
  ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up RLS policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "user-sounds-select" ON storage.objects;
  DROP POLICY IF EXISTS "user-sounds-insert" ON storage.objects;
  DROP POLICY IF EXISTS "user-sounds-update" ON storage.objects;
  DROP POLICY IF EXISTS "user-sounds-delete" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- SELECT: only the owner
CREATE POLICY "user-sounds-select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: authenticated user, own folder
CREATE POLICY "user-sounds-insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: only owner
CREATE POLICY "user-sounds-update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: only owner
CREATE POLICY "user-sounds-delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS user_sounds_bucket_folder_idx
  ON storage.objects USING btree (bucket_id, ((storage.foldername(name))[1]))
  WHERE bucket_id = 'user-sounds';
