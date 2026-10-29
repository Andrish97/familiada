-- 094: Rename storage bucket to 'marketplace' and update policies
-- The user specified that the bucket is named 'marketplace'.

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketplace',
  'marketplace',
  false,
  10485760, -- 10MB
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Update policies for 'marketplace' bucket
DO $$ BEGIN
  DROP POLICY IF EXISTS "marketplace-select" ON storage.objects;
  DROP POLICY IF EXISTS "marketplace-insert" ON storage.objects;
  DROP POLICY IF EXISTS "marketplace-update" ON storage.objects;
  DROP POLICY IF EXISTS "marketplace-delete" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "marketplace-select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'marketplace');

CREATE POLICY "marketplace-insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'marketplace'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = 'marketplace'
    )
  );

CREATE POLICY "marketplace-update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'marketplace'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = 'marketplace'
    )
  );

CREATE POLICY "marketplace-delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'marketplace'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = 'marketplace'
    )
  );

-- 3. Fix index for the new bucket
DROP INDEX IF EXISTS marketplace_bucket_folder_idx;
CREATE INDEX IF NOT EXISTS marketplace_bucket_folder_idx
  ON storage.objects USING btree (bucket_id, ((storage.foldername(name))[1]))
  WHERE bucket_id = 'marketplace';

-- 4. (Optional) Cleanup old bucket if empty and not needed
-- We keep community-games for now to avoid data loss if someone already used it,
-- but the code will switch to 'marketplace'.
