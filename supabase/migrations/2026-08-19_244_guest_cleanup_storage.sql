-- 244: guest_cleanup_expired — also sweep Storage for each deleted account
--
-- delete_user_everything() is pure SQL and cannot reach Storage, so
-- accounts removed by the nightly guest-expiry cron leave orphaned files
-- in user-sounds/user-logos. This adds a pg_net call to the new
-- cleanup-guest-storage edge function right after each deletion, mirroring
-- the existing cron_embed_missing_market_games() pattern (2026-03-14_109) —
-- reuses the same app_config.edge_url / edge_service_role_jwt keys.
--
-- Storage cleanup is best-effort: if app_config isn't populated, or the
-- HTTP call fails, the account deletion itself still proceeds unaffected
-- (net.http_post is fire-and-forget from plpgsql's point of view).

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.guest_cleanup_expired(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_deleted int := 0;
  v_id uuid;
  v_url text;
  v_jwt text;
begin
  select value into v_url from public.app_config where key = 'edge_url';
  select value into v_jwt from public.app_config where key = 'edge_service_role_jwt';

  -- 1. Usuwanie wygasłych gości (zgodnie z istniejącą logiką)
  for v_id in
    select p.id
    from public.profiles p
    where p.is_guest = true
      and p.guest_expires_at is not null
      and p.guest_expires_at < now()
    order by p.guest_expires_at asc
    limit v_limit
  loop
    perform public.delete_user_everything(v_id);
    v_deleted := v_deleted + 1;

    if coalesce(v_url, '') <> '' and coalesce(v_jwt, '') <> '' then
      perform net.http_post(
        url := v_url || '/functions/v1/cleanup-guest-storage',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_jwt,
          'apikey', v_jwt
        ),
        body := jsonb_build_object('userId', v_id)
      );
    end if;
  end loop;

  -- 2. Usuwanie niepotwierdzonych kont (brak username, brak logowania, > 5 dni)
  -- Robimy to tylko jeśli limit nie został wyczerpany przez gości
  if v_deleted < v_limit then
    for v_id in
      select u.id
      from auth.users u
      left join public.profiles p on p.id = u.id
      where (p.username IS NULL OR p.id IS NULL) -- profil brakujący lub brak username
        and u.last_sign_in_at IS NULL            -- nigdy się nie zalogował
        and u.created_at < (now() - interval '5 days')
        and coalesce(p.is_guest, false) = false  -- nie jest gościem (goście mają osobną logikę)
      limit (v_limit - v_deleted)
    loop
      perform public.delete_user_everything(v_id);
      v_deleted := v_deleted + 1;

      if coalesce(v_url, '') <> '' and coalesce(v_jwt, '') <> '' then
        perform net.http_post(
          url := v_url || '/functions/v1/cleanup-guest-storage',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_jwt,
            'apikey', v_jwt
          ),
          body := jsonb_build_object('userId', v_id)
        );
      end if;
    end loop;
  end if;

  return v_deleted;
end;
$$;
