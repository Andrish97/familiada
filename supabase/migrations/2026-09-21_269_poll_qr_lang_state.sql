-- 269: games.poll_qr_lang -- zastępuje broadcastową synchronizację języka
-- QR-a w ankietach (POLL_QR_LANG, BroadcastChannel + Supabase Realtime)
-- prawdziwym, odpytywanym stanem, tym samym wzorcem co Control v2's
-- game_state (patrz migracja 267's game_state_set_ui_lang -- to jest
-- dokładnie ten sam problem, tylko dla ankiet zamiast Familiady).
--
-- Zgłoszone: "nowe urządzenie o którym zapomnieliśmy, żeby działało bez
-- komend jak display" -- poll-qr.html (ekran QR do głosowania, np. na
-- telewizorze) dostawał zmianę języka WYŁĄCZNIE jako żywy broadcast
-- wysyłany z polls.html w momencie zmiany -- urządzenie, które akurat
-- straciło łącze/dołączyło PO tym momencie, zostawało trwale z
-- nieaktualnym językiem aż do kolejnej zmiany. games.poll_qr_lang to
-- jedyne źródło prawdy: polls.js je zapisuje (set_poll_qr_lang), a
-- poll-qr.js samo się o nie dopytuje przez już istniejące get_poll_game
-- (patrz js/pages/poll-qr.js) zamiast czekać na komendę z zewnątrz.

ALTER TABLE "public"."games"
  ADD COLUMN "poll_qr_lang" "text";

COMMENT ON COLUMN "public"."games"."poll_qr_lang" IS 'Ostatni język operatora w polls.html, do odczytu przez poll-qr.js (get_poll_game) -- NULL dopóki operator nigdy nie zmienił języka, wtedy poll-qr zostaje przy własnym, lokalnie wykrytym języku.';

CREATE FUNCTION "public"."set_poll_qr_lang"(
    "p_game_id" "uuid",
    "p_lang" "text"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
begin
  if p_lang not in ('pl', 'en', 'uk') then
    raise exception 'invalid_lang';
  end if;

  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.games set poll_qr_lang = p_lang where id = p_game_id;
end;
$$;

COMMENT ON FUNCTION "public"."set_poll_qr_lang" IS 'Zapisuje games.poll_qr_lang -- jedyne źródło prawdy o języku QR-a w ankietach, odpytywane przez poll-qr.js zamiast dostarczane komendą/broadcastem.';

-- get_poll_game (baseline) dołącza poll_qr_lang do zwracanego `game`, żeby
-- poll-qr.js mogło je odczytać tym samym wywołaniem, którego już używa przy
-- starcie -- CREATE OR REPLACE zamiast nowego RPC, żeby uniknąć drugiego,
-- prawie identycznego zapytania tylko po nową kolumnę.
CREATE OR REPLACE FUNCTION "public"."get_poll_game"("p_game_id" "uuid", "p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g public.games;
  out jsonb;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;
  if g.share_key_poll <> p_key then raise exception 'forbidden'; end if;

  if g.type = 'poll_points' then
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status, 'poll_qr_lang', g.poll_qr_lang),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'ord', q.ord,
            'text', q.text,
            'answers', coalesce((
              select jsonb_agg(jsonb_build_object('id', a.id, 'ord', a.ord, 'text', a.text) order by a.ord)
              from public.answers a
              where a.question_id = q.id
            ), '[]'::jsonb)
          )
          order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
    ) into out;
  else
    -- poll_text: zwracamy same pytania (odpowiedzi są tekstowe i idą do poll_text_entries)
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status, 'poll_qr_lang', g.poll_qr_lang),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', q.id, 'ord', q.ord, 'text', q.text)
          order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
    ) into out;
  end if;

  return out;
end;
$$;

NOTIFY pgrst, 'reload schema';
