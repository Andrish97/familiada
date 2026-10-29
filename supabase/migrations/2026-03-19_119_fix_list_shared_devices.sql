-- 119: Upewnij się że kolumny istnieją i przebuduj funkcję (fix dla persistent 400)
ALTER TABLE public.shared_devices
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS game_name text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Wymuś przebudowę funkcji
DROP FUNCTION IF EXISTS public.list_shared_devices_for_me();

CREATE FUNCTION public.list_shared_devices_for_me()
RETURNS TABLE (
  share_id uuid, device_type text, owner_id uuid,
  owner_username text, owner_email text,
  game_id uuid, game_name text, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.shared_devices WHERE expires_at IS NOT NULL AND expires_at < now();
  RETURN QUERY
  SELECT sd.id, sd.device_type, sd.owner_id, p.username, p.email,
         sd.game_id, sd.game_name, sd.expires_at
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.owner_id
  WHERE sd.recipient_id = auth.uid();
END;
$$;

NOTIFY pgrst, 'reload schema';
