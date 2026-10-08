-- SZKIC E11b — NIE STOSOWAĆ (nie jest w supabase/migrations). Zmienia zachowanie
-- (nowy klucz przy uruchomieniu, kody błędów zaproszeń), więc wchodzi razem
-- z frontendem E11c–e jako migracja 31x. Przetestowany na lokalnym Postgresie
-- (docs/wdrozenia.md, „Testowa baza lokalna”).
-- Migracja 310 (SZKIC E11b): cykl ankiety — klucz na uruchomienie, przerwanie,
-- zamykanie bez blokady zaproszeń, ważność zaproszeń, limity maili.
-- Spec: docs/ankiety-refaktor.md 4a, 4b, 6.1–6.7; docs/maile-granice.md.
-- Tylko do przodu; kolumn/stanów (opened, cancelled, opened_at, ...) NIE usuwamy.
BEGIN;

-- ============================================================
-- 1. Dane: kolumna licznika przypomnień + polityki cooldownów
-- ============================================================

-- E11b: licznik przypomnień per zaproszenie (zaproszenia żyją jedno uruchomienie)
ALTER TABLE public.poll_tasks ADD COLUMN reminder_count integer NOT NULL DEFAULT 0;

-- E11b: 30 dni blokady ponownego zaproszenia do subskrypcji po jej odrzuceniu
INSERT INTO public.mail_cooldown_policies (action_key, scope, cooldown_seconds, enforce, description) VALUES
  ('poll:invite_after_reject', 'pair', 2592000, true,
   'Po odrzuceniu zaproszenia do subskrypcji — 30 dni bez nowego zaproszenia od tego nadawcy (rezerwuje polls_hub_subscription_reject, sprawdza polls_hub_subscription_invite)');

-- E11b: ponowienie zaproszenia do subskrypcji po >= 5 dniach (było 24 h)
UPDATE public.mail_cooldown_policies
   SET cooldown_seconds = 432000,
       description = 'Ponowne wysłanie zaproszenia do subskrypcji — 5 dni; najwyżej 2 maile na parę w oknie 30 dni (_poll_sub_mail_limit_until)'
 WHERE action_key = 'poll:resend';

-- E11b: opis wspólnego limitu maili ankietowych (poll:share dotyczy zaproszenia, przypomnienia i ponownego zaproszenia)
UPDATE public.mail_cooldown_policies
   SET description = 'Mail o konkretnej ankiecie (zaproszenie / przypomnienie / ponowne zaproszenie) — 24h per (owner,recipient,game); dodatkowo max 3 takie maile na dobę nadawca→odbiorca (_poll_daily_cap_until)'
 WHERE action_key = 'poll:share';

-- ============================================================
-- 2. Funkcje pomocnicze (bez dostępu z API)
-- ============================================================

-- E11b: kiedy nadawca znów może wysłać mail ankietowy do tej osoby (NULL = może).
-- Liczy z mail_queue (created_by, to_email, cooldown_action_key='poll:share', ostatnie 24 h);
-- limit 3 na dobę. Klient MUSI wysyłać maile ankietowe z cooldownActionKey 'poll:share'.
CREATE FUNCTION public._poll_daily_cap_until(p_owner uuid, p_email text)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT x.created_at + interval '24 hours'
  FROM (
    SELECT q.created_at
    FROM public.mail_queue q
    WHERE q.created_by = p_owner
      AND lower(trim(q.to_email)) = lower(trim(p_email))
      AND q.cooldown_action_key = 'poll:share'
      AND q.created_at > now() - interval '24 hours'
    ORDER BY q.created_at DESC
    OFFSET 2 LIMIT 1
  ) x
$$;
REVOKE ALL ON FUNCTION public._poll_daily_cap_until(uuid, text) FROM PUBLIC, anon, authenticated;

-- E11b: limit maili z zaproszeniem do subskrypcji: najwyżej 2 na parę (właściciel, odbiorca)
-- w oknie 30 dni (suma email_send_count wierszy pary, okno wg email_sent_at). NULL = wolno.
CREATE FUNCTION public._poll_sub_mail_limit_until(p_owner uuid, p_user uuid, p_email text)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN coalesce(sum(s.email_send_count), 0) >= 2
              THEN max(s.email_sent_at) + interval '30 days' END
  FROM public.poll_subscriptions s
  WHERE s.owner_id = p_owner
    AND ((p_user IS NOT NULL AND s.subscriber_user_id = p_user)
      OR (p_email IS NOT NULL AND lower(s.subscriber_email) = lower(p_email)))
    AND s.email_sent_at > now() - interval '30 days'
$$;
REVOKE ALL ON FUNCTION public._poll_sub_mail_limit_until(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Nowe RPC właściciela
-- ============================================================

-- E11b: Przerwij — otwarta lub zamknięta ankieta wraca do szkicu; głosy, wyniki,
-- zaproszenia i kody QR znikają; klucz ankiety się zmienia. Zwraca nowy klucz
-- (do poll_open(p_game_id, <nowy klucz>) przy „Uruchom ponownie”).
CREATE FUNCTION public.poll_abort(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text;
  v_status text;
  v_key text := public.gen_share_key(18);
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status NOT IN ('poll_open', 'ready') THEN
    RAISE EXCEPTION 'poll_not_abortable';
  END IF;

  DELETE FROM public.poll_votes WHERE game_id = p_game_id;
  DELETE FROM public.poll_text_entries WHERE game_id = p_game_id;
  DELETE FROM public.poll_sessions WHERE game_id = p_game_id;
  DELETE FROM public.poll_tasks WHERE game_id = p_game_id;
  DELETE FROM public.device_connect_codes WHERE game_id = p_game_id AND device_type = 'poll_qr';

  UPDATE public.games
     SET status = 'draft', poll_opened_at = NULL, poll_closed_at = NULL,
         share_key_poll = v_key, updated_at = now()
   WHERE id = p_game_id;

  -- jak game_reset_poll_for_edit: wyniki zerowane
  UPDATE public.answers a
     SET fixed_points = 0
    FROM public.questions q
   WHERE q.id = a.question_id AND q.game_id = p_game_id;

  RETURN jsonb_build_object('ok', true, 'share_key_poll', v_key);
END $$;

-- E11b: usunięcie udostępnienia = usunięcie zaproszenia i głosu tej osoby
CREATE FUNCTION public.poll_share_remove(p_game_id uuid, p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text := public.poll_task_voter_token(p_task_id); -- 'task:<id>'
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  IF NOT EXISTS (SELECT 1 FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id) THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;

  DELETE FROM public.poll_votes WHERE game_id = p_game_id AND voter_token = v_token;
  DELETE FROM public.poll_text_entries WHERE game_id = p_game_id AND voter_token = v_token;
  DELETE FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- E11b: Przypomnienie (dzwonek) / ponowne zaproszenie. Sprawdza w bazie: właściciel,
-- zaproszenie czeka, ankieta otwarta i klucz bieżący, reminder_count < 2, cooldown
-- poll:share (24 h na właściciel+odbiorca+gra), dobowy limit 3 maili. Kształt wyniku
-- jak polls_hub_share_poll ('mail' z task_id/to/token/link) + pola płaskie.
-- Klient wysyła mail z cooldownActionKey 'poll:share' i woła polls_hub_tasks_mark_emailed.
CREATE FUNCTION public.poll_share_remind(p_game_id uuid, p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  g record;
  t record;
  v_to text;
  v_target text;
  v_ok boolean;
  v_until timestamptz;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT id, name, status::text AS status, share_key_poll INTO g
  FROM public.games WHERE id = p_game_id FOR UPDATE;

  IF g.status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  SELECT * INTO t FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;
  IF t.status NOT IN ('pending', 'opened') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task not pending');
  END IF;
  IF t.share_key_poll <> g.share_key_poll THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task expired');
  END IF;
  IF t.reminder_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'err', 'reminder limit');
  END IF;

  v_to := lower(coalesce(t.recipient_email, (SELECT p.email FROM public.profiles p WHERE p.id = t.recipient_user_id)));
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this recipient');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(t.recipient_user_id::text, 'email:' || md5(lower(coalesce(t.recipient_email, '')))) ||
    ':game:' || p_game_id::text;

  SELECT c.ok, c.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_check('poll:share', v_target) c;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  v_until := public._poll_daily_cap_until(v_uid, v_to);
  IF v_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until, 'reason', 'daily_cap');
  END IF;

  SELECT r.ok, r.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_reserve('poll:share', v_target) r;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  UPDATE public.poll_tasks SET reminder_count = reminder_count + 1 WHERE id = t.id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', t.id, 'to', v_to, 'token', t.token, 'link', 'poll-go?t=' || t.token::text,
    'game_name', g.name, 'poll_type', t.poll_type,
    'reminder_count', t.reminder_count + 1,
    'mail', jsonb_build_array(jsonb_build_object(
      'task_id', t.id, 'to', v_to, 'token', t.token, 'link', 'poll-go?t=' || t.token::text))
  );
END $$;

REVOKE ALL ON FUNCTION public.poll_abort(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_share_remove(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poll_share_remind(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_abort(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_share_remove(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.poll_share_remind(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. Zmienione funkcje (pełne ciała z schema.sql, zmiany oznaczone „E11b”)
--    poll_open(uuid,text) – nakładka z 309 – zostaje bez zmian: woła
--    _poll_open_unchecked, które teraz rotuje klucz.
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."game_poll_close_check"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_ok constant jsonb := '{"ok": true}'::jsonb;
  g record;
  r record;
  v_poll_close jsonb;
  v_strong int;
  v_distinct int;
begin
  select id, owner_id, type::text as type, status::text as status
    into g
  from public.games
  where id = p_game_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'noGame');
  end if;

  if g.type not in ('poll_text', 'poll_points') then
    v_poll_close := jsonb_build_object('ok', false, 'code', 'preparedNoPoll');
  elsif g.status <> 'poll_open' then
    v_poll_close := jsonb_build_object('ok', false, 'code', 'closeOnlyOpen');
  -- E11b: usunięty warunek „czekające zaproszenia blokują zamknięcie” (closeWaitForTasks)
  else
    v_poll_close := c_ok;
    for r in
      select q.id, q.ord,
             (select ps.id from public.poll_sessions ps
               where ps.game_id = p_game_id and ps.question_id = q.id
               order by ps.created_at desc limit 1) as sid
      from public.questions q
      where q.game_id = p_game_id
      order by q.ord
    loop
      if r.sid is null then
        v_poll_close := jsonb_build_object('ok', false, 'code', 'noSession',
          'params', jsonb_build_object('ord', r.ord));
        exit;
      end if;

      if g.type = 'poll_points' then
        -- Głosy przeliczone na 100 pkt metodą największych reszt (jak przy
        -- zamykaniu); w pytaniu muszą być ≥ 3 odpowiedzi z ≥ 3 pkt.
        with c as (
          select v.answer_id, count(*)::int as cnt, coalesce(max(a.ord), 99) as aord
          from public.poll_votes v
          left join public.answers a on a.id = v.answer_id
          where v.poll_session_id = r.sid and v.question_id = r.id and v.answer_id is not null
          group by v.answer_id
        ),
        raw as (
          select c.aord,
                 100.0 * c.cnt / sum(c.cnt) over () as rp,
                 floor(100.0 * c.cnt / sum(c.cnt) over ())::int as fl
          from c
        ),
        d as (
          select raw.fl,
                 100 - sum(raw.fl) over () as diff,
                 row_number() over (order by raw.rp - raw.fl desc, raw.aord) as rn
          from raw
        )
        select count(*)::int into v_strong
        from d
        where d.fl + (case when d.rn <= d.diff then 1 else 0 end) >= 3;

        if coalesce(v_strong, 0) < 3 then
          v_poll_close := jsonb_build_object('ok', false, 'code', 'closeMinPoints',
            'params', jsonb_build_object('ord', r.ord));
          exit;
        end if;
      else
        select count(distinct nullif(btrim(e.answer_norm), ''))::int into v_distinct
        from public.poll_text_entries e
        where e.poll_session_id = r.sid and e.question_id = r.id;

        if coalesce(v_distinct, 0) < 3 then
          v_poll_close := jsonb_build_object('ok', false, 'code', 'closeMinText',
            'params', jsonb_build_object('ord', r.ord));
          exit;
        end if;
      end if;
    end loop;
  end if;

  return v_poll_close;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."_poll_open_unchecked"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_type public.game_type;
begin
  -- weryfikacja klucza + pobranie typu gry
  select g.type into v_type
  from public.games g
  where g.id = p_game_id
    and g.share_key_poll = p_key;

  if not found then
    raise exception 'Bad poll key or game not found';
  end if;

  if v_type = 'prepared' then
    raise exception 'Prepared game has no poll';
  end if;

  -- status = poll_open (UWAGA: nie dotykamy games.type!)
  update public.games
  set status = 'poll_open',
      share_key_poll = public.gen_share_key(18), -- E11b: nowy klucz przy każdym uruchomieniu (stare linki/QR/zaproszenia wygasają)
      poll_opened_at = now(),
      poll_closed_at = null,
      updated_at = now()
  where id = p_game_id;

  -- restart sesji: usuń stare dane ankietowe
  delete from public.poll_votes where game_id = p_game_id;
  delete from public.poll_text_entries where game_id = p_game_id;
  delete from public.poll_sessions where game_id = p_game_id;
  -- E11b: zaproszenia poprzedniego uruchomienia znikają (nowe uruchomienie = nowe udostępnienie)
  delete from public.poll_tasks where game_id = p_game_id;
  -- E11b: kody QR ankiety z poprzedniego uruchomienia przestają działać
  delete from public.device_connect_codes where game_id = p_game_id and device_type = 'poll_qr';

  -- utwórz sesję per pytanie
  insert into public.poll_sessions (game_id, question_id, question_ord, is_open, created_at, closed_at)
  select q.game_id, q.id, q.ord, true, now(), null
  from public.questions q
  where q.game_id = p_game_id;

end $$;


--
-- Name: poll_points_close_and_normalize("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."_poll_points_close_unchecked"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g record;
begin
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id and share_key_poll = p_key;

  if not found then raise exception 'bad key or game'; end if;
  if g.type <> 'poll_points' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll is not open'; end if;

  -- policz głosy z ostatniej sesji per pytanie i ustaw fixed_points w answers
  with last_sess as (
    select distinct on (ps.question_id)
      ps.question_id, ps.id as poll_session_id
    from public.poll_sessions ps
    where ps.game_id = p_game_id
    order by ps.question_id, ps.created_at desc
  ),
  a as (
    select q.id as question_id, an.id as answer_id, an.ord as aord
    from public.questions q
    join public.answers an on an.question_id = q.id
    where q.game_id = p_game_id
  ),
  c as (
    select
      a.question_id,
      a.answer_id,
      a.aord,
      coalesce(count(v.id), 0)::int as cnt
    from a
    left join last_sess ls on ls.question_id = a.question_id
    left join public.poll_votes v
      on v.poll_session_id = ls.poll_session_id
     and v.answer_id = a.answer_id
    group by a.question_id, a.answer_id, a.aord
  ),
  c_fixed as (
    select question_id, answer_id, aord,
      case when cnt = 0 then 1 else cnt end as cnt1
    from c
  ),
  tot as (
    select question_id, sum(cnt1)::int as total
    from c_fixed
    group by question_id
  ),
  raw as (
    select
      cf.question_id,
      cf.answer_id,
      cf.aord,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) as raw_p,
      floor(100.0 * cf.cnt1 / nullif(t.total, 0))::int as base_floor,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) - floor(100.0 * cf.cnt1 / nullif(t.total, 0)) as frac
    from c_fixed cf
    join tot t on t.question_id = cf.question_id
  ),
  base as (
    select question_id, answer_id, aord,
      greatest(1, base_floor) as p0,
      frac
    from raw
  ),
  sum_base as (
    select question_id, sum(p0)::int as s0
    from base
    group by question_id
  ),
  need as (
    select b.*, (100 - sb.s0)::int as diff
    from base b
    join sum_base sb on sb.question_id = b.question_id
  ),
  ranked_plus as (
    select n.*,
      row_number() over (partition by question_id order by frac desc, aord asc) as rn_plus
    from need n
  ),
  ranked_minus as (
    select n.*,
      row_number() over (partition by question_id order by p0 desc, frac asc, aord desc) as rn_minus
    from need n
    where p0 > 1
  ),
  final as (
    select
      n.question_id,
      n.answer_id,
      case
        when n.diff > 0 then n.p0 + case when rp.rn_plus <= n.diff then 1 else 0 end
        when n.diff < 0 then n.p0 - case when rm.rn_minus is not null and rm.rn_minus <= abs(n.diff) then 1 else 0 end
        else n.p0
      end as p_final
    from need n
    left join ranked_plus rp on rp.question_id = n.question_id and rp.answer_id = n.answer_id
    left join ranked_minus rm on rm.question_id = n.question_id and rm.answer_id = n.answer_id
  )
  update public.answers aup
  set fixed_points = f.p_final
  from final f
  where aup.id = f.answer_id;

  update public.poll_sessions
  set is_open = false, closed_at = now()
  where game_id = p_game_id and is_open = true;

  -- E11b: po zamknięciu kod QR ankiety przestaje działać
  delete from public.device_connect_codes where game_id = p_game_id and device_type = 'poll_qr';

  update public.games
  set status = 'ready', poll_closed_at = now()
  where id = p_game_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."_poll_text_close_unchecked"("p_game_id" "uuid", "p_key" "text", "p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
declare
  g record;
  q record;
  item jsonb;
  ans jsonb;
  i int;
  atext text;
  apts int;
begin
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id and share_key_poll = p_key;

  if not found then raise exception 'bad key or game'; end if;
  if g.type <> 'poll_text' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll is not open'; end if;

  -- payload format:
  -- { "items": [ { "question_id": "...", "answers": [ { "text":"...", "points": 12 }, ... ] } ] }

  for item in
    select jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
  loop
    -- wyciągamy question_id
    for q in
      select q2.*
      from public.questions q2
      where q2.id = (item->>'question_id')::uuid
        and q2.game_id = p_game_id
    loop
      -- czyścimy stare answers (jeśli były)
      delete from public.answers where question_id = q.id;

      i := 0;
      for ans in
        select jsonb_array_elements(coalesce(item->'answers','[]'::jsonb))
      loop
        i := i + 1;
        exit when i > 6;

        atext := coalesce(ans->>'text','');
        atext := regexp_replace(atext, '^\s+|\s+$', '', 'g');
        if char_length(atext) < 1 then
          atext := ('ODP '||i::text);
        end if;
        if char_length(atext) > 17 then
          atext := left(atext,17);
        end if;

        apts := coalesce((ans->>'points')::int, 0);
        if apts < 0 then apts := 0; end if;
        if apts > 100 then apts := 100; end if;

        insert into public.answers(question_id, ord, text, fixed_points)
        values (q.id, i, atext, apts);
      end loop;
    end loop;
  end loop;

  update public.poll_sessions
  set is_open = false, closed_at = now()
  where game_id = p_game_id and is_open = true;

  -- E11b: po zamknięciu kod QR ankiety przestaje działać
  delete from public.device_connect_codes where game_id = p_game_id and device_type = 'poll_qr';

  update public.games
  set status = 'ready', poll_closed_at = now()
  where id = p_game_id;
end;
$_$;


CREATE OR REPLACE FUNCTION "public"."poll_go_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s record;
  t record;
  u record;
BEGIN
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token LIMIT 1;

  IF found THEN
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
    IF t.status IN ('pending', 'opened') THEN
      IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
         OR t.game_status NOT IN ('poll_open', 'ready') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'expired');
      ELSIF t.game_status = 'ready' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
      END IF;
    END IF;
    -- E11b: tylko znacznik czasu, bez stanu pośredniego 'opened'
    IF t.opened_at IS NULL THEN
      UPDATE public.poll_tasks SET opened_at = now() WHERE id = t.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'task',
      'task_id', t.id, 'status', t.status,
      'owner_id', t.owner_id, 'owner_label', t.owner_label,
      'recipient_user_id', t.recipient_user_id,
      'recipient_email', t.recipient_email,
      'game_id', t.game_id, 'game_name', t.game_name,
      'poll_type', t.poll_type, 'share_key_poll', t.share_key_poll
    );
  END IF;

  -- 3) global unsub token?
  SELECT email, suppressed_at INTO u
  FROM public.email_unsub_tokens
  WHERE token = p_token LIMIT 1;

  IF found THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'unsub',
      'already_suppressed', (u.suppressed_at IS NOT NULL)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
END;
$$;


CREATE OR REPLACE FUNCTION "public"."poll_task_resolve"("p_token" "uuid", "p_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  t record;
  u uuid;
  requires_auth boolean := false;
  needs_email boolean := false;
BEGIN
  u := auth.uid();

  SELECT
    pt.id,
    pt.owner_id,
    pt.recipient_user_id,
    pt.recipient_email,
    pt.game_id,
    pt.poll_type,
    pt.share_key_poll,
    pt.status,
    pt.opened_at,
    pt.done_at,
    pt.declined_at,
    pt.cancelled_at,
    g.status::text AS game_status, -- E11b
    g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  WHERE pt.token = p_token
  LIMIT 1;

  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- niedostępne u odbiorcy (declined/cancelled), oraz po wykonaniu
  IF t.status IN ('declined','cancelled') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_unavailable_token');
  END IF;

  IF t.status = 'done' OR t.done_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_done');
  END IF;

  -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
  IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
     OR t.game_status NOT IN ('poll_open', 'ready') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF t.game_status = 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
  END IF;

  -- jeżeli task jest przypisany do user_id: wymagamy zgodności sesji
  IF t.recipient_user_id IS NOT NULL THEN
    IF u IS NULL THEN
      requires_auth := true;
    ELSIF u <> t.recipient_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_unavailable_token');
    END IF;
  END IF;

  -- jeżeli task jest e-mailowy: e-mail może być potrzebny do późniejszego UI/komunikatu
  IF t.recipient_user_id IS NULL AND t.recipient_email IS NULL THEN
    -- przypadek "czysty e-mail": oczekujemy podania e-mail w UI
    IF p_email IS NULL OR btrim(p_email) = '' THEN
      needs_email := true;
    END IF;
  END IF;

  -- mark opened (pierwsze wejście)
  IF t.opened_at IS NULL THEN
    UPDATE public.poll_tasks
      SET opened_at = now() -- E11b: bez stanu pośredniego 'opened'
      WHERE id = t.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'kind', 'task',
    'task_id', t.id,
    'game_id', t.game_id,
    'poll_type', t.poll_type,
    'key', t.share_key_poll,
    'voter_token', public.poll_task_voter_token(t.id),
    'requires_auth', requires_auth,
    'needs_email', needs_email,
    'recipient_email', COALESCE(t.recipient_email, NULLIF(btrim(p_email), ''))
  );
END;
$$;


CREATE OR REPLACE FUNCTION "public"."polls_hub_share_poll"("p_game_id" "uuid", "p_sub_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poll_type text;
  v_status text; -- E11b
  v_share_key text;
  v_created int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
  v_blocked int := 0;
  v_blocked_sub_ids jsonb := '[]'::jsonb;
  v_mail jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT g.type::text, g.share_key_poll, g.status::text INTO v_poll_type, v_share_key, v_status
  FROM public.games g WHERE g.id = p_game_id AND g.owner_id = v_uid LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'game not found');
  END IF;
  IF v_poll_type NOT IN ('poll_text', 'poll_points') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not a poll game');
  END IF;
  -- E11b: udostępniać można tylko otwartą ankietę (sprawdzane w bazie)
  IF v_status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  -- E11b: wycofanie zaproszenia = usunięcie wiersza (bez stanu 'cancelled'); czekające nie mają głosów
  DELETE FROM public.poll_tasks t
  WHERE t.owner_id = v_uid AND t.game_id = p_game_id AND t.status IN ('pending', 'opened')
    AND (
      (t.recipient_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.poll_subscriptions s
        WHERE s.id = ANY(coalesce(p_sub_ids, array[]::uuid[])) AND s.owner_id = v_uid
          AND s.status = 'active' AND s.subscriber_user_id = t.recipient_user_id
      ))
      OR (t.recipient_user_id IS NULL AND t.recipient_email IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.poll_subscriptions s
        WHERE s.id = ANY(coalesce(p_sub_ids, array[]::uuid[])) AND s.owner_id = v_uid
          AND s.status = 'active' AND s.subscriber_email IS NOT NULL
          AND lower(s.subscriber_email) = lower(t.recipient_email)
      ))
    );
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  WITH sel AS (
    SELECT
      s.id AS sub_id,
      s.subscriber_user_id,
      lower(s.subscriber_email) AS subscriber_email,
      lower(coalesce(s.subscriber_email, p.email)) AS resolved_email,
      'pair:' || v_uid::text || ':' ||
        coalesce(s.subscriber_user_id::text, 'email:' || md5(lower(coalesce(s.subscriber_email, '')))) ||
        ':game:' || p_game_id::text AS cooldown_target
    FROM public.poll_subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.subscriber_user_id
    WHERE s.owner_id = v_uid AND s.status = 'active' AND s.id = ANY(coalesce(p_sub_ids, array[]::uuid[]))
  ),
  cooldown AS (
    -- E11b: blokada = cooldown poll:share (24 h na parę+grę) LUB dobowy limit 3 maili ankietowych nadawca→odbiorca
    SELECT u.sub_id, max(u.next_allowed_at) AS next_allowed_at
    FROM (
      SELECT sel.sub_id, mc.next_allowed_at
      FROM sel
      JOIN public.mail_cooldowns mc ON mc.action_key = 'poll:share' AND mc.target_key = sel.cooldown_target
      WHERE mc.next_allowed_at > now()
      UNION ALL
      SELECT sel.sub_id, public._poll_daily_cap_until(v_uid, sel.resolved_email)
      FROM sel
      WHERE sel.resolved_email IS NOT NULL
        AND public._poll_daily_cap_until(v_uid, sel.resolved_email) IS NOT NULL
    ) u
    GROUP BY u.sub_id
  ),
  existing AS (
    SELECT sel.sub_id, t.id AS task_id
    FROM sel
    LEFT JOIN public.poll_tasks t
      ON t.owner_id = v_uid AND t.game_id = p_game_id AND t.status IN ('pending', 'opened', 'done', 'declined') /* E11b: odrzucone = nic więcej w tym uruchomieniu */
     AND ((sel.subscriber_user_id IS NOT NULL AND t.recipient_user_id = sel.subscriber_user_id)
       OR (sel.subscriber_user_id IS NULL AND sel.subscriber_email IS NOT NULL AND lower(t.recipient_email) = sel.subscriber_email))
  ),
  to_insert AS (
    SELECT sel.* FROM sel
    JOIN existing ex ON ex.sub_id = sel.sub_id
    LEFT JOIN cooldown cd ON cd.sub_id = sel.sub_id
    WHERE ex.task_id IS NULL AND cd.sub_id IS NULL
  ),
  ins AS (
    INSERT INTO public.poll_tasks(owner_id, recipient_user_id, recipient_email, game_id, poll_type, share_key_poll, token, status, created_at)
    SELECT
      v_uid, e.subscriber_user_id,
      CASE WHEN e.subscriber_user_id IS NOT NULL THEN NULL ELSE e.resolved_email END,
      p_game_id, v_poll_type, v_share_key, gen_random_uuid(), 'pending', now()
    FROM to_insert e
    RETURNING id, recipient_user_id, recipient_email, token
  ),
  reserved AS (
    -- Rezerwacja cooldownu TYLKO dla wierszy, które faktycznie przeszły
    -- przez `ins` (czyli naprawdę zostały wstawione) -- nie wcześniej,
    -- żeby nie konsumować cooldownu dla zablokowanych/już-istniejących.
    SELECT r.id, pc.ok
    FROM ins r
    CROSS JOIN LATERAL public.mail_cooldown_reserve(
      'poll:share',
      'pair:' || v_uid::text || ':' ||
        coalesce(r.recipient_user_id::text, 'email:' || md5(lower(coalesce(r.recipient_email, '')))) ||
        ':game:' || p_game_id::text
    ) pc
  ),
  mail_rows AS (
    SELECT i.id, coalesce(lower(i.recipient_email), lower(p.email)) AS to_email, i.token
    FROM ins i
    JOIN reserved rv ON rv.id = i.id AND rv.ok
    LEFT JOIN public.profiles p ON p.id = i.recipient_user_id
  )
  SELECT
    (SELECT count(*) FROM ins)::int,
    (SELECT count(*) FROM cooldown)::int,
    coalesce((SELECT jsonb_agg(jsonb_build_object('sub_id', c.sub_id, 'cooldown_until', c.next_allowed_at)) FROM cooldown c), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('task_id', id, 'to', to_email, 'token', token, 'link', ('poll-go?t=' || token::text)))
      FILTER (WHERE public._norm_email(to_email) IS NOT NULL), '[]'::jsonb)
  INTO v_created, v_blocked, v_blocked_sub_ids, v_mail
  FROM mail_rows;

  v_kept := greatest(coalesce(array_length(p_sub_ids, 1), 0) - v_created, 0);

  RETURN jsonb_build_object(
    'ok', true, 'created', v_created, 'cancelled', v_cancelled, 'kept', v_kept,
    'blocked', v_blocked, 'blocked_sub_ids', v_blocked_sub_ids, 'mail', v_mail
  );
END;
$$;


CREATE OR REPLACE FUNCTION "public"."polls_hub_subscriber_remove"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sub public.poll_subscriptions%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  select * into v_sub
  from public.poll_subscriptions
  where id = p_id
    and owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found');
  end if;

  -- ✅ zamiast DELETE: oznacz jako cancelled i ustaw timestamp
  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id;

  -- E11b: usunięcie subskrybenta wycofuje jego czekające zaproszenia do ankiet tego właściciela
  delete from public.poll_tasks pt
  where pt.owner_id = v_uid
    and pt.status in ('pending', 'opened')
    and ((v_sub.subscriber_user_id is not null and pt.recipient_user_id = v_sub.subscriber_user_id)
      or (v_sub.subscriber_email is not null and lower(pt.recipient_email) = lower(v_sub.subscriber_email)));

  return jsonb_build_object('ok', true);
end;
$$;


CREATE OR REPLACE FUNCTION "public"."polls_hub_subscription_cancel"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid();
  v_owner uuid; -- E11b
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth required'); end if;

  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id
    and subscriber_user_id = v_uid
    and status in ('active','pending')
  returning owner_id into v_owner; -- E11b

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found or not active/pending');
  end if;

  -- E11b: wypisanie się wycofuje czekające zaproszenia do ankiet tego nadawcy
  delete from public.poll_tasks pt
  where pt.owner_id = v_owner and pt.recipient_user_id = v_uid and pt.status in ('pending', 'opened');

  return jsonb_build_object('ok', true, 'action', 'cancelled', 'id', p_id);
end;
$$;


CREATE OR REPLACE FUNCTION "public"."polls_hub_subscription_reject"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid();
  v_owner uuid; -- E11b
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth required'); end if;

  update public.poll_subscriptions
  set status = 'declined',
      declined_at = now()
  where id = p_id
    and subscriber_user_id = v_uid
    and status = 'pending'
  returning owner_id into v_owner; -- E11b

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found or not pending');
  end if;

  -- E11b: odrzucenie wycofuje czekające zaproszenia do ankiet tego nadawcy
  delete from public.poll_tasks pt
  where pt.owner_id = v_owner and pt.recipient_user_id = v_uid and pt.status in ('pending', 'opened');

  -- E11b: blokada ponownego zaproszenia do subskrypcji na 30 dni (egzekwuje polls_hub_subscription_invite)
  PERFORM public.mail_cooldown_reserve('poll:invite_after_reject', 'pair:' || v_owner::text || ':' || v_uid::text);

  return jsonb_build_object('ok', true, 'action', 'declined', 'id', p_id);
end;
$$;


CREATE OR REPLACE FUNCTION "public"."polls_hub_subscription_invite"("p_recipient" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_rec      text := lower(trim(coalesce(p_recipient, '')));
  v_user_id  uuid;
  v_email    text;
  v_id       uuid;
  v_token    uuid;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_lim_until timestamptz; -- E11b
BEGIN
  IF v_rec = '' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'empty recipient');
  END IF;

  SELECT id, email INTO v_user_id, v_email FROM public.profiles WHERE lower(username) = v_rec LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT id, email INTO v_user_id, v_email FROM public.profiles WHERE lower(email) = v_rec LIMIT 1;
  END IF;
  IF v_email IS NULL THEN
    v_email := v_rec;
  END IF;

  SELECT ps.id, ps.token INTO v_id, v_token
  FROM public.poll_subscriptions ps
  WHERE ps.owner_id = auth.uid()
    AND ((v_user_id IS NOT NULL AND ps.subscriber_user_id = v_user_id)
      OR (ps.subscriber_email IS NOT NULL AND lower(ps.subscriber_email) = v_email))
    AND ps.status IN ('pending', 'active')
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'id', v_id, 'token', v_token,
      'channel', CASE WHEN v_user_id IS NOT NULL THEN 'onsite' ELSE 'email' END
    );
  END IF;

  v_target := 'pair:' || auth.uid()::text || ':' || coalesce(v_user_id::text, 'email:' || md5(v_email));
  -- E11b: po odrzuceniu zaproszenia przez odbiorcę — 30 dni bez nowego zaproszenia
  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('poll:invite_after_reject', v_target);
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until, 'reason', 'after_reject');
  END IF;

  -- E11b: najwyżej 2 maile z zaproszeniem do subskrypcji na parę (okno 30 dni)
  v_lim_until := public._poll_sub_mail_limit_until(auth.uid(), v_user_id, v_email);
  IF v_lim_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim_until, 'reason', 'mail_limit');
  END IF;

  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('poll:invite', v_target);
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  INSERT INTO public.poll_subscriptions (owner_id, subscriber_user_id, subscriber_email, status)
  VALUES (auth.uid(), v_user_id, CASE WHEN v_user_id IS NULL THEN v_email ELSE NULL END, 'pending')
  RETURNING id, token INTO v_id, v_token;

  PERFORM public.mail_cooldown_reserve('poll:invite', v_target);

  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'id', v_id, 'token', v_token,
    'channel', CASE WHEN v_user_id IS NOT NULL THEN 'onsite' ELSE 'email' END,
    'email', CASE WHEN v_user_id IS NULL THEN v_email ELSE NULL END
  );
END;
$$;


CREATE OR REPLACE FUNCTION "public"."polls_hub_subscriber_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_sub         public.poll_subscriptions%rowtype;
  v_to          text;
  v_link        text;
  v_target      text;
  v_cd_ok       boolean;
  v_cd_until    timestamptz;
  v_unsub_token uuid;
  v_lim_until   timestamptz; -- E11b
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  SELECT * INTO v_sub
  FROM public.poll_subscriptions
  WHERE id = p_id AND owner_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not found');
  END IF;

  IF v_sub.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'only pending can be resent');
  END IF;

  -- E11b: najwyżej 2 maile z zaproszeniem do subskrypcji na parę (okno 30 dni; pierwszy mail też idzie tą drogą)
  v_lim_until := public._poll_sub_mail_limit_until(v_uid, v_sub.subscriber_user_id, v_sub.subscriber_email);
  IF v_lim_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim_until, 'reason', 'mail_limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(v_sub.subscriber_user_id::text, 'email:' || md5(lower(coalesce(v_sub.subscriber_email, ''))));
  SELECT ok, next_allowed_at INTO v_cd_ok, v_cd_until FROM public.mail_cooldown_check('poll:resend', v_target);
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  IF v_sub.subscriber_email IS NOT NULL THEN
    v_to := lower(v_sub.subscriber_email);
  ELSIF v_sub.subscriber_user_id IS NOT NULL THEN
    SELECT lower(p.email) INTO v_to FROM public.profiles p WHERE p.id = v_sub.subscriber_user_id LIMIT 1;
  END IF;

  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this subscriber');
  END IF;

  v_link := ('poll-go?s=' || v_sub.token::text)::text;

  UPDATE public.poll_subscriptions
  SET email_sent_at = now(), email_send_count = email_send_count + 1
  WHERE id = p_id;

  PERFORM public.mail_cooldown_reserve('poll:resend', v_target);

  IF v_sub.subscriber_email IS NOT NULL THEN
    v_unsub_token := public._ensure_unsub_token(v_to);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'to', v_to,
    'kind', 'sub_invite',
    'link', v_link,
    'token', v_sub.token,
    'registered', (v_sub.subscriber_user_id IS NOT NULL),
    'unsub_token', v_unsub_token
  );
END;
$$;


COMMIT;

-- ============================================================
-- PODSUMOWANIE (komentarz)
-- Zmienione funkcje (CREATE OR REPLACE, ciała ze schema.sql):
--   game_poll_close_check (bez warunku czekających zaproszeń; guard_game_poll_close bez zmian),
--   _poll_open_unchecked (nowy klucz, kasuje poll_tasks i kody poll_qr),
--   _poll_points_close_unchecked, _poll_text_close_unchecked (kasują kody poll_qr),
--   poll_go_resolve, poll_task_resolve (expired / poll_closed, bez stanu 'opened'),
--   polls_hub_share_poll (status poll_open, DELETE zamiast 'cancelled', 'declined' blokuje, dzienny limit),
--   polls_hub_subscriber_remove, polls_hub_subscription_cancel, polls_hub_subscription_reject
--     (kasują czekające zaproszenia), reject rezerwuje poll:invite_after_reject,
--   polls_hub_subscription_invite (30 dni po odrzuceniu + limit 2 maili),
--   polls_hub_subscriber_resend (limit 2 maili / 30 dni; poll:resend 5 dni).
-- Nowe obiekty: poll_tasks.reminder_count; polityka poll:invite_after_reject;
--   poll_abort, poll_share_remove, poll_share_remind; _poll_daily_cap_until,
--   _poll_sub_mail_limit_until. Zmienione dane: poll:resend 86400->432000 s, opisy poll:share.
-- Założenia: schema.sql odzwierciedla stan po 308; poll_open(uuid,text) zostaje void
--   (strona czyta nowy games.share_key_poll po wywołaniu; poll_abort zwraca nowy klucz);
--   wszystkie maile ankietowe idą do mail_queue z cooldown_action_key='poll:share'
--   (limit dobowy liczony z mail_queue po created_by + lower(to_email));
--   „maile subskrypcji” liczone przez email_send_count (pierwszy mail też przez resend).
-- NIE zrobione / do decyzji:
--   - limit dobowy ma wyścig: wiersz w mail_queue pojawia się dopiero po powrocie z RPC;
--     twarde domknięcie wymagałoby zmiany triggera mail_queue_cooldown_guard (nie ruszane);
--   - „bez odpowiedzi po 2 mailach zaproszenie wygasa” (auto-wygaszanie pending) — brak joba;
--     zrealizowane tylko jako blokada kolejnych maili 30 dni;
--   - wypisanie przez token/e-mail (poll-go, unsub) nie kasuje zaproszeń — inne RPC, nie ruszane;
--   - odrzucenie subskrypcji przez e-mail-only nie rezerwuje 30 dni (reject działa tylko po user_id);
--   - polls_hub_task_decline (po stronie odbiorcy) bez zmian; poll_task_opened, polls_hub_can_close*
--     nadal istnieją (usunięcie w późniejszej migracji);
--   - poll_open z 'poll_open'/'draft' nadal działa jak dawniej (bez sprawdzania statusu);
--     poll_open z 'ready' NIE zeruje answers.fixed_points — robi to poll_abort (strona: abort, potem open);
--   - polls_hub_subscription_invite_a (nieużywane) nie zmieniane.
