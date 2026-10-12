-- Bind poll invitations to the canonical account identity before its email changes.
-- Guests retain email invitations; deleting an account uses the348 cascade.
BEGIN;
DO $$ BEGIN
 FOR attempt IN 1..100 LOOP
  BEGIN
   LOCK auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.profiles IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_tasks IN ACCESS EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=100 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.1);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._poll_identity_regular(p_uid uuid,p_identity jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id=p_uid),
   coalesce(p_identity->>'is_anonymous','false')='true' OR coalesce(p_identity->'raw_user_meta_data'->>'is_guest','false')='true');
$$;
CREATE OR REPLACE FUNCTION public._poll_identity_refs(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=ANY(coalesce(p_ids,'{}'::uuid[])) ORDER BY id FOR KEY SHARE;
 IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Not your task'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public._poll_registered_uid(p_email text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ids uuid[];
BEGIN
 SELECT array_agg(u.id ORDER BY u.id) INTO ids FROM auth.users u
 WHERE public._norm_email(u.email)=public._norm_email(p_email) AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF coalesce(cardinality(ids),0)>1 THEN RAISE EXCEPTION 'Ambiguous task recipient'; END IF;
 RETURN ids[1];
END $$;
CREATE OR REPLACE FUNCTION public._poll_identity_mail_locks(p_emails text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e text;
BEGIN
 FOR e IN SELECT DISTINCT public._norm_email(x) FROM unnest(coalesce(p_emails,'{}'::text[])) x WHERE public._norm_email(x) IS NOT NULL ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('poll-email-identity:'||e,351));
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public._poll_identity_email_refs(p_emails text[],p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE before_ids uuid[]; after_ids uuid[];
BEGIN
 FOR attempt IN 1..100 LOOP
  BEGIN
   SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO before_ids FROM (SELECT public._poll_registered_uid(x) AS id FROM unnest(coalesce(p_emails,'{}'::text[])) x) r WHERE id IS NOT NULL;
   PERFORM public._poll_identity_refs(coalesce(p_ids,'{}'::uuid[])||before_ids);
   PERFORM public._poll_identity_mail_locks(p_emails);
   SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO after_ids FROM (SELECT public._poll_registered_uid(x) AS id FROM unnest(coalesce(p_emails,'{}'::text[])) x) r WHERE id IS NOT NULL;
   IF before_ids IS DISTINCT FROM after_ids THEN RAISE EXCEPTION 'identity changed while acquiring email locks' USING ERRCODE='55P03'; END IF;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=100 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public._poll_bind_identity(p_uid uuid,p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record;
BEGIN
 IF public._norm_email(p_email) IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id<>p_uid AND public._norm_email(email)=public._norm_email(p_email)) THEN RETURN; END IF;
 FOR r IN SELECT id FROM public.poll_tasks WHERE recipient_user_id IS NULL
  AND public._norm_email(recipient_email)=public._norm_email(p_email) ORDER BY game_id,id FOR UPDATE LOOP
  UPDATE public.poll_tasks SET recipient_user_id=p_uid,recipient_email=NULL WHERE id=r.id AND recipient_user_id IS NULL;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public._poll_identity_auth_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.email IS DISTINCT FROM OLD.email AND EXISTS(SELECT 1 FROM auth.users WHERE id<>NEW.id AND public._norm_email(email)=public._norm_email(NEW.email)) THEN RAISE EXCEPTION 'Email already registered' USING ERRCODE='23505'; END IF;
 IF TG_OP='DELETE' THEN PERFORM public._poll_identity_mail_locks(ARRAY[OLD.email]);
 ELSIF TG_OP='INSERT' THEN PERFORM public._poll_identity_mail_locks(ARRAY[NEW.email]);
 ELSE PERFORM public._poll_identity_mail_locks(ARRAY[OLD.email,NEW.email]); END IF;
 IF TG_OP IN('UPDATE','DELETE') AND public._poll_identity_regular(OLD.id,to_jsonb(OLD)) THEN
  PERFORM public._poll_bind_identity(OLD.id,OLD.email);
 END IF;
 IF TG_OP IN('UPDATE','INSERT') AND public._poll_identity_regular(NEW.id,to_jsonb(NEW)) THEN
  PERFORM public._poll_bind_identity(NEW.id,NEW.email);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public._poll_identity_profile_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ident jsonb;
BEGIN
 IF NEW.is_guest THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email AND NEW.is_guest IS NOT DISTINCT FROM OLD.is_guest THEN RETURN NEW; END IF;
 -- Take the auth lock before binding tasks; conversion may update auth later.
 SELECT to_jsonb(u) INTO ident FROM auth.users u WHERE u.id=NEW.id FOR UPDATE;
 IF FOUND AND public._norm_email(ident->>'email')=public._norm_email(NEW.email)
  AND public._poll_identity_regular(NEW.id,ident) THEN
  PERFORM public._poll_identity_mail_locks(ARRAY[NEW.email]);
  PERFORM public._poll_bind_identity(NEW.id,NEW.email);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public._poll_identity_task_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid;
BEGIN
 PERFORM public._poll_identity_email_refs(ARRAY[NEW.recipient_email],ARRAY[NEW.owner_id,NEW.recipient_user_id,auth.uid()]);
 IF NEW.recipient_user_id IS NULL AND NEW.recipient_email IS NOT NULL THEN
  uid:=public._poll_registered_uid(NEW.recipient_email);
  IF uid IS NOT NULL THEN
   NEW.recipient_user_id:=uid; NEW.recipient_email:=NULL;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._poll_identity_regular(uuid,jsonb),public._poll_identity_refs(uuid[]),public._poll_registered_uid(text),public._poll_bind_identity(uuid,text),public._poll_identity_auth_trigger(),public._poll_identity_profile_trigger(),public._poll_identity_task_insert(),public._poll_identity_mail_locks(text[]),public._poll_identity_email_refs(text[],uuid[]) FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS poll_identity_auth_insert ON auth.users;
CREATE TRIGGER poll_identity_auth_insert AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public._poll_identity_auth_trigger();
DROP TRIGGER IF EXISTS poll_identity_auth_change ON auth.users;
CREATE TRIGGER poll_identity_auth_change BEFORE UPDATE OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public._poll_identity_auth_trigger();
DROP TRIGGER IF EXISTS poll_identity_profile ON public.profiles;
CREATE TRIGGER poll_identity_profile AFTER INSERT OR UPDATE OF email,is_guest ON public.profiles FOR EACH ROW EXECUTE FUNCTION public._poll_identity_profile_trigger();
DROP TRIGGER IF EXISTS poll_identity_task_insert ON public.poll_tasks;
CREATE TRIGGER poll_identity_task_insert BEFORE INSERT ON public.poll_tasks FOR EACH ROW EXECUTE FUNCTION public._poll_identity_task_insert();


CREATE OR REPLACE FUNCTION "public"."_poll_assert_voter"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE g public.games%rowtype; t public.poll_tasks%rowtype; task_id uuid; registered uuid;
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[auth.uid()]);
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
 IF g.share_key_poll IS NULL OR g.share_key_poll IS DISTINCT FROM p_key THEN RAISE EXCEPTION 'Invalid poll key'; END IF;
 IF g.status::text<>'poll_open' THEN RAISE EXCEPTION 'Poll is not open'; END IF;
 IF p_voter_token IS NULL OR btrim(p_voter_token)='' THEN RAISE EXCEPTION 'Invalid voter token'; END IF;
 IF left(p_voter_token,5)<>'task:' THEN RETURN; END IF;
 BEGIN task_id:=substring(p_voter_token FROM 6)::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid task voter token'; END;
 SELECT * INTO t FROM public.poll_tasks WHERE id=task_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll
 OR t.poll_type IS DISTINCT FROM g.type::text THEN RAISE EXCEPTION 'Task expired'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF auth.uid() IS DISTINCT FROM t.recipient_user_id THEN RAISE EXCEPTION 'Not your task'; END IF;
 ELSE
  registered:=public._poll_registered_uid(t.recipient_email);
  IF registered IS NOT NULL AND auth.uid() IS DISTINCT FROM registered THEN RAISE EXCEPTION 'Not your task'; END IF;
  IF registered IS NOT NULL THEN UPDATE public.poll_tasks SET recipient_user_id=registered,recipient_email=NULL WHERE id=t.id; END IF;
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION "public"."_poll_task_change"("p_token" "uuid", "p_action" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.poll_tasks%rowtype; g public.games%rowtype; uid uuid:=auth.uid(); registered uuid;
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[auth.uid()]);
 IF p_action NOT IN ('open','decline','done') OR p_action IS NULL THEN RETURN 'invalid_action'; END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE token=p_token;
 IF NOT FOUND THEN RETURN 'not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=t.game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 'expired'; END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN 'not_found'; END IF;
 IF t.owner_id IS DISTINCT FROM g.owner_id OR t.share_key_poll IS DISTINCT FROM g.share_key_poll
 OR t.poll_type IS DISTINCT FROM g.type::text THEN RETURN 'expired'; END IF;
 IF g.status::text='poll_stopped' THEN RETURN 'poll_stopped'; END IF;
 IF g.status::text='ready' THEN RETURN 'poll_closed'; END IF;
 IF g.status::text<>'poll_open' THEN RETURN 'expired'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF uid IS DISTINCT FROM t.recipient_user_id THEN RETURN 'not_your_task'; END IF;
 ELSE
  registered:=public._poll_registered_uid(t.recipient_email);
  IF registered IS NOT NULL AND uid IS DISTINCT FROM registered THEN RETURN 'not_your_task'; END IF;
  IF registered IS NOT NULL THEN UPDATE public.poll_tasks SET recipient_user_id=registered,recipient_email=NULL WHERE id=t.id; END IF;
 END IF;
 IF p_action='done' AND t.status='done' AND t.done_at IS NOT NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL THEN RETURN 'ok'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RETURN 'already_used'; END IF;
 IF p_action='done' AND NOT public._poll_task_has_all_votes(t.id) THEN RETURN 'votes_incomplete'; END IF;
 IF p_action='decline' THEN
  DELETE FROM public.poll_votes WHERE game_id=t.game_id AND voter_token=public.poll_task_voter_token(t.id);
  DELETE FROM public.poll_text_entries WHERE game_id=t.game_id AND voter_token=public.poll_task_voter_token(t.id);
 END IF;
 UPDATE public.poll_tasks SET
  status=CASE p_action WHEN 'decline' THEN 'declined' WHEN 'done' THEN 'done' ELSE 'opened' END,
  opened_at=coalesce(opened_at,now()),
  declined_at=CASE WHEN p_action='decline' THEN coalesce(declined_at,now()) ELSE declined_at END,
  done_at=CASE WHEN p_action='done' THEN now() ELSE done_at END
 WHERE id=t.id;
 RETURN 'ok';
END; $$;

CREATE OR REPLACE FUNCTION "public"."_poll_share_contact_locks"("p_owner" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE recipient uuid; recipient_email text;
BEGIN
 PERFORM public._poll_identity_email_refs((SELECT array_agg(subscriber_email) FROM public.poll_subscriptions WHERE owner_id=p_owner AND id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[]))),ARRAY[p_owner]||coalesce(p_friend_ids,'{}'::uuid[]));
 -- Contacts precede the game. Ordered pairs match the friends RPCs.
 FOR recipient IN SELECT p.id FROM public.profiles p
 WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND p.id<>p_owner ORDER BY p.id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_owner,recipient)::text||':'||GREATEST(p_owner,recipient)::text,329));
 END LOOP;
 FOR recipient_email IN SELECT DISTINCT public._norm_email(s.subscriber_email)
 FROM public.poll_subscriptions s WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[]))
 AND s.owner_id=p_owner AND public._norm_email(s.subscriber_email) IS NOT NULL
 ORDER BY public._norm_email(s.subscriber_email) LOOP
  PERFORM public._subscriber_pair_lock(p_owner,recipient_email);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."poll_task_resolve"("p_token" "uuid", "p_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  t record;
  u uuid;
  requires_auth boolean := false;
  needs_email boolean := false;
  registered uuid;
  change_result text;
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
    g.owner_id AS game_owner, g.type::text AS game_type,
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
  IF t.game_key IS NULL OR t.owner_id IS DISTINCT FROM t.game_owner
     OR t.poll_type IS DISTINCT FROM t.game_type OR t.game_key <> t.share_key_poll
     OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF t.game_status = 'poll_stopped' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
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

  IF t.recipient_user_id IS NULL THEN
    registered:=public._poll_registered_uid(t.recipient_email);
    IF registered IS NOT NULL THEN
      IF u IS NULL THEN requires_auth := true;
      ELSIF u <> registered THEN RETURN jsonb_build_object('ok',false,'error','invalid_or_unavailable_token'); END IF;
    END IF;
  END IF;

  -- jeżeli task jest e-mailowy: e-mail może być potrzebny do późniejszego UI/komunikatu
  IF t.recipient_user_id IS NULL AND t.recipient_email IS NULL THEN
    -- przypadek "czysty e-mail": oczekujemy podania e-mail w UI
    IF p_email IS NULL OR btrim(p_email) = '' THEN
      needs_email := true;
    END IF;
  END IF;

  IF NOT requires_auth THEN
    change_result:=public._poll_task_change(p_token,'open');
    IF change_result<>'ok' THEN RETURN jsonb_build_object('ok',false,'error',change_result); END IF;
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

CREATE OR REPLACE FUNCTION public.poll_my_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public._norm_email(u.email) FROM auth.users u WHERE u.id=auth.uid() AND public._poll_identity_regular(u.id,to_jsonb(u));
$$;
CREATE OR REPLACE FUNCTION public.poll_claim_email_records()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e text;
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[auth.uid()]);
 SELECT u.email INTO e FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=auth.uid() AND public._norm_email(u.email)=public._norm_email(p.email) AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF e IS NULL THEN RETURN; END IF;
 -- Contact locks precede task rows, consistent with sharing.
 PERFORM public.friend_invites_from_subscriptions();
 PERFORM public._poll_bind_identity(auth.uid(),e);
END $$;
COMMIT;
-- Auth references and email locks precede backfilled task rows.
BEGIN;
DO $$ DECLARE r record; BEGIN
 PERFORM public._poll_identity_email_refs((SELECT array_agg(DISTINCT recipient_email) FROM public.poll_tasks WHERE recipient_user_id IS NULL),'{}'::uuid[]);
 PERFORM 1 FROM auth.users u WHERE EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.recipient_user_id IS NULL AND public._norm_email(t.recipient_email)=public._norm_email(u.email)) ORDER BY u.id FOR KEY SHARE;
 FOR r IN SELECT u.id,u.email FROM auth.users u WHERE public._poll_identity_regular(u.id,to_jsonb(u)) ORDER BY u.id LOOP
  PERFORM public._poll_bind_identity(r.id,r.email);
 END LOOP;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
