-- Fix: Allow public access to user-logos bucket files
-- This ensures that uploaded logos can be viewed by anyone via public URL

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "user-logos-select" ON storage.objects;

-- Create new SELECT policy that allows ANYONE to view files in user-logos bucket
-- This is needed for public bucket access to work correctly
CREATE POLICY "user-logos-select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'user-logos');

-- Also ensure the bucket is marked as public
UPDATE storage.buckets
SET public = true
WHERE id = 'user-logos';
