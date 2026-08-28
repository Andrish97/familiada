-- Warstwa 1 audytu "wielu miejsc naraz" (docs/plan-testy-i-poprawki.md):
-- ogólna, jedna tabela blokad edycji dla całego projektu (edytor gry,
-- ustawienia, ankieta, logo, baza pytań, rozgrywka), na wzór już
-- istniejącego device_presence (heartbeat + TTL sprawdzany po stronie
-- klienta). holder_tab_id (nie user_id!) bo blokujemy też drugą kartę
-- TEGO SAMEGO użytkownika, nie tylko innych.

CREATE TABLE IF NOT EXISTS "public"."edit_locks" (
    "resource_type"  "text" NOT NULL,
    "resource_id"    "uuid" NOT NULL,
    "holder_tab_id"  "text" NOT NULL,
    "holder_user_id" "uuid" NOT NULL,
    "acquired_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    "heartbeat_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("resource_type", "resource_id")
);

ALTER TABLE "public"."edit_locks" ENABLE ROW LEVEL SECURITY;

-- Odczyt: tylko ten, kto i tak miałby prawo edytować dany zasób (ten sam
-- warunek co w acquire_edit_lock niżej) — więc np. gracz widzi czy JEGO
-- gra jest zajęta w innej karcie, ale nie widzi blokad cudzych gier.
CREATE POLICY "edit_locks_read_if_can_edit_resource" ON "public"."edit_locks"
    FOR SELECT TO "authenticated"
    USING (
      CASE resource_type
        WHEN 'game_editor'   THEN EXISTS (SELECT 1 FROM public.games WHERE id = resource_id AND owner_id = auth.uid())
        WHEN 'game_settings' THEN EXISTS (SELECT 1 FROM public.games WHERE id = resource_id AND owner_id = auth.uid())
        WHEN 'poll'          THEN EXISTS (SELECT 1 FROM public.games WHERE id = resource_id AND owner_id = auth.uid())
        WHEN 'control'       THEN EXISTS (SELECT 1 FROM public.games WHERE id = resource_id AND owner_id = auth.uid())
        WHEN 'logo'          THEN EXISTS (SELECT 1 FROM public.user_logos WHERE id = resource_id AND user_id = auth.uid())
        WHEN 'base'          THEN public.base_can_edit(resource_id, auth.uid())
        ELSE false
      END
    );

-- Zapis WYŁĄCZNIE przez RPC (SECURITY DEFINER) niżej — bez tego każdy
-- authenticated mógłby wstawić/nadpisać blokadę byle jakiego resource_id.
-- (brak jakiejkolwiek policy dla INSERT/UPDATE/DELETE = domyślna odmowa)

-- Jedna funkcja robi i pierwsze zajęcie, i odnowienie heartbeatu (klient
-- woła identycznie co ~8s), z atomowym przejęciem po TTL (25s = margines
-- ~3 pominiętych heartbeatów na zerwanie sieci) żeby martwa karta nie
-- blokowała zasobu na zawsze.
CREATE FUNCTION "public"."acquire_edit_lock"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_can boolean := false;
  v_row public.edit_locks;
  v_got boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if coalesce(trim(p_tab_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_tab_id');
  end if;

  if p_resource_type in ('game_editor', 'game_settings', 'poll', 'control') then
    v_can := exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid);
  elsif p_resource_type = 'logo' then
    v_can := exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid);
  elsif p_resource_type = 'base' then
    v_can := public.base_can_edit(p_resource_id, v_uid);
  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;

  if not v_can then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Jedna atomowa instrukcja zamiast "sprawdź, potem zapisz" (SELECT ...
  -- FOR UPDATE nie zablokowałby wiersza, który jeszcze nie istnieje — dwie
  -- karty acquire'ujące w tej samej milisekundzie mogłyby obie trafić w
  -- INSERT i jedna dostałaby nieobsłużony unique_violation). ON CONFLICT
  -- DO UPDATE ... WHERE jest niepodzielne: aktualizuje TYLKO gdy to ta sama
  -- karta (odnowienie heartbeatu) albo poprzednia blokada wygasła (TTL 25s
  -- = margines ~3 pominiętych heartbeatów na zerwanie sieci); w przeciwnym
  -- razie WHERE nie przechodzi, nic się nie zmienia, RETURNING nic nie
  -- zwraca — v_got zostaje NULL, traktowane niżej jak "nie wygrano".
  insert into public.edit_locks (resource_type, resource_id, holder_tab_id, holder_user_id, acquired_at, heartbeat_at)
  values (p_resource_type, p_resource_id, p_tab_id, v_uid, now(), now())
  on conflict (resource_type, resource_id) do update
    set holder_tab_id = excluded.holder_tab_id,
        holder_user_id = excluded.holder_user_id,
        heartbeat_at = excluded.heartbeat_at,
        acquired_at = case
          when public.edit_locks.holder_tab_id = excluded.holder_tab_id
            then public.edit_locks.acquired_at  -- ta sama karta: zachowaj oryginalny czas zajęcia
          else excluded.acquired_at             -- przejęcie po TTL: liczy się od teraz
        end
    where public.edit_locks.holder_tab_id = excluded.holder_tab_id
       or public.edit_locks.heartbeat_at < now() - interval '25 seconds'
  returning true into v_got;

  if v_got is true then
    return jsonb_build_object('ok', true, 'acquired', true);
  end if;

  select * into v_row
  from public.edit_locks
  where resource_type = p_resource_type and resource_id = p_resource_id;

  return jsonb_build_object(
    'ok', false,
    'error', 'locked',
    'holder_user_id', v_row.holder_user_id,
    'acquired_at', v_row.acquired_at
  );
end;
$$;

-- Zwalnia blokadę TYLKO jeśli wołający jest jej aktualnym posiadaczem
-- (po holder_tab_id) — nikt nie może zdjąć cudzej blokady tą drogą.
-- Wołane z klienta na "pagehide" — best-effort (przeglądarka może ubić
-- żądanie w trakcie nawigacji/zamknięcia karty); jeśli się nie wykona,
-- blokada i tak wygasa przez TTL sprawdzany w acquire_edit_lock wyżej.
CREATE FUNCTION "public"."release_edit_lock"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.edit_locks
  where resource_type = p_resource_type
    and resource_id = p_resource_id
    and holder_tab_id = p_tab_id;

  return jsonb_build_object('ok', true);
end;
$$;
