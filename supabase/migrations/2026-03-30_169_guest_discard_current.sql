-- 169: Add guest_discard_current RPC
-- Fully deletes the current guest account (all data + auth.users row).

CREATE OR REPLACE FUNCTION public.guest_discard_current()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false)
    into v_is_guest
  from public.profiles
  where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  perform public.delete_user_everything(v_uid);

  return jsonb_build_object('ok', true);
end;
$$;
