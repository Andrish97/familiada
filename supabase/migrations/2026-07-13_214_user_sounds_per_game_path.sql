-- 214: Update user-sounds bucket RLS — path changed to {uid}/{game_id}/{sfx_key}
--
-- Stara ścieżka: {uid}/{sfx_key}
-- Nowa ścieżka:  {uid}/{game_id}/{sfx_key}
--
-- RLS sprawdza tylko pierwszy segment (uid) — właściciel może zapisywać
-- pliki dla dowolnej swojej gry bez dodatkowych warunków po stronie DB.
-- Weryfikacja czy game_id należy do użytkownika odbywa się w aplikacji.

DO $$ BEGIN
  DROP POLICY IF EXISTS "user-sounds-select" ON storage.objects;
  DROP POLICY IF EXISTS "user-sounds-insert" ON storage.objects;
  DROP POLICY IF EXISTS "user-sounds-update" ON storage.objects;
  DROP POLICY IF EXISTS "user-sounds-delete" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "user-sounds-select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user-sounds-insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user-sounds-update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user-sounds-delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
