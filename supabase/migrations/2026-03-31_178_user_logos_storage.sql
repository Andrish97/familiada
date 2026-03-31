-- 178: Create user-logos storage bucket and set up RLS policies

-- 1. Create the bucket if it doesn't exist
-- We make it public so that logos can be easily previewed by their URLs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-logos',
  'user-logos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up RLS policies for 'user-logos' bucket
-- We use a DO block to safely drop existing policies before recreating them
DO $$ BEGIN
  DROP POLICY IF EXISTS "user-logos-select" ON storage.objects;
  DROP POLICY IF EXISTS "user-logos-insert" ON storage.objects;
  DROP POLICY IF EXISTS "user-logos-update" ON storage.objects;
  DROP POLICY IF EXISTS "user-logos-delete" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- SELECT: Anyone can view (since it's a public bucket, but we add an explicit policy for clarity)
CREATE POLICY "user-logos-select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-logos');

-- INSERT: Authenticated users can upload to their own folder (auth.uid() / filename)
CREATE POLICY "user-logos-insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: Authenticated users can update objects in their own folder
CREATE POLICY "user-logos-update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: Authenticated users can delete objects in their own folder
CREATE POLICY "user-logos-delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Index for performance when filtering by folder
CREATE INDEX IF NOT EXISTS user_logos_bucket_folder_idx
  ON storage.objects USING btree (bucket_id, ((storage.foldername(name))[1]))
  WHERE bucket_id = 'user-logos';
