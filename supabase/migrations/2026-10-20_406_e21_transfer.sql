-- 406: E21 — wspólny kontrakt transferu gier (docs/reguly-gier-transfer-plan.md §4).
-- Ten sam kontrakt co web/shared/js/core/game-transfer-format.js:
--  * pakiet v2 {format_version: 2, game: {name, type, state}, questions}; pięć
--    wariantów: prepared/poll_points/poll_text w szkicu oraz zamknięte ankiety;
--  * pakiet bez wersji (v1): rozpoznany typ -> szkic; niejasny -> jawne
--    odzyskanie preparowanej w szkicu (recovered); punkty v1: fixed_points
--    albo points;
--  * normalizacja bez pytania: nazwa 80, pytanie 100, odpowiedź 17 (znaki
--    spoza czcionki usunięte, puste odpowiedzi pominięte, bez tekstów
--    zastępczych), punkty ujemne/nienumeryczne/spoza 0–100 -> 0, przy >6
--    odpowiedziach sześć najwyżej punktowanych (remis: kolejność wejścia);
--  * zamknięty wynik tylko poprawny (≥10 pytań, 3–6 odpowiedzi po ≥4 pkt,
--    suma ≤100) -- inaczej szkic tego samego typu;
--  * Powiel: także otwarta/zatrzymana ankieta (szkic bez głosów); Wyślij:
--    tylko szkice; kopia market: bez transferu, zostaje (archiwalna) po
--    usunięciu pozycji Marketplace.

CREATE OR REPLACE FUNCTION public._transfer_points(p jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v numeric;
BEGIN
  IF jsonb_typeof(p) = 'number' THEN
    v := (p #>> '{}')::numeric;
  ELSIF jsonb_typeof(p) = 'string' AND btrim(p #>> '{}') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' THEN
    v := btrim(p #>> '{}')::numeric;
  ELSE
    RETURN 0;
  END IF;
  IF v < 0 OR v > 100 THEN RETURN 0; END IF;
  RETURN floor(v)::int;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN 0;
END $$;

CREATE OR REPLACE FUNCTION public._game_package_normalize(p_payload jsonb, p_defaults jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v1 boolean;
  typ text;
  raw_type text;
  recovered boolean := false;
  wants_closed boolean;
  closed_ok boolean;
  state text;
  with_answers boolean;
  keep_points boolean;
  nm text;
  q record;
  qt text;
  full_qs jsonb := '[]';
  ans jsonb;
  out_qs jsonb := '[]';
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'game') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload->'questions') IS DISTINCT FROM 'array' OR octet_length(p_payload::text) > 8388608 THEN
    RAISE EXCEPTION 'invalid_game_package';
  END IF;
  v1 := NOT (p_payload ? 'format_version');
  IF NOT v1 AND p_payload->'format_version' IS DISTINCT FROM '2'::jsonb THEN
    RAISE EXCEPTION 'invalid_game_package';
  END IF;

  raw_type := p_payload#>>'{game,type}';
  IF raw_type IN ('prepared', 'poll_text', 'poll_points') THEN
    typ := raw_type;
  ELSIF v1 THEN
    typ := 'prepared';   -- jawne odzyskanie niejasnego pakietu historycznego
    recovered := true;
  ELSE
    RAISE EXCEPTION 'invalid_game_package';
  END IF;
  wants_closed := NOT v1 AND typ IN ('poll_text', 'poll_points') AND p_payload#>>'{game,state}' = 'closed';

  FOR q IN SELECT value, ordinality FROM jsonb_array_elements(p_payload->'questions') WITH ORDINALITY LOOP
    qt := btrim(left(btrim(normalize(coalesce(q.value->>'text', ''), NFC)), 100));
    IF qt = '' THEN RAISE EXCEPTION 'invalid_game_package'; END IF;
    WITH src AS (
      SELECT a.ordinality AS idx, public.fam_answer_clean(a.value->>'text') AS txt,
        public._transfer_points(CASE WHEN v1 AND NOT (a.value ? 'fixed_points') THEN a.value->'points' ELSE a.value->'fixed_points' END) AS pts
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.value->'answers') = 'array' THEN q.value->'answers' ELSE '[]' END) WITH ORDINALITY AS a(value, ordinality)
    ), kept AS (
      SELECT * FROM src WHERE txt <> ''
    ), top6 AS (
      SELECT *, CASE WHEN (SELECT count(*) FROM kept) > 6
                     THEN row_number() OVER (ORDER BY pts DESC, idx)
                     ELSE row_number() OVER (ORDER BY idx) END AS pos
      FROM kept
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('text', txt, 'fixed_points', pts) ORDER BY pos), '[]')
      INTO ans FROM top6 WHERE pos <= 6;
    full_qs := full_qs || jsonb_build_array(jsonb_build_object('text', qt, 'answers', ans));
  END LOOP;

  closed_ok := wants_closed AND jsonb_array_length(full_qs) >= 10 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(full_qs) x
    WHERE jsonb_array_length(x->'answers') < 3
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(x->'answers') a WHERE (a->>'fixed_points')::int < 4)
       OR (SELECT sum((a->>'fixed_points')::int) FROM jsonb_array_elements(x->'answers') a) > 100);
  state := CASE WHEN closed_ok THEN 'closed' ELSE 'draft' END;
  with_answers := typ <> 'poll_text' OR state = 'closed';
  keep_points := typ = 'prepared' OR state = 'closed';

  SELECT coalesce(jsonb_agg(jsonb_build_object('text', x->>'text', 'answers', CASE
           WHEN NOT with_answers THEN '[]'::jsonb
           WHEN keep_points THEN x->'answers'
           ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('text', a->>'text', 'fixed_points', 0) ORDER BY i), '[]')
                 FROM jsonb_array_elements(x->'answers') WITH ORDINALITY AS t(a, i)) END) ORDER BY o), '[]')
    INTO out_qs FROM jsonb_array_elements(full_qs) WITH ORDINALITY AS s(x, o);

  nm := btrim(left(btrim(normalize(coalesce(p_payload#>>'{game,name}', ''), NFC)), 80));
  IF nm = '' THEN nm := left(coalesce(nullif(btrim(p_defaults->>'game'), ''), 'Gra'), 80); END IF;

  RETURN jsonb_build_object('format_version', 2, 'recovered', recovered, 'closed_downgraded', wants_closed AND NOT closed_ok,
    'game', jsonb_build_object('name', nm, 'type', typ, 'state', state), 'questions', out_qs);
END $$;

-- Jeden zapis pakietu: import pliku, Base Explorer, Powiel/Wyślij. Kanoniczny
-- pakiet zapisuje się wprost (bez dalszych przeróbek); zamknięta ankieta
-- dostaje status ready po zapisie treści.
CREATE OR REPLACE FUNCTION public._game_import_package(p_payload jsonb, p_owner uuid, p_request uuid, p_defaults jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp' AS $$
DECLARE receipt public.game_import_receipts; canonical jsonb; fingerprint text; gid uuid; qid uuid; q record;
BEGIN
 IF p_request IS NULL OR p_owner IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 -- Non-key update serializes imports without blocking the existing FK key-share checks.
 PERFORM 1 FROM auth.users WHERE id=p_owner AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','auth_required'); END IF;
 IF p_payload IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
 fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.game_import_receipts WHERE owner_id=p_owner AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF receipt.payload_hash IS DISTINCT FROM fingerprint THEN RETURN jsonb_build_object('ok',false,'error','request_conflict'); END IF;
  IF receipt.game_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=receipt.game_id AND owner_id=p_owner) THEN
   RETURN jsonb_build_object('ok',false,'error','previously_removed');
  END IF;
  RETURN jsonb_build_object('ok',true,'id',receipt.game_id,'already',true);
 END IF;
 canonical:=public._game_package_normalize(p_payload,p_defaults);
 INSERT INTO public.games(owner_id,name,type,status) VALUES(p_owner,canonical#>>'{game,name}',(canonical#>>'{game,type}')::public.game_type,'draft') RETURNING id INTO gid;
 FOR q IN SELECT value, ordinality FROM jsonb_array_elements(canonical->'questions') WITH ORDINALITY LOOP
  INSERT INTO public.questions(game_id,ord,text) VALUES(gid,q.ordinality,q.value->>'text') RETURNING id INTO qid;
  INSERT INTO public.answers(question_id,ord,text,fixed_points)
   SELECT qid,a.i,a.x->>'text',(a.x->>'fixed_points')::int FROM jsonb_array_elements(q.value->'answers') WITH ORDINALITY AS a(x,i);
 END LOOP;
 IF canonical#>>'{game,state}'='closed' THEN
  UPDATE public.games SET status='ready', poll_closed_at=now() WHERE id=gid;
 END IF;
 INSERT INTO public.game_import_receipts(owner_id,request_id,game_id,payload_hash) VALUES(p_owner,p_request,gid,fingerprint);
 RETURN jsonb_build_object('ok',true,'id',gid,'already',false,'type',canonical#>>'{game,type}','state',canonical#>>'{game,state}',
  'recovered',canonical->'recovered','closed_downgraded',canonical->'closed_downgraded');
END $$;

-- Import TXT w edytorze (ta sama gra): limity 100/17, czyszczenie znaków odpowiedzi.
CREATE OR REPLACE FUNCTION public.game_import_content(p_game_id uuid, p_name text, p_questions jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare
  v_type text;
  v_count int;
begin
  if jsonb_typeof(p_questions) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;

  -- RLS: cudza / nieistniejąca gra -> brak wiersza
  select g.type::text into v_type from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is not null then
    update public.games set name = left(btrim(p_name), 80) where id = p_game_id;
  end if;

  -- odpowiedzi idą kaskadą (answers_question_id_fkey ON DELETE CASCADE)
  delete from public.questions where game_id = p_game_id;

  insert into public.questions (game_id, ord, text)
  select p_game_id, s.ord, btrim(left(btrim(normalize(coalesce(s.item->>'text', ''), NFC)), 100))
  from jsonb_array_elements(p_questions) with ordinality as s(item, ord);
  get diagnostics v_count = row_count;

  -- ankieta tekstowa: same pytania
  if v_type <> 'poll_text' then
    insert into public.answers (question_id, ord, text, fixed_points)
    select q.id, row_number() over (partition by q.id order by a.ord), x.txt,
           case
             when v_type = 'poll_points' then 0
             when a.item ? 'fixed_points' then public._transfer_points(a.item->'fixed_points')
             when v_type = 'prepared' then public._transfer_points(a.item->'points')
             else 0
           end
    from jsonb_array_elements(p_questions) with ordinality as s(item, ord)
    join public.questions q on q.game_id = p_game_id and q.ord = s.ord
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.item->'answers') = 'array' then s.item->'answers' else '[]'::jsonb end
    ) with ordinality as a(item, ord)
    cross join lateral (select public.fam_answer_clean(a.item->>'text') as txt) x
    where a.ord <= 6 and x.txt <> '';
  end if;

  return jsonb_build_object('ok', true, 'questions', v_count);
end;
$$;

-- Powiel: każdy stan gry trzech typów źródłowych (otwarta/zatrzymana ankieta
-- -> szkic bez głosów w pakiecie). Kopia market i nieznane typy -- odmowa.
DO $do$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public._resource_clone_read(uuid,text,uuid)'::regprocedure);
  IF position($$root->>'status' NOT IN('draft','ready')$$ in def) = 0 THEN
    RAISE EXCEPTION '_resource_clone_read: nie znaleziono warunku statusu';
  END IF;
  def := replace(def, $$root->>'status' NOT IN('draft','ready')$$, $$root->>'status' NOT IN('draft','ready','poll_open','poll_stopped')$$);
  EXECUTE def;
END $do$;

-- Wyślij: tylko szkice (preparowana zawsze; ankieta w statusie draft).
CREATE OR REPLACE FUNCTION public._resource_clone_send_allowed(p_kind text, p_action text, p_snapshot jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_kind = 'game' AND p_action = 'send'
     AND p_snapshot#>>'{game,type}' IN ('poll_text', 'poll_points') AND p_snapshot#>>'{game,status}' <> 'draft' THEN
    RAISE EXCEPTION 'not_sendable';
  END IF;
END $$;

DO $do$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public._resource_clone_begin(uuid,uuid,text,uuid,text,uuid)'::regprocedure);
  IF position($$ snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);$$ in def) = 0 THEN
    RAISE EXCEPTION '_resource_clone_begin: nie znaleziono odczytu';
  END IF;
  def := replace(def, $$ snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);$$,
    $$ snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);
 PERFORM public._resource_clone_send_allowed(p_kind,p_action,snapshot);$$);
  EXECUTE def;

  def := pg_get_functiondef('public._resource_clone_write(uuid,uuid,text,text,uuid,uuid,jsonb,boolean)'::regprocedure);
  IF position($$ source_snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);$$ in def) = 0 THEN
    RAISE EXCEPTION '_resource_clone_write: nie znaleziono odczytu';
  END IF;
  def := replace(def, $$ source_snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);$$,
    $$ source_snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);
 PERFORM public._resource_clone_send_allowed(p_kind,p_action,source_snapshot);$$);
  EXECUTE def;
END $do$;

/* ---------- Marketplace: kopia market zostaje jako archiwalna ---------- */

-- Usunięcie pozycji Marketplace nie zamienia już kopii w edytowalną preparowaną.
DROP TRIGGER IF EXISTS trg_games_market_orphan_to_prepared ON public.games;
DROP FUNCTION IF EXISTS public.games_market_orphan_to_prepared();

-- Biblioteka: wpisy z istniejącą pozycją Marketplace oraz lokalne kopie market,
-- których źródła już nie ma (archived = true, market_game_id = null).
DROP FUNCTION IF EXISTS public.market_my_library();
CREATE FUNCTION public.market_my_library()
RETURNS TABLE(market_game_id uuid, game_id uuid, title text, lang text, author_username text,
              status public.market_game_status, added_at timestamptz, archived boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT mg.id, uml.game_id, mg.title, mg.lang, COALESCE(pr.username, ''), mg.status, uml.created_at, false
    FROM public.user_market_library uml
    JOIN public.market_games mg ON mg.id = uml.market_game_id
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE uml.user_id = auth.uid()
    UNION ALL
    SELECT NULL::uuid, g.id, g.name, NULL::text, '', NULL::public.market_game_status, g.created_at, true
    FROM public.games g
    WHERE g.owner_id = auth.uid() AND g.type = 'market'
      AND NOT EXISTS (SELECT 1 FROM public.market_games mg WHERE mg.id = g.source_market_id)
    ORDER BY 7 DESC;
$$;
REVOKE ALL ON FUNCTION public.market_my_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_my_library() TO authenticated;

-- Usunięcie archiwalnej kopii (bez pozycji Marketplace) tą samą drogą co gra.
CREATE OR REPLACE FUNCTION public.market_remove_archived_copy(p_game_id uuid) RETURNS TABLE(ok boolean, err text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_uid uuid := auth.uid();
  v_res jsonb;
begin
  if v_uid is null then return query select false, 'not_authenticated'; return; end if;
  if not exists (select 1 from public.games g where g.id = p_game_id and g.owner_id = v_uid and g.type = 'market'
                 and not exists (select 1 from public.market_games mg where mg.id = g.source_market_id)) then
    return query select false, 'not_found'; return;
  end if;
  v_res := public.delete_resource_checked('game', p_game_id);
  if not coalesce((v_res->>'ok')::boolean, false) then
    return query select false, 'locked'; return;
  end if;
  return query select true, '';
end;
$$;
REVOKE ALL ON FUNCTION public.market_remove_archived_copy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_remove_archived_copy(uuid) TO authenticated;

-- Dodanie do biblioteki: te same limity i czyszczenie co transfer (100/17,
-- znaki z czcionki, punkty 0–100, najwyżej 6 odpowiedzi).
DO $do$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.market_add_to_library(uuid)'::regprocedure);
  IF position($$left(v_q ->> 'text', 200)$$ in def) = 0 OR position($$left(v_a ->> 'text', 17),$$ in def) = 0
     OR position($$coalesce((v_a ->> 'fixed_points')::int, 0)$$ in def) = 0
     OR position($$select value from jsonb_array_elements(v_q -> 'answers')$$ in def) = 0 THEN
    RAISE EXCEPTION 'market_add_to_library: nie znaleziono zapisu treści';
  END IF;
  def := replace(def, $$left(v_q ->> 'text', 200)$$, $$btrim(left(btrim(normalize(coalesce(v_q ->> 'text', ''), NFC)), 100))$$);
  def := replace(def, $$left(v_a ->> 'text', 17),$$, $$public.fam_answer_clean(v_a ->> 'text'),$$);
  def := replace(def, $$coalesce((v_a ->> 'fixed_points')::int, 0)$$, $$public._transfer_points(v_a -> 'fixed_points')$$);
  def := replace(def, $$select value from jsonb_array_elements(v_q -> 'answers')$$,
    $$select value from jsonb_array_elements(coalesce(v_q -> 'answers', '[]'::jsonb)) with ordinality as a(value, i)
                 where public.fam_answer_clean(value ->> 'text') <> '' order by i limit 6$$);
  EXECUTE def;
END $do$;
