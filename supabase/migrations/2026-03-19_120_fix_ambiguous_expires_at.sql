-- 120: Fix ambiguous expires_at in list_shared_devices_for_me

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
  DELETE FROM public.shared_devices sd2
  WHERE sd2.expires_at IS NOT NULL AND sd2.expires_at < now();

  RETURN QUERY
  SELECT sd.id, sd.device_type, sd.owner_id, p.username, p.email,
         sd.game_id, sd.game_name, sd.expires_at
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.owner_id
  WHERE sd.recipient_id = auth.uid();
END;
$$;

NOTIFY pgrst, 'reload schema';
