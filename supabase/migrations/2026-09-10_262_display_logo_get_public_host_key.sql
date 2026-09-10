-- 262: display_logo_get_public — dopuść też share_key_host
--
-- Host2 (host2/js/*) rysuje logo gry na okładce (.cover2Logo) w takim samym
-- stylu co wektor "Familiada" (gapless siatka kwadratów w kolorze DOT) — do
-- tego potrzebuje prawdziwego payloadu logo ({type, payload}), nie samego
-- logoId. display_logo_get_public dotąd sprawdzał WYŁĄCZNIE
-- share_key_display — Host miał zero autoryzowanego sposobu na pobranie
-- danych logo. Dopuszczamy też share_key_host — czysto addytywne
-- rozszerzenie warunku dostępu, reszta funkcji (rozstrzygnięcie logoId z
-- games.settings, zwrot payloadu) bez zmian.

CREATE OR REPLACE FUNCTION public.display_logo_get_public(p_game_id uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_owner    uuid;
  v_ok       boolean;
  v_logo_id  uuid;
  v_logo     jsonb;
begin
  select (g.share_key_display = p_key or g.share_key_host = p_key),
         g.owner_id,
         (g.settings -> 'display' ->> 'logoId')::uuid
    into v_ok, v_owner, v_logo_id
  from public.games g
  where g.id = p_game_id;

  if v_ok is distinct from true then
    return null;
  end if;

  if v_logo_id is not null then
    select jsonb_build_object('type', ul.type, 'payload', ul.payload, 'name', ul.name)
      into v_logo
    from public.user_logos ul
    where ul.id = v_logo_id and ul.user_id = v_owner;
  end if;

  return v_logo;
end $$;
