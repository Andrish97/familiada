-- 123: Fix ambiguous column reference in list_shared_devices_for_me (v2)
-- Błąd 42702 (ambiguous column) wynika z konfliktu między nazwą kolumny w tabeli 
-- a nazwą kolumny w definicji RETURNS TABLE podczas operacji DELETE.

DROP FUNCTION IF EXISTS public.list_shared_devices_for_me();

CREATE OR REPLACE FUNCTION public.list_shared_devices_for_me()
RETURNS TABLE (
  share_id        uuid,
  device_type     text,
  owner_id        uuid,
  owner_username  text,
  owner_email     text,
  game_id         uuid,
  game_name       text,
  expires_at      timestamptz,
  share_key       text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Używamy aliasu w DELETE, aby uniknąć konfliktu z nazwą kolumny wyjściowej
  DELETE FROM public.shared_devices sd_del
  WHERE sd_del.expires_at IS NOT NULL AND sd_del.expires_at < now();
  
  RETURN QUERY
  SELECT 
    sd.id, 
    sd.device_type, 
    sd.owner_id, 
    p.username, 
    p.email,
    sd.game_id, 
    sd.game_name, 
    sd.expires_at,
    CASE 
      WHEN sd.device_type = 'host' THEN g.share_key_host
      WHEN sd.device_type = 'buzzer' THEN g.share_key_buzzer
      WHEN sd.device_type = 'display' THEN g.share_key_display
      ELSE NULL
    END as share_key
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.owner_id
  LEFT JOIN public.games g ON g.id = sd.game_id
  WHERE sd.recipient_id = auth.uid();
END;
$$;

NOTIFY pgrst, 'reload schema';
