-- 121: Naprawa ograniczenia device_type w shared_devices i przeładowanie schematu PostgREST
-- Poprzednie migracje mogły nie odświeżyć schematu lub nie zaktualizować CHECK constraint.

ALTER TABLE public.shared_devices
  DROP CONSTRAINT IF EXISTS shared_devices_device_type_check;

ALTER TABLE public.shared_devices
  ADD CONSTRAINT shared_devices_device_type_check
    CHECK (device_type IN ('host', 'buzzer', 'display'));

-- Upewnij się, że kolumny są poprawne (defensywnie)
ALTER TABLE public.shared_devices
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS game_name text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Przeładuj schemat PostgREST
NOTIFY pgrst, 'reload schema';
