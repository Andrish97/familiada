-- Additive shared file/copy importer; existing editor and frontend remain compatible.
BEGIN;
-- Existing question importer retains its editor contract and also accepts .famgame points.
CREATE OR REPLACE FUNCTION "public"."game_import_content"("p_game_id" "uuid", "p_name" "text", "p_questions" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_type text;
  v_count int;
begin
  if jsonb_typeof(p_questions) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;

  -- RLS: cudza / nieistniejąca gra -> brak wiersza
  select g.type::text into v_type
  from public.games g
  where g.id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is not null then
    update public.games
       set name = left(btrim(p_name), 80)
     where id = p_game_id;
  end if;

  -- odpowiedzi idą kaskadą (answers_question_id_fkey ON DELETE CASCADE)
  delete from public.questions where game_id = p_game_id;

  insert into public.questions (game_id, ord, text)
  select p_game_id, s.ord, left(btrim(coalesce(s.item->>'text', '')), 200)
  from jsonb_array_elements(p_questions) with ordinality as s(item, ord);

  get diagnostics v_count = row_count;

  -- typowa ankieta: same pytania
  if v_type <> 'poll_text' then
    insert into public.answers (question_id, ord, text, fixed_points)
    select q.id,
           a.ord,
           left(btrim(coalesce(a.item->>'text', '')), 17),
           case
             when jsonb_typeof(a.item->'fixed_points') = 'number'
               then least(100, greatest(0, floor((a.item->>'fixed_points')::numeric)))::int
             when v_type = 'prepared' and jsonb_typeof(a.item->'points') = 'number'
               then least(100, greatest(0, floor((a.item->>'points')::numeric)))::int
             else 0
           end
    from jsonb_array_elements(p_questions) with ordinality as s(item, ord)
    join public.questions q on q.game_id = p_game_id and q.ord = s.ord
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.item->'answers') = 'array' then s.item->'answers' else '[]'::jsonb end
    ) with ordinality as a(item, ord)
    where a.ord <= 6;  -- answers_ord_range
  end if;

  return jsonb_build_object('ok', true, 'questions', v_count);
end;
$$;

CREATE TABLE public.game_import_receipts (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,request_id)
);
ALTER TABLE public.game_import_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_import_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_import_receipts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._game_package_normalize(p_payload jsonb,p_defaults jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE typ text; name text; qs jsonb:='[]'; ans jsonb; q record; a record; qt text; at text; pts numeric; rawpts text;
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'game') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_payload->'questions') IS DISTINCT FROM 'array' OR octet_length(p_payload::text)>8388608 THEN
  RAISE EXCEPTION 'invalid_game_package';
 END IF;
 typ:=CASE WHEN p_payload#>>'{game,type}' IN('prepared','poll_text','poll_points') THEN p_payload#>>'{game,type}' ELSE 'poll_text' END;
 name:=left(coalesce(nullif(trim(p_payload#>>'{game,name}'),''),nullif(p_defaults->>'game',''),'Gra'),80);
 FOR q IN SELECT value,ordinality FROM jsonb_array_elements(p_payload->'questions') WITH ORDINALITY LOOP
  qt:=left(coalesce(nullif(trim(q.value->>'text'),''),replace(coalesce(nullif(p_defaults->>'question',''),'Pytanie {ord}'),'{ord}',q.ordinality::text)),200);
  ans:='[]';
  IF typ<>'poll_text' THEN
   FOR a IN SELECT value,ordinality FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.value->'answers')='array' THEN q.value->'answers' ELSE '[]'::jsonb END) WITH ORDINALITY WHERE ordinality<=6 LOOP
    at:=left(coalesce(nullif(trim(a.value->>'text'),''),replace(coalesce(nullif(p_defaults->>'answer',''),'Odpowiedź {ord}'),'{ord}',a.ordinality::text)),17);
    rawpts:=trim(coalesce(a.value->>'fixed_points','')); pts:=0;
    IF rawpts ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' THEN
     BEGIN pts:=least(100,greatest(0,floor(rawpts::numeric))); EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN pts:=0; END;
    ELSIF jsonb_typeof(a.value->'fixed_points')='boolean' AND rawpts='true' THEN pts:=1; END IF;
    ans:=ans||jsonb_build_array(jsonb_build_object('text',at,'fixed_points',pts));
   END LOOP;
  END IF;
  qs:=qs||jsonb_build_array(jsonb_build_object('text',qt,'answers',ans));
 END LOOP;
 RETURN jsonb_build_object('game',jsonb_build_object('name',name,'type',typ),'questions',qs);
END $$;
REVOKE ALL ON FUNCTION public._game_package_normalize(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._game_import_package(p_payload jsonb,p_owner uuid,p_request uuid,p_defaults jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE receipt public.game_import_receipts; canonical jsonb; fingerprint text; gid uuid; imported jsonb;
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
 -- One content importer for the editor, file import and later received game copies.
 imported:=public.game_import_content(gid,canonical#>>'{game,name}',canonical->'questions');
 IF imported->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'game_content_import_failed'; END IF;
 INSERT INTO public.game_import_receipts(owner_id,request_id,game_id,payload_hash) VALUES(p_owner,p_request,gid,fingerprint);
 RETURN jsonb_build_object('ok',true,'id',gid,'already',false);
END $$;
REVOKE ALL ON FUNCTION public._game_import_package(jsonb,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.game_import_package(p_payload jsonb,p_owner_id uuid,p_request_id uuid,p_defaults jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_owner_id THEN RETURN jsonb_build_object('ok',false,'error','auth_required'); END IF;
 RETURN public._game_import_package(p_payload,p_owner_id,p_request_id,p_defaults);
EXCEPTION
 WHEN lock_not_available THEN RETURN jsonb_build_object('ok',false,'error','locked');
 WHEN raise_exception THEN
  IF SQLERRM='invalid_game_package' THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
  RAISE;
END $$;
REVOKE ALL ON FUNCTION public.game_import_package(jsonb,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.game_import_package(jsonb,uuid,uuid,jsonb) TO authenticated;

COMMIT;
