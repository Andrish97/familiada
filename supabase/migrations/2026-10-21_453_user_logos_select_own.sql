-- Bezpieczeństwo (audyt E24, B9, 2026-10-21): publiczny SELECT na
-- storage.objects dla bucketu user-logos pozwalał każdemu listować foldery
-- (UUID kont) i nazwy plików logo. Obrazy idą publicznym URL-em
-- (/storage/v1/object/public/... w publicznym buckecie nie sprawdza polityk),
-- więc SELECT zostaje tylko właścicielowi folderu (potrzebny przy wgrywaniu
-- i usuwaniu własnych plików). Kopie logo (Worker) i sprzątanie (Edge) działają
-- kluczem serwisowym.

DROP POLICY IF EXISTS "user-logos-select" ON storage.objects;
DROP POLICY IF EXISTS "user-logos-select-own" ON storage.objects;

CREATE POLICY "user-logos-select-own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Bucket zostaje publiczny (publiczne adresy obrazów w Display/Host/edytorze).
UPDATE storage.buckets SET public = true WHERE id = 'user-logos' AND public IS DISTINCT FROM true;
