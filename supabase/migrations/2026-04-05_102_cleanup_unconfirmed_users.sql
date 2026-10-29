-- Migration: 2026-04-05_102_cleanup_unconfirmed_users.sql
-- Purpose: Extend guest_cleanup_expired to also remove unconfirmed accounts (no username, no sign-in, > 5 days old).

CREATE OR REPLACE FUNCTION "public"."guest_cleanup_expired"("p_limit" integer DEFAULT 500) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_deleted int := 0;
  v_id uuid;
begin
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
    end loop;
  end if;

  return v_deleted;
end;
$$;
