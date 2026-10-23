-- 479: Blokady zasobów — atomowo i z Realtime Presence (docs/blokady-zasobow.md,
-- sekcja 8). Tylko dodaje / podmienia funkcje; zgodne wstecz z działającym kodem
-- (stare strony dalej wołają acquire_edit_lock_mode i release_edit_lock).
--  * acquire_edit_lock_mode: odpowiedź `locked` zwraca też `blocker_id` (zasób,
--    który przeszkadza) — czekająca karta wie, którego kanału Presence słuchać
--    (logos ↔ logo:L to różne klucze).
--  * acquire_edit_locks: tryb per zasób (pole `mode` elementu; p_mode = domyślny) —
--    strona bierze game:G wyłącznie + logos współdzielone JEDNYM wywołaniem,
--    wszystko albo nic w jednej transakcji (dotąd po kolei, osobnymi zapytaniami).
--  * edit_lock_absent_grace() = 25 s; expire_edit_locks_absent(typ, id, obecne karty):
--    czekająca karta usuwa blokady kart, których nie ma na kanale Presence zasobu
--    i które od 25 s nie odnowiły blokady (karta zamknięta bez pagehide, zabita
--    przeglądarka, uśpiony telefon) — zamiast czekać na TTL 120 s. Karta żywa
--    odnawia co 8 s także w tle (Web Worker), więc nigdy nie traci blokady, nawet
--    gdy Presence chwilowo jej nie widzi (zerwane WebSocket). TTL 120 s zostaje
--    jako ostateczny bezpiecznik, gdy nikt nie czeka albo Realtime nie działa.
--  * release_edit_lock: zwalnia tylko własne blokady (holder_user_id = auth.uid()) —
--    identyfikatory kart są widoczne w Presence, więc nie mogą być kluczem do
--    zwolnienia blokady innej osoby (współpracownik bazy).
BEGIN;

CREATE OR REPLACE FUNCTION "public"."edit_lock_absent_grace"() RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    AS $$ select interval '25 seconds' $$;  -- 479: 3 nieudane odnowienia co 8 s

-- ---------------------------------------------------------------- acquire (+ blocker_id)

CREATE OR REPLACE FUNCTION "public"."acquire_edit_lock_mode"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text", "p_context" "text" DEFAULT NULL::"text", "p_mode" "text" DEFAULT 'exclusive'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean := false;
  v_key text;
  v_owner uuid;
  v_row public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(trim(p_tab_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_tab_id');
  end if;
  if p_mode not in ('exclusive', 'shared') then
    return jsonb_build_object('ok', false, 'error', 'unknown_mode');
  end if;
  if p_resource_type not in ('game', 'logo', 'logos', 'base', 'base_question', 'base_folder', 'base_tag') then
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
  v_exists := case p_resource_type
    when 'game' then exists (select 1 from public.games where id = p_resource_id)
    when 'logo' then exists (select 1 from public.user_logos where id = p_resource_id)
    when 'logos' then p_resource_id = v_uid
    when 'base' then exists (select 1 from public.question_bases where id = p_resource_id)
    when 'base_question' then exists (select 1 from public.qb_questions where id = p_resource_id)
    when 'base_folder' then exists (select 1 from public.qb_categories where id = p_resource_id)
    when 'base_tag' then exists (select 1 from public.qb_tags where id = p_resource_id)
    else false
  end;
  if not v_exists then
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if not public.can_edit_locked_resource(p_resource_type, p_resource_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- serializacja zajmowania w obrębie zasobu; logo i pula logo użytkownika
  -- dzielą jeden klucz, bo zasady zgodności łączą je ze sobą.
  if p_resource_type = 'logo' then
    select user_id into v_owner from public.user_logos where id = p_resource_id;
    v_key := 'logos:' || v_owner::text;
  elsif p_resource_type = 'logos' then
    v_key := 'logos:' || p_resource_id::text;
  else
    v_key := p_resource_type || ':' || p_resource_id::text;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  -- wygasłe trzymania innych kart tego zasobu znikają (zwalniają klucz
  -- wyłączny); wygasłe nie przeszkadzają też w edit_lock_blockers.
  delete from public.edit_locks
   where resource_type = p_resource_type
     and resource_id = p_resource_id
     and holder_tab_id <> p_tab_id
     and heartbeat_at < now() - public.edit_lock_ttl();

  select * into v_row
  from public.edit_lock_blockers(p_resource_type, p_resource_id, p_mode, p_tab_id)
  order by acquired_at
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'holder_user_id', v_row.holder_user_id, 'acquired_at', v_row.acquired_at,
      'blocker_type', v_row.resource_type, 'blocker_id', v_row.resource_id,  -- 479: + blocker_id
      'blocker_mode', v_row.mode, 'blocker_context', v_row.holder_context);
  end if;

  insert into public.edit_locks
    (resource_type, resource_id, holder_tab_id, holder_user_id, holder_context, mode, acquired_at, heartbeat_at)
  values
    (p_resource_type, p_resource_id, p_tab_id, v_uid, p_context, p_mode, now(), now())
  on conflict (resource_type, resource_id, holder_tab_id) do update
    set holder_user_id = excluded.holder_user_id,
        holder_context = excluded.holder_context,
        heartbeat_at = excluded.heartbeat_at,
        acquired_at = case
          when public.edit_locks.mode = excluded.mode
            then public.edit_locks.acquired_at
          else excluded.acquired_at
        end,
        mode = excluded.mode;

  return jsonb_build_object('ok', true, 'acquired', true);
end;
$$;

-- ---------------------------------------------------------------- acquire zestawu (tryb per zasób)

-- p_resources: [{"type": "game", "id": "<uuid>", "mode": "exclusive"},
--               {"type": "logos", "id": "<uuid>", "mode": "shared"}, …]
-- `mode` elementu nadpisuje p_mode. Stała kolejność (bez zakleszczeń), wszystko
-- albo nic — pierwsza odmowa wycofuje już zajęte z tego wywołania i zwraca jej
-- wynik z polem resource. Odnowienie = to samo wywołanie.
CREATE OR REPLACE FUNCTION public.acquire_edit_locks(p_resources jsonb, p_tab_id text, p_context text DEFAULT NULL, p_mode text DEFAULT 'exclusive') RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_res jsonb;
  v_fail jsonb;
  v_n int := 0;
BEGIN
  BEGIN
    FOR r IN SELECT DISTINCT ON (x->>'type', (x->>'id')::uuid)
                    x->>'type' AS type, (x->>'id')::uuid AS id,
                    coalesce(nullif(x->>'mode', ''), p_mode) AS mode  -- 479: tryb per zasób
               FROM jsonb_array_elements(coalesce(p_resources, '[]'::jsonb)) x
              ORDER BY x->>'type', (x->>'id')::uuid LOOP
      v_res := public.acquire_edit_lock_mode(r.type, r.id, p_tab_id, p_context, r.mode);
      IF NOT coalesce((v_res->>'ok')::boolean, false) THEN
        v_fail := v_res || jsonb_build_object('resource', jsonb_build_object('type', r.type, 'id', r.id, 'mode', r.mode));
        RAISE EXCEPTION 'edit_locks:refused';
      END IF;
      v_n := v_n + 1;
    END LOOP;
  EXCEPTION WHEN raise_exception THEN
    IF v_fail IS NOT NULL THEN RETURN v_fail; END IF;
    RAISE;
  END;
  RETURN jsonb_build_object('ok', true, 'count', v_n);
END;
$$;

-- ---------------------------------------------------------------- martwe karty (Presence)

-- Czekająca karta zna z kanału Presence zasobu karty, które są na nim obecne
-- (p_present_tabs). Blokady kart NIEobecnych, które od edit_lock_absent_grace()
-- nie odnowiły blokady, znikają — jak przy TTL, tylko wcześniej. Karta obecna
-- albo odnawiająca blokadę zostaje. Wołający musi mieć prawo edycji zasobu
-- (inaczej mógłby zwalniać cudze blokady, np. pytań bazy, do której nie ma dostępu).
CREATE OR REPLACE FUNCTION "public"."expire_edit_locks_absent"("p_resource_type" "text", "p_resource_id" "uuid", "p_present_tabs" "text"[], "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_owner uuid;
  v_n int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_resource_type not in ('game', 'logo', 'logos', 'base', 'base_question', 'base_folder', 'base_tag') then
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
  if not public.can_edit_locked_resource(p_resource_type, p_resource_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- ten sam klucz serializacji co acquire_edit_lock_mode
  if p_resource_type = 'logo' then
    select user_id into v_owner from public.user_logos where id = p_resource_id;
    v_key := 'logos:' || coalesce(v_owner::text, p_resource_id::text);
  elsif p_resource_type = 'logos' then
    v_key := 'logos:' || p_resource_id::text;
  else
    v_key := p_resource_type || ':' || p_resource_id::text;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  delete from public.edit_locks
   where resource_type = p_resource_type
     and resource_id = p_resource_id
     and holder_tab_id is distinct from p_tab_id
     and not (holder_tab_id = any (coalesce(p_present_tabs, '{}'::text[])))
     and heartbeat_at < now() - public.edit_lock_absent_grace();
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'removed', v_n);
end;
$$;

-- ---------------------------------------------------------------- release tylko własnych

CREATE OR REPLACE FUNCTION "public"."release_edit_lock"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.edit_locks
  where resource_type = p_resource_type
    and resource_id = p_resource_id
    and holder_tab_id = p_tab_id
    and holder_user_id = auth.uid();  -- 479: tylko własne

  return jsonb_build_object('ok', true);
end;
$$;

REVOKE ALL ON FUNCTION public.edit_lock_absent_grace() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_edit_locks_absent(text, uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_lock_absent_grace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_edit_locks_absent(text, uuid, text[], text) TO authenticated;

COMMIT;
