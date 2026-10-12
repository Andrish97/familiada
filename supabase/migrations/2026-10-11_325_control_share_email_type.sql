-- PostgreSQL w produkcji ma auth.users.email jako varchar, a lokalne
-- stuby definiują je jako text. Rzutowanie jest potrzebne do zgodności
-- z typem recipient_email zdeklarowanym w RETURNS TABLE.
CREATE OR REPLACE FUNCTION public.control_device_shares_list(p_game_id uuid,p_device_type text)
RETURNS TABLE(
  share_id uuid, recipient_id uuid, recipient_username text, recipient_email text,
  recipient_kind text, share_token uuid, created_at timestamptz, is_friend boolean,
  cooldown_until timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT sh.id, sh.recipient_id, p.username,
    (CASE WHEN sh.recipient_id IS NULL THEN sh.recipient_email ELSE u.email END)::text,
    CASE WHEN sh.recipient_id IS NULL THEN 'mail'
      WHEN public.are_friends(v_uid,sh.recipient_id) THEN 'friend' ELSE 'account' END,
    sh.token,sh.created_at,
    coalesce(public.are_friends(v_uid,sh.recipient_id),false),
    (SELECT mc.next_allowed_at FROM public.mail_cooldowns mc
      WHERE mc.action_key='device:share' AND mc.target_key = CASE
        WHEN sh.recipient_id IS NOT NULL THEN 'pair:'||v_uid::text||':'||sh.recipient_id::text||':device:'||p_device_type||':game:'||p_game_id::text
        ELSE 'pair:'||v_uid::text||':'||md5(sh.recipient_email)||':device:'||p_device_type||':game:'||p_game_id::text END)
  FROM public.control_device_shares sh
  JOIN public.control_runtime_sessions s ON s.id=sh.session_id
  LEFT JOIN public.profiles p ON p.id=sh.recipient_id
  LEFT JOIN auth.users u ON u.id=sh.recipient_id
  WHERE sh.game_id=p_game_id AND sh.owner_id=v_uid AND sh.device_type=p_device_type
    AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
  ORDER BY sh.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.control_device_shares_list(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_device_shares_list(uuid,text) TO authenticated;
