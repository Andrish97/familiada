-- Host2-only read: an edited logo stays hidden behind the default wordmark.
-- Existing Display/Host1 RPC and historical data are unchanged.
CREATE OR REPLACE FUNCTION public.host2_logo_get_public(p_game_id uuid, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g public.games;
  logo_id uuid;
  logo jsonb;
  busy boolean;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = p_game_id;
  IF NOT FOUND OR p_key IS NULL OR p_key = '' OR g.share_key_host IS DISTINCT FROM p_key THEN RETURN NULL; END IF;
  logo_id := nullif(g.settings->'display'->>'logoId', '')::uuid;
  SELECT EXISTS(SELECT 1 FROM public.edit_locks l WHERE l.resource_type = 'logo' AND l.resource_id = logo_id
    AND l.heartbeat_at > now() - interval '25 seconds') INTO busy;
  IF NOT busy AND logo_id IS NOT NULL THEN
    SELECT jsonb_build_object('type', l.type, 'payload', l.payload, 'name', l.name) INTO logo
    FROM public.user_logos l WHERE l.id = logo_id AND l.user_id = g.owner_id;
  END IF;
  RETURN jsonb_build_object('busy', busy, 'logo', logo, 'logoId', logo_id);
END $$;
REVOKE ALL ON FUNCTION public.host2_logo_get_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host2_logo_get_public(uuid,text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
