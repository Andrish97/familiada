--
-- PostgreSQL database dump
--

\restrict vMuUPR9JmbFwlAdYgohUKwmknPJZ6HM1O3AVKb5Sywsp4BEfZg2x7yvf5hVxQdN

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "graphql_public";


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: base_share_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."base_share_role" AS ENUM (
    'viewer',
    'editor'
);


--
-- Name: device_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."device_type" AS ENUM (
    'display',
    'host',
    'buzzer'
);


--
-- Name: game_round_phase; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."game_round_phase" AS ENUM (
    'IDLE',
    'READY',
    'DUEL',
    'PLAY',
    'STEAL',
    'REVEAL'
);


--
-- Name: game_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."game_status" AS ENUM (
    'draft',
    'poll_open',
    'poll_stopped',
    'ready'
);


--
-- Name: game_step; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."game_step" AS ENUM (
    'devices_display',
    'devices_hostbuzzer',
    'setup_finish',
    'r_intro',
    'r_roundStart',
    'r_duel',
    'r_play',
    'r_gameEnd',
    'f_start',
    'f_p1_entry',
    'f_p1_map_q1',
    'f_p1_map_q2',
    'f_p1_map_q3',
    'f_p1_map_q4',
    'f_p1_map_q5',
    'f_p2_start',
    'f_p2_entry',
    'f_p2_map_q1',
    'f_p2_map_q2',
    'f_p2_map_q3',
    'f_p2_map_q4',
    'f_p2_map_q5',
    'f_end'
);


--
-- Name: game_team; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."game_team" AS ENUM (
    'A',
    'B'
);


--
-- Name: game_top_card; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."game_top_card" AS ENUM (
    'devices',
    'setup',
    'rounds',
    'final'
);


--
-- Name: game_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."game_type" AS ENUM (
    'poll_text',
    'poll_points',
    'prepared',
    'market'
);


--
-- Name: market_game_origin; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."market_game_origin" AS ENUM (
    'community',
    'producer'
);


--
-- Name: market_game_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."market_game_status" AS ENUM (
    'pending',
    'published',
    'withdrawn',
    'rejected'
);


--
-- Name: graphql("text", "text", "jsonb", "jsonb"); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION "graphql_public"."graphql"("operationName" "text" DEFAULT NULL::"text", "query" "text" DEFAULT NULL::"text", "variables" "jsonb" DEFAULT NULL::"jsonb", "extensions" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'graphql_public', 'graphql', 'public'
    AS $$
  select graphql.resolve(
    query := query,
    variables := coalesce(variables, '{}'::jsonb),
    "operationName" := "operationName",
    extensions := extensions
  );
$$;


--
-- Name: _base_friend_source_close(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_base_friend_source_close"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.base_share_tasks SET status=CASE WHEN declined_at IS NOT NULL THEN 'declined' ELSE 'cancelled' END,cancelled_at=coalesce(cancelled_at,now())
   WHERE source_friendship_id=OLD.id AND status IN('pending','opened','declined');
  RETURN OLD;
 END IF;
 IF NEW.status<>'active' OR NEW.cancelled_at IS NOT NULL THEN
  UPDATE public.base_share_tasks SET status=CASE WHEN declined_at IS NOT NULL THEN 'declined' ELSE 'cancelled' END,cancelled_at=coalesce(cancelled_at,now())
   WHERE source_friendship_id=NEW.id AND status IN('pending','opened','declined');
 END IF;
 RETURN NEW;
END $$;


--
-- Name: _base_share_create("uuid", "uuid", "public"."base_share_role", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_base_share_create"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role", "p_from_friend" boolean, "p_requested_email" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE row_result record; source_id uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 FOR row_result IN SELECT * FROM public._mail_original361_base_share_create(p_base_id,p_recipient_user_id,p_role,p_from_friend,p_requested_email) LOOP
  IF row_result.ok AND row_result.mail_to IS NOT NULL AND row_result.mail_link IS NOT NULL THEN
   SELECT id INTO source_id FROM public.base_share_tasks WHERE owner_id=auth.uid() AND base_id=p_base_id AND recipient_user_id=row_result.recipient_id
    AND token::text=substring(row_result.mail_link FROM '[?]b=([a-f0-9-]{36})');
   PERFORM public._mail_allocate_notification('base',source_id,'base:share');
  END IF;
  RETURN QUERY SELECT row_result.ok,row_result.err,row_result.mail_to,row_result.mail_link,row_result.base_name,row_result.owner_label,row_result.cooldown_until,row_result.recipient_id;
 END LOOP;
 RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: _base_share_pair_lock("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_base_share_pair_lock"("p_base" "uuid", "p_recipient" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT pg_advisory_xact_lock(hashtextextended(p_base::text||':'||p_recipient::text,337));
$$;


--
-- Name: _base_share_refusal_until("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_base_share_refusal_until"("p_base" "uuid", "p_recipient" "uuid") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT greatest(max(t.declined_at)+interval '30 days',
  (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c JOIN public.question_bases b ON b.id=p_base
   WHERE c.action_key='base:share_after_reject' AND c.next_allowed_at>now()
   AND c.target_key='pair:'||b.owner_id||':'||p_recipient||':base:'||p_base))
 FROM public.base_share_tasks t WHERE t.base_id=p_base AND t.recipient_user_id=p_recipient
 AND t.declined_at>now()-interval '30 days';
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: base_share_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."base_share_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "base_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid",
    "recipient_email" "text",
    "role" "public"."base_share_role" DEFAULT 'viewer'::"public"."base_share_role" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opened_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "email_sent_at" timestamp with time zone,
    "email_send_count" integer DEFAULT 0 NOT NULL,
    "source_friendship_id" "uuid",
    "source_kind" "text" DEFAULT 'base'::"text" NOT NULL,
    CONSTRAINT "base_task_source_kind" CHECK (((("source_kind" = 'base'::"text") AND ("source_friendship_id" IS NULL)) OR (("source_kind" = 'friend'::"text") AND (("source_friendship_id" IS NOT NULL) OR ("status" = 'done'::"text") OR ("cancelled_at" IS NOT NULL)))))
);

ALTER TABLE ONLY "public"."base_share_tasks" FORCE ROW LEVEL SECURITY;


--
-- Name: _base_task_source_active("public"."base_share_tasks"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_base_task_source_active"("t" "public"."base_share_tasks") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT CASE WHEN t.status='done' THEN EXISTS(SELECT 1 FROM public.question_base_shares s WHERE s.base_id=t.base_id AND s.user_id=t.recipient_user_id)
 WHEN t.source_kind='base' THEN true ELSE EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=t.source_friendship_id
 AND f.status='active' AND f.cancelled_at IS NULL AND ((f.requester_id=t.owner_id AND f.addressee_id=t.recipient_user_id) OR (f.addressee_id=t.owner_id AND f.requester_id=t.recipient_user_id))) END;
$$;


--
-- Name: _base_task_source_lock("public"."base_share_tasks"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_base_task_source_lock"("t" "public"."base_share_tasks") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 PERFORM public._poll_identity_refs(ARRAY[t.owner_id,t.recipient_user_id]);
 IF t.source_kind='base' OR t.status='done' THEN RETURN true; END IF;
 IF t.source_friendship_id IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(t.owner_id,t.recipient_user_id)::text||':'||GREATEST(t.owner_id,t.recipient_user_id)::text,329));
 PERFORM 1 FROM public.friendships f WHERE f.id=t.source_friendship_id AND f.status='active' AND f.cancelled_at IS NULL
 AND ((f.requester_id=t.owner_id AND f.addressee_id=t.recipient_user_id) OR (f.addressee_id=t.owner_id AND f.requester_id=t.recipient_user_id)) FOR SHARE;
 RETURN FOUND;
END $$;


--
-- Name: _contact_mail_enabled("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_contact_mail_enabled"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
 SELECT public._norm_email(p_email) IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.email_unsub_tokens
     WHERE lower(trim(email))=public._norm_email(p_email) AND suppressed_at IS NOT NULL)
   AND coalesce((SELECT f.email_notifications FROM auth.users u
     JOIN public.user_flags f ON f.user_id=u.id
     WHERE lower(trim(u.email))=public._norm_email(p_email) LIMIT 1),true);
$$;


--
-- Name: _control2_log_device_lease_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_control2_log_device_lease_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_session_id uuid;
  v_from text;
  v_epoch bigint;
  v_event_id text;
BEGIN
  IF TG_OP='INSERT' THEN
    -- Only log a queue insertion if another live instance already owns the slot.
    IF NEW.state<>'waiting' OR NOT EXISTS (
      SELECT 1 FROM public.control_device_slots s
      WHERE s.session_id=NEW.session_id AND s.device_type=NEW.device_type
        AND s.primary_connection_id IS NOT NULL AND s.primary_connection_id<>NEW.id
    ) THEN RETURN NEW; END IF;
    v_from := NULL;
    v_epoch := 0;
    v_event_id := 'lease:'||NEW.id::text||':waiting';
  ELSE
    IF OLD.state IS NOT DISTINCT FROM NEW.state THEN RETURN NEW; END IF;
    v_from := OLD.state;
    v_epoch := coalesce(NEW.epoch,OLD.epoch,0);
    v_event_id := 'lease:'||NEW.id::text||':'||NEW.state||':'||v_epoch::text;
  END IF;

  SELECT a.session_id INTO v_session_id
  FROM public.game_session_active a
  JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
  WHERE a.game_id=NEW.game_id AND s.control_version=2 AND s.ended_at IS NULL
  LIMIT 1;
  IF v_session_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    INSERT INTO public.control2_device_events(
      game_id,session_id,device_type,event_type,event_id,details
    ) VALUES (
      NEW.game_id,v_session_id,NEW.device_type,'lease_state',v_event_id,
      jsonb_build_object(
        'device_type',NEW.device_type,
        'from_state',v_from,
        'to_state',NEW.state,
        'epoch',v_epoch,
        'connection_id',NEW.id,
        'visibility',NEW.page_visibility,
        'focused',NEW.focused
      )
    ) ON CONFLICT (game_id,event_id) WHERE event_id IS NOT NULL DO NOTHING;

    DELETE FROM public.control2_device_events e
    WHERE e.game_id=NEW.game_id
      AND (e.created_at<now()-interval '30 days' OR e.id IN (
        SELECT id FROM public.control2_device_events
        WHERE game_id=NEW.game_id ORDER BY created_at DESC,id DESC OFFSET 500
      ));
  EXCEPTION WHEN OTHERS THEN
    -- A diagnostic write must not break device registration or lease renewal.
    RAISE WARNING 'Control 2 lease event was not recorded: %',SQLERRM;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: _control_device_action_valid("uuid", "text", "text", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_control_device_action_valid"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid", "p_epoch" bigint) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_session_id uuid; v_protocol smallint;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RETURN false; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT device_protocol INTO v_protocol FROM public.control_runtime_sessions
    WHERE id=v_session_id AND game_id=p_game_id AND ended_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_protocol=1 THEN RETURN p_connection_id IS NULL AND p_epoch IS NULL; END IF;
  IF p_connection_id IS NULL OR p_epoch IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.control_device_connections c
    JOIN public.control_device_slots s ON s.session_id=c.session_id AND s.device_type=c.device_type
    WHERE c.id=p_connection_id AND c.session_id=v_session_id AND c.game_id=p_game_id
      AND c.device_type=p_device_type AND c.state='primary' AND c.epoch=p_epoch
      AND c.last_seen_at>clock_timestamp()-interval '12 seconds'
      AND s.primary_connection_id=c.id AND s.epoch=p_epoch
      AND s.lease_expires_at>clock_timestamp()
  );
END;
$$;


--
-- Name: _control_device_promote_waiting("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_control_device_promote_waiting"("p_session_id" "uuid", "p_device_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_slot public.control_device_slots;
  v_candidate uuid;
  v_epoch bigint;
BEGIN
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=p_session_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_slot.primary_connection_id IS NOT NULL
     AND v_slot.lease_expires_at > clock_timestamp()
     AND EXISTS (
       SELECT 1 FROM public.control_device_connections c
       WHERE c.id=v_slot.primary_connection_id AND c.state='primary'
         AND c.last_seen_at > clock_timestamp()-interval '12 seconds'
     ) THEN
    RETURN v_slot.primary_connection_id;
  END IF;

  IF v_slot.primary_connection_id IS NOT NULL THEN
    UPDATE public.control_device_connections SET state='expired',epoch=NULL
    WHERE id=v_slot.primary_connection_id AND state='primary';
  END IF;
  UPDATE public.control_device_connections SET state='expired',epoch=NULL
  WHERE session_id=p_session_id AND device_type=p_device_type AND state='waiting'
    AND last_seen_at<=clock_timestamp()-interval '12 seconds';

  SELECT c.id INTO v_candidate
  FROM public.control_device_connections c
  WHERE c.session_id=p_session_id AND c.device_type=p_device_type
    AND c.state='waiting' AND c.last_seen_at > clock_timestamp()-interval '12 seconds'
  ORDER BY c.requested_at,c.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_candidate IS NULL THEN
    UPDATE public.control_device_slots SET primary_connection_id=NULL,
      epoch=CASE WHEN v_slot.primary_connection_id IS NULL THEN v_slot.epoch ELSE v_slot.epoch+1 END,
      lease_expires_at=NULL,updated_at=clock_timestamp()
    WHERE session_id=p_session_id AND device_type=p_device_type;
    RETURN NULL;
  END IF;

  v_epoch := v_slot.epoch + 1;
  UPDATE public.control_device_connections SET state='primary',epoch=v_epoch
  WHERE id=v_candidate;
  UPDATE public.control_device_slots SET primary_connection_id=v_candidate,epoch=v_epoch,
    lease_expires_at=clock_timestamp()+interval '12 seconds',updated_at=clock_timestamp()
  WHERE session_id=p_session_id AND device_type=p_device_type;
  RETURN v_candidate;
END;
$$;


--
-- Name: _control_device_session_for_key("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_control_device_session_for_key"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.session_id
  FROM public.control_device_link_tokens t
  JOIN public.control_runtime_sessions s ON s.id=t.session_id
  WHERE t.game_id=p_game_id AND t.device_type=p_device_type AND t.token::text=p_key
    AND s.ended_at IS NULL AND s.expires_at>now()
  UNION ALL
  SELECT sh.session_id
  FROM public.control_device_shares sh
  JOIN public.control_runtime_sessions s ON s.id=sh.session_id
  WHERE sh.game_id=p_game_id AND sh.device_type=p_device_type AND sh.token::text=p_key
    AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
  LIMIT 1
$$;


--
-- Name: _control_device_status("uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_control_device_status"("p_session_id" "uuid", "p_device_type" "text", "p_connection_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_connection public.control_device_connections;
  v_slot public.control_device_slots;
  v_position integer;
  v_waiting integer;
BEGIN
  SELECT * INTO v_connection FROM public.control_device_connections
  WHERE id=p_connection_id AND session_id=p_session_id AND device_type=p_device_type;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','missing'); END IF;
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=p_session_id AND device_type=p_device_type;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state',v_connection.state); END IF;
  SELECT count(*)::integer INTO v_waiting FROM public.control_device_connections
  WHERE session_id=p_session_id AND device_type=p_device_type AND state='waiting'
    AND last_seen_at>clock_timestamp()-interval '12 seconds';
  IF v_connection.state='waiting' THEN
    SELECT count(*)::integer+1 INTO v_position FROM public.control_device_connections c
    WHERE c.session_id=p_session_id AND c.device_type=p_device_type AND c.state='waiting'
      AND c.last_seen_at>clock_timestamp()-interval '12 seconds'
      AND (c.requested_at,c.id)<(v_connection.requested_at,v_connection.id);
  END IF;
  RETURN jsonb_build_object('ok',true,'state',v_connection.state,
    'epoch',v_connection.epoch,'lease_expires_at',v_slot.lease_expires_at,
    'waiting_count',v_waiting,'queue_position',v_position);
END;
$$;


--
-- Name: _control_share_recipient_lookup("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_control_share_recipient_lookup"("p_game_id" "uuid", "p_lookup" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE uid uuid:=auth.uid(); raw text:=lower(trim(p_lookup)); peer uuid; mail text;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u)))
 OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=uid)
 THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
 IF position('@' in raw)>0 THEN
  IF raw !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_email'); END IF;
  peer:=public._poll_registered_uid(raw); mail:=raw;
 ELSE
  SELECT u.id,public._norm_email(u.email) INTO peer,mail FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE lower(trim(p.username))=raw AND public._poll_identity_regular(u.id,to_jsonb(u));
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','unknown_user'); END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'recipient_id',peer,'email',mail,'by_email',position('@' in raw)>0);
END $_$;


--
-- Name: _copy_decide("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_copy_decide"("p_offer" "uuid", "p_decision" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE actor uuid:=auth.uid(); item public.resource_copy_offers; target uuid;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'error','auth_required'); END IF;
 IF p_decision NOT IN('accept','decline') THEN RETURN jsonb_build_object('ok',false,'error','invalid_decision'); END IF;
 PERFORM 1 FROM auth.users WHERE id=actor FOR NO KEY UPDATE NOWAIT;
 SELECT * INTO item FROM public.resource_copy_offers WHERE id=p_offer AND recipient_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF item.status IN('declined','expired') THEN RETURN jsonb_build_object('ok',false,'error',item.status); END IF;
 IF item.status='accepted' AND p_decision='decline' THEN RETURN jsonb_build_object('ok',false,'error','already_accepted'); END IF;
 IF item.status='pending' AND item.created_at+interval '5 days'<=clock_timestamp() THEN
  PERFORM public._copy_discard(item.id,'expired'); RETURN jsonb_build_object('ok',false,'error','expired');
 END IF;
 IF p_decision='decline' THEN PERFORM public._copy_discard(item.id,'declined'); RETURN jsonb_build_object('ok',true); END IF;
 target:=CASE item.resource_kind WHEN 'game' THEN item.game_id ELSE item.logo_id END;
 IF target IS NULL THEN RETURN jsonb_build_object('ok',false,'error','previously_removed'); END IF;
 UPDATE public.resource_copy_offers SET status='accepted',decided_at=coalesce(decided_at,clock_timestamp()) WHERE id=item.id;
 RETURN jsonb_build_object('ok',true,'id',target,'already',item.status='accepted');
END $$;


--
-- Name: _copy_discard("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_copy_discard"("p_offer" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE item public.resource_copy_offers;
BEGIN
 IF p_status NOT IN('declined','expired') THEN RAISE EXCEPTION 'invalid_copy_decision'; END IF;
 SELECT * INTO item FROM public.resource_copy_offers WHERE id=p_offer FOR UPDATE;
 IF NOT FOUND OR item.status<>'pending' THEN RETURN; END IF;
 -- The authoritative state changes before deleting children, within one transaction.
 UPDATE public.resource_copy_offers SET status=p_status,decided_at=clock_timestamp(),game_id=NULL,logo_id=NULL WHERE id=p_offer;
 IF item.game_id IS NOT NULL THEN DELETE FROM public.games WHERE id=item.game_id AND owner_id=item.recipient_id; END IF;
 IF item.logo_id IS NOT NULL THEN DELETE FROM public.user_logos WHERE id=item.logo_id AND user_id=item.recipient_id; END IF;
END $$;


--
-- Name: _copy_game_send("uuid", "uuid", "jsonb", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_copy_game_send"("p_source" "uuid", "p_recipient" "uuid", "p_payload" "jsonb", "p_request" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE actor uuid:=auth.uid(); source public.games; existing public.resource_copy_offers; canonical jsonb;
 fingerprint text; expected_type text; offer_id uuid:=gen_random_uuid(); imported jsonb; gid uuid; label text; blocked_until timestamptz;
BEGIN
 IF actor IS NULL OR p_recipient IS NULL OR actor=p_recipient OR p_request IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 PERFORM 1 FROM auth.users u WHERE u.id IN(actor,p_recipient) ORDER BY u.id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE u.id IN(actor,p_recipient) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>2 THEN RETURN jsonb_build_object('ok',false,'error','auth_required'); END IF;
 canonical:=public._game_package_normalize(p_payload);
 fingerprint:=encode(sha256(convert_to(canonical::text,'UTF8')),'hex');
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=actor AND request_id=p_request AND recipient_id=p_recipient FOR UPDATE;
 IF FOUND THEN
  IF existing.source_id IS DISTINCT FROM p_source OR existing.resource_kind<>'game' OR existing.payload_hash IS DISTINCT FROM fingerprint THEN RETURN jsonb_build_object('ok',false,'error','request_conflict'); END IF;
  RETURN jsonb_build_object('ok',true,'already',true,'offer_id',existing.id);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(actor,p_recipient)::text||':'||GREATEST(actor,p_recipient)::text,329));
 PERFORM 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL
  AND ((requester_id=actor AND addressee_id=p_recipient) OR (requester_id=p_recipient AND addressee_id=actor)) FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_friend'); END IF;
 SELECT * INTO source FROM public.games WHERE id=p_source AND owner_id=actor FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF source.type::text NOT IN('prepared','poll_text','poll_points') OR source.status::text NOT IN('draft','ready') THEN RETURN jsonb_build_object('ok',false,'error','not_exportable'); END IF;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers WHERE game_id=p_source AND status='pending') THEN RETURN jsonb_build_object('ok',false,'error','received_copy_pending'); END IF;
 expected_type:=CASE WHEN source.type::text<>'prepared' AND source.status::text='ready' THEN 'prepared' ELSE source.type::text END;
 IF canonical#>>'{game,type}' IS DISTINCT FROM expected_type OR canonical#>>'{game,name}' IS DISTINCT FROM coalesce(nullif(trim(source.name),''),'Gra') THEN RETURN jsonb_build_object('ok',false,'error','source_changed'); END IF;
 SELECT max(decided_at+interval '30 days') INTO blocked_until FROM public.resource_copy_offers
  WHERE sender_identity=actor AND source_id=p_source AND recipient_id=p_recipient AND status='declined';
 IF blocked_until>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','declined_cooldown','cooldown_until',blocked_until); END IF;
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=actor AND source_id=p_source AND recipient_id=p_recipient AND status='pending' FOR UPDATE;
 IF FOUND THEN
  IF existing.created_at+interval '5 days'>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','already_sent'); END IF;
  PERFORM public._copy_discard(existing.id,'expired');
 END IF;
 imported:=public._game_import_package(canonical,p_recipient,offer_id);
 IF imported->>'ok' IS DISTINCT FROM 'true' THEN RETURN imported; END IF;
 gid:=(imported->>'id')::uuid;
 SELECT coalesce(nullif(p.username,''),u.email) INTO label FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=actor;
 UPDATE public.games SET received_from_label=label,received_from_identity=actor WHERE id=gid AND owner_id=p_recipient;
 INSERT INTO public.resource_copy_offers(id,recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,request_id,payload_hash,game_id)
  VALUES(offer_id,p_recipient,actor,actor,label,p_source,'game',expected_type,canonical#>>'{game,name}',p_request,fingerprint,gid);
 INSERT INTO public.resource_copy_history(sender_id,game_id,offer_id,recipient_identity,recipient_label)
  SELECT actor,p_source,offer_id,p_recipient,coalesce(nullif(p.username,''),u.email) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=p_recipient;
 RETURN jsonb_build_object('ok',true,'already',false,'offer_id',offer_id);
END $$;


--
-- Name: _copy_pending_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_copy_pending_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE ids uuid[]; question_ids uuid[]; old_row jsonb; new_row jsonb; kind text:='game';
BEGIN
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME IN('games','user_logos') THEN
  ids:=ARRAY[(old_row->>'id')::uuid,(new_row->>'id')::uuid];
  IF TG_TABLE_NAME='user_logos' THEN kind:='logo'; END IF;
 ELSIF TG_TABLE_NAME='market_games' THEN
  ids:=ARRAY[(old_row->>'source_game_id')::uuid,(new_row->>'source_game_id')::uuid];
 ELSIF TG_TABLE_NAME='answers' THEN
  question_ids:=ARRAY[(old_row->>'question_id')::uuid,(new_row->>'question_id')::uuid];
  SELECT array_agg(game_id) INTO ids FROM public.questions WHERE id=ANY(question_ids);
 ELSE ids:=ARRAY[(old_row->>'game_id')::uuid,(new_row->>'game_id')::uuid]; END IF;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers o JOIN auth.users u ON u.id=o.recipient_id
  WHERE o.status='pending' AND u.deleted_at IS NULL AND o.resource_kind=kind
   AND CASE kind WHEN 'game' THEN o.game_id ELSE o.logo_id END=ANY(ids)) THEN
  RAISE EXCEPTION 'received_copy_pending';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;


--
-- Name: _ensure_unsub_token("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_ensure_unsub_token"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_token uuid;
BEGIN
  INSERT INTO public.email_unsub_tokens (email)
  VALUES (lower(trim(p_email)))
  ON CONFLICT (email) DO NOTHING;

  SELECT token INTO v_token
  FROM public.email_unsub_tokens
  WHERE email = lower(trim(p_email));

  RETURN v_token;
END;
$$;


--
-- Name: _friend_accept_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_friend_accept_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE r record;
BEGIN
 IF NEW.status='active' THEN
  FOR r IN SELECT s.id,s.owner_id,p.id AS peer FROM public.poll_subscriptions s
   JOIN public.profiles p ON (s.owner_id=NEW.requester_id AND p.id=NEW.addressee_id)
      OR (s.owner_id=NEW.addressee_id AND p.id=NEW.requester_id)
   WHERE s.status IN ('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL AND (s.registered_user_id=p.id OR s.subscriber_user_id=p.id
    OR EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.source_subscription_id=s.id AND t.recipient_user_id=p.id)
    OR (s.identity_tracking_enabled AND s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email)=(SELECT public._norm_email(email) FROM auth.users WHERE id=p.id)
      AND NOT EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.source_subscription_id=s.id AND t.recipient_user_id IS NOT NULL AND t.recipient_user_id<>p.id))
   ) ORDER BY s.owner_id,s.id LOOP
   UPDATE public.poll_tasks SET source_subscription_id=NULL,source_friendship_id=NEW.id,source_kind='friend',recipient_user_id=r.peer,recipient_email=NULL
    WHERE source_subscription_id=r.id AND owner_id=r.owner_id AND (recipient_user_id IS NULL OR recipient_user_id=r.peer);
   DELETE FROM public.poll_subscriptions WHERE id=r.id;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: _friend_drop_pair_tasks("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_friend_drop_pair_tasks"("p_a" "uuid", "p_b" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.poll_tasks pt
  WHERE pt.status IN ('pending', 'opened') AND pt.source_kind IN ('friend','game')
    AND ((pt.owner_id = p_a AND pt.recipient_user_id = p_b)
      OR (pt.owner_id = p_b AND pt.recipient_user_id = p_a));

  UPDATE public.base_share_tasks bt SET status=CASE WHEN bt.declined_at IS NOT NULL THEN 'declined' ELSE 'cancelled' END,cancelled_at=coalesce(bt.cancelled_at,now())
  WHERE bt.status IN('pending','opened','declined') AND bt.source_kind='friend'
  AND ((bt.owner_id=p_a AND bt.recipient_user_id=p_b) OR (bt.owner_id=p_b AND bt.recipient_user_id=p_a));

END;
$$;


--
-- Name: _friend_initial_decision_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_friend_initial_decision_user"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.decision_user_id:=coalesce(NEW.decision_user_id,NEW.addressee_id); RETURN NEW; END $$;


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "addressee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "email_sent_at" timestamp with time zone,
    "email_send_count" integer DEFAULT 0 NOT NULL,
    "declined_at" timestamp with time zone,
    "decision_user_id" "uuid" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "source_subscription_id" "uuid",
    CONSTRAINT "friendships_decision_party_check" CHECK ((("decision_user_id" = "requester_id") OR ("decision_user_id" = "addressee_id"))),
    CONSTRAINT "friendships_distinct_chk" CHECK (("requester_id" <> "addressee_id")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'declined'::"text"])))
);

ALTER TABLE ONLY "public"."friendships" FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN "friendships"."decision_user_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."friendships"."decision_user_id" IS 'Osoba podejmująca accept/reject/undo; po wypisaniu z aktywnej znajomości jest nią wypisujący, bez zmiany pierwotnego kierunku.';


--
-- Name: COLUMN "friendships"."cancelled_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."friendships"."cancelled_at" IS 'Cofnięcie przez drugą stronę: nieważny token/undo, zachowany zegar odmowy i budżet maili.';


--
-- Name: _friend_locked("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_friend_locked"("p_id" "uuid") RETURNS "public"."friendships"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE f public.friendships%rowtype; uid uuid:=auth.uid(); source_email text;
BEGIN
 IF uid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN(requester_id,addressee_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF f.source_subscription_id IS NOT NULL THEN
  SELECT subscriber_email INTO source_email FROM public.poll_subscriptions WHERE id=f.source_subscription_id;
 END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[source_email],ARRAY[f.requester_id,f.addressee_id]);
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,f.addressee_id)::text||':'||GREATEST(f.requester_id,f.addressee_id)::text,329));
 IF f.source_subscription_id IS NOT NULL THEN
  PERFORM public._subscriber_pair_lock(f.requester_id,source_email);
  PERFORM 1 FROM public.poll_subscriptions WHERE id=f.source_subscription_id
   AND status IN('pending','active') AND cancelled_at IS NULL AND declined_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN(requester_id,addressee_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN f;
END $$;


--
-- Name: _friend_mail_limit_until("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_friend_mail_limit_until"("p_requester" "uuid", "p_addressee" "uuid") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE WHEN coalesce(sum(f.email_send_count), 0) >= 2
              THEN max(f.email_sent_at) + interval '30 days' END
  FROM public.friendships f
  WHERE LEAST(f.requester_id,f.addressee_id)=LEAST(p_requester,p_addressee)
    AND GREATEST(f.requester_id,f.addressee_id)=GREATEST(p_requester,p_addressee)
    AND f.email_sent_at > now() - interval '30 days'
$$;


--
-- Name: _friend_refusal_clocks("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_friend_refusal_clocks"("p_a" "uuid", "p_b" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 PERFORM public.mail_cooldown_reserve('friend:invite_after_reject','pair:'||p_a||':'||p_b);
 PERFORM public.mail_cooldown_reserve('friend:invite_after_reject','pair:'||p_b||':'||p_a);
END $$;


--
-- Name: _friend_source_closed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_friend_source_closed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.friendships SET cancelled_at=coalesce(cancelled_at,now()) WHERE source_subscription_id=OLD.id AND status IN('pending','declined');
 ELSIF NEW.status NOT IN('pending','active') OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL THEN
  UPDATE public.friendships SET cancelled_at=coalesce(cancelled_at,now()) WHERE source_subscription_id=NEW.id AND status IN('pending','declined');
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


--
-- Name: _game_import_package("jsonb", "uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_game_import_package"("p_payload" "jsonb", "p_owner" "uuid", "p_request" "uuid", "p_defaults" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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


--
-- Name: _game_package_normalize("jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_game_package_normalize"("p_payload" "jsonb", "p_defaults" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
END $_$;


--
-- Name: _guest_identity_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_guest_identity_metadata"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE guest boolean;
BEGIN
 guest:=coalesce(NEW.raw_user_meta_data->>'is_guest','false')='true';
 IF TG_OP='UPDATE' THEN
  SELECT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id=NEW.id),guest) INTO guest;
 END IF;
 guest:=guest OR (coalesce(NEW.is_anonymous,false) AND (NEW.email_confirmed_at IS NULL OR nullif(trim(NEW.email),'') IS NULL));
 NEW.raw_user_meta_data:=coalesce(NEW.raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('is_guest',guest);
 RETURN NEW;
END $$;


--
-- Name: _logo_clone_image_refs("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_logo_clone_image_refs"("p_source" "jsonb") RETURNS SETOF "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
 WITH RECURSIVE nodes(value) AS (
  SELECT p_source->'fabricData'
  UNION ALL
  SELECT child.value FROM nodes n CROSS JOIN LATERAL (
   SELECT value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}' END)
   UNION ALL
   SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]' END)
  ) child WHERE jsonb_typeof(child.value) IN('object','array')
 ), refs(value) AS (
  SELECT CASE WHEN p_source->>'imageData' ~* '^data:image/' THEN p_source->>'imageData' ELSE p_source->>'imageUrl' END
  UNION ALL
  SELECT e.value#>>'{}' FROM nodes n CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}' END) e
   WHERE e.key='src' AND jsonb_typeof(e.value)='string'
 ) SELECT DISTINCT value FROM refs WHERE value IS NOT NULL AND value<>'';
$$;


--
-- Name: _logo_image_path("jsonb", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_logo_image_path"("p_payload" "jsonb", "p_user" "uuid") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case when p like (p_user::text || '/%') then p end
  from (
    select split_part(split_part(coalesce(p_payload #>> '{source,imageUrl}', ''), '/user-logos/', 2), '?', 1) as p
  ) x
$$;


--
-- Name: _logo_url_path("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_logo_url_path"("p_url" "text", "p_user" "uuid") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case when p like (p_user::text || '/%') then p end
  from (select split_part(split_part(coalesce(p_url, ''), '/user-logos/', 2), '?', 1) as p) x
$$;


--
-- Name: _mail_allocate_notification("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_allocate_notification"("p_kind" "text", "p_id" "uuid", "p_action" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE q public.mail_queue;allocation_id uuid;recipient uuid;
BEGIN
 q:=public._mail_notification_probe(p_kind,p_id,p_action);IF q IS NULL THEN RETURN NULL;END IF;
 recipient:=(q.notification_snapshot->>'recipient_id')::uuid;
 PERFORM 1 FROM public.user_flags WHERE user_id=(q.notification_snapshot->>'identity_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM public.email_unsub_tokens WHERE public._norm_email(email)=public._norm_email(q.to_email) FOR SHARE NOWAIT;
 IF NOT public._mail_notification_source_live(q) THEN RETURN NULL;END IF;
 UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp()
  WHERE source_kind=p_kind AND source_token=q.notification_source_token AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.mail_notification_allocations(owner_id,lifecycle_owner_id,recipient_id,identity_id,to_email,source_kind,source_token,
  friendship_id,subscription_id,poll_task_id,base_task_id,device_share_id,copy_offer_id,snapshot)
 VALUES(q.created_by,CASE WHEN p_kind='copy' THEN recipient ELSE q.created_by END,recipient,
  (q.notification_snapshot->>'identity_id')::uuid,q.to_email,p_kind,q.notification_source_token,
  q.notification_friendship_id,q.notification_subscription_id,q.notification_poll_task_id,q.notification_base_task_id,
  q.notification_device_share_id,q.notification_copy_offer_id,q.notification_snapshot) RETURNING id INTO allocation_id;
 RETURN allocation_id;
END $$;


--
-- Name: _mail_anon_source_locks("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_anon_source_locks"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE before_ids uuid[]; after_ids uuid[]; owner_id uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_ids:=public._mail_anon_source_owners(p_email);
   PERFORM 1 FROM auth.users WHERE id=ANY(before_ids) ORDER BY id FOR SHARE NOWAIT;
   IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||p_email,351)) THEN
    RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03';
   END IF;
   after_ids:=public._mail_anon_source_owners(p_email);
   IF after_ids IS DISTINCT FROM before_ids THEN RAISE EXCEPTION 'mail parents changed' USING ERRCODE='55P03'; END IF;
   FOR owner_id IN SELECT s.owner_id FROM public.poll_subscriptions s WHERE public._norm_email(s.subscriber_email)=p_email
     AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND s.status IN('pending','active') ORDER BY s.owner_id,s.id LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended(owner_id::text||':email:'||p_email,333)) THEN
     RAISE EXCEPTION 'contact pair busy' USING ERRCODE='55P03';
    END IF;
   END LOOP;
   PERFORM 1 FROM public.games WHERE id IN(
    SELECT game_id FROM public.poll_tasks WHERE recipient_user_id IS NULL AND public._norm_email(recipient_email)=p_email AND status IN('pending','opened')
    UNION SELECT game_id FROM public.control_device_shares WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=p_email AND revoked_at IS NULL
   ) ORDER BY id FOR UPDATE NOWAIT;
   PERFORM 1 FROM public.control_runtime_sessions WHERE id IN(
    SELECT session_id FROM public.control_device_shares WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=p_email AND revoked_at IS NULL
   ) ORDER BY id FOR UPDATE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: _mail_anon_source_owners("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_anon_source_owners"("p_email" "text") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) FROM (
  SELECT owner_id AS id FROM public.poll_subscriptions WHERE public._norm_email(subscriber_email)=p_email
    AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND status IN('pending','active')
  UNION SELECT owner_id FROM public.poll_tasks WHERE public._norm_email(recipient_email)=p_email
    AND recipient_user_id IS NULL AND status IN('pending','opened')
  UNION SELECT owner_id FROM public.control_device_shares WHERE public._norm_email(recipient_email)=p_email
    AND recipient_id IS NULL AND revoked_at IS NULL
  UNION SELECT public._poll_registered_uid(p_email)
  UNION SELECT auth.uid()
 ) roots WHERE id IS NOT NULL;
$$;


--
-- Name: _mail_center_anon_source_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_center_anon_source_insert_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE mailbox text; owner uuid;
BEGIN
 IF TG_TABLE_NAME='poll_tasks' THEN
  IF NEW.recipient_user_id IS NOT NULL OR NEW.status NOT IN('pending','opened') THEN RETURN NEW; END IF;
  mailbox:=public._norm_email(NEW.recipient_email); owner:=NEW.owner_id;
 ELSIF TG_TABLE_NAME='poll_subscriptions' THEN
  IF NEW.subscriber_user_id IS NOT NULL OR NEW.registered_user_id IS NOT NULL OR NEW.status NOT IN('pending','active') THEN RETURN NEW; END IF;
  mailbox:=public._norm_email(NEW.subscriber_email); owner:=NEW.owner_id;
 ELSE
  IF NEW.recipient_id IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
  mailbox:=public._norm_email(NEW.recipient_email); owner:=NEW.owner_id;
 END IF;
 -- BEFORE INSERT has no existing child row lock. Established APIs already own
 -- these parent/identity locks; this also covers older service insertion paths.
 PERFORM public._poll_identity_email_refs(ARRAY[mailbox],ARRAY[owner]);
 IF public._poll_registered_uid(mailbox) IS NULL AND NOT public._contact_mail_enabled(mailbox) THEN
  RAISE EXCEPTION 'notifications_disabled' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;


--
-- Name: _mail_center_identity_invalidate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_center_identity_invalidate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE mailboxes text[];
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF TG_OP='INSERT' OR NEW.is_guest IS NOT DISTINCT FROM OLD.is_guest THEN RETURN NEW; END IF;
  SELECT ARRAY[public._norm_email(email)] INTO mailboxes FROM auth.users WHERE id=NEW.id;
 ELSIF TG_OP='UPDATE' THEN
  IF public._norm_email(NEW.email) IS NOT DISTINCT FROM public._norm_email(OLD.email)
   AND NEW.is_anonymous IS NOT DISTINCT FROM OLD.is_anonymous
   AND (NEW.email_confirmed_at IS NOT NULL) IS NOT DISTINCT FROM (OLD.email_confirmed_at IS NOT NULL)
   AND (NEW.raw_user_meta_data->>'is_guest') IS NOT DISTINCT FROM (OLD.raw_user_meta_data->>'is_guest') THEN RETURN NEW; END IF;
  mailboxes:=ARRAY[public._norm_email(OLD.email),public._norm_email(NEW.email)];
 ELSIF TG_OP='INSERT' THEN
  IF NOT public._poll_identity_regular(NEW.id,to_jsonb(NEW)) THEN RETURN NEW; END IF;
  mailboxes:=ARRAY[public._norm_email(NEW.email)];
 ELSE mailboxes:=ARRAY[public._norm_email(OLD.email)]; END IF;
 PERFORM public._poll_identity_mail_locks(mailboxes);
 UPDATE public.mail_center_links SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE email=ANY(mailboxes) AND revoked_at IS NULL;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


--
-- Name: _mail_center_identity_lock("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_center_identity_lock"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE before_uid uuid; after_uid uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_uid:=public._poll_registered_uid(p_email);
   PERFORM 1 FROM auth.users WHERE id=before_uid FOR SHARE NOWAIT;
   IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||p_email,351)) THEN
    RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03';
   END IF;
   after_uid:=public._poll_registered_uid(p_email);
   IF before_uid IS DISTINCT FROM after_uid THEN RAISE EXCEPTION 'mail identity changed' USING ERRCODE='55P03'; END IF;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: _mail_center_scope("text", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_center_scope"("p_secret" "text", "p_touch" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE sess public.mail_center_sessions; link public.mail_center_links; hashed text;
BEGIN
 IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 hashed:=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
 SELECT * INTO sess FROM public.mail_center_sessions WHERE secret_hash=hashed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 SELECT * INTO link FROM public.mail_center_links WHERE id=sess.link_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','expired_session'); END IF;
 PERFORM public._mail_center_identity_lock(link.email);
 SELECT * INTO link FROM public.mail_center_links WHERE id=sess.link_id FOR UPDATE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','expired_session'); END IF;
 SELECT * INTO sess FROM public.mail_center_sessions WHERE secret_hash=hashed FOR UPDATE;
 IF NOT FOUND OR sess.revoked_at IS NOT NULL OR sess.expires_at<=clock_timestamp()
   OR sess.last_seen_at<=clock_timestamp()-interval '1 hour' THEN
  RETURN jsonb_build_object('ok',false,'error','expired_session');
 END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 IF p_touch THEN UPDATE public.mail_center_sessions SET last_seen_at=clock_timestamp() WHERE secret_hash=hashed; END IF;
 RETURN jsonb_build_object('ok',true,'email',link.email,'notifications_enabled',public._contact_mail_enabled(link.email));
END $_$;


--
-- Name: _mail_center_verification_live("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_center_verification_live"("p_link" "uuid", "p_email" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.mail_center_links l JOIN public.email_unsub_tokens r ON r.token=l.root_token
  WHERE l.id=p_link AND l.email=public._norm_email(p_email) AND r.email=l.email AND l.purpose='verification'
   AND l.revoked_at IS NULL AND l.consumed_at IS NULL AND l.expires_at>clock_timestamp())
  AND public._poll_registered_uid(p_email) IS NULL;
$$;


--
-- Name: _mail_contact_source_live("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_contact_source_live"("p_message" "uuid", "p_email" "text", "p_action" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.messages m JOIN public.reports r ON r.id=m.report_id
  WHERE m.id=p_message AND m.direction='inbound' AND m.deleted_at IS NULL
    AND public._norm_email(m.from_email)=public._norm_email(p_email)
    AND ((p_action='contact:confirmation' AND m.source='form' AND m.created_at>clock_timestamp()-interval '24 hours')
      OR (p_action='admin:compose' AND m.source IN('form','email'))));
$$;


--
-- Name: _mail_notification_action_matches("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_notification_action_matches"("p_kind" "text", "p_action" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT coalesce(CASE p_kind WHEN 'friend' THEN p_action IN('friend:invite','friend:resend')
  WHEN 'subscription' THEN p_action IN('poll:invite','poll:resend') WHEN 'poll' THEN p_action='poll:share'
  WHEN 'base' THEN p_action='base:share' WHEN 'device' THEN p_action='device:share'
  WHEN 'copy' THEN p_action='copy:send' ELSE false END,false);
$$;


--
-- Name: _mail_notification_fields("jsonb", "text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_notification_fields"("p_row" "jsonb", "p_fields" "text"[]) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_object_agg(k,p_row->k),'{}'::jsonb) FROM unnest(p_fields) k;
$$;


--
-- Name: mail_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "to_email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "html" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "not_before" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "provider_used" "text",
    "provider_order" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "picked_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "from_email" "text",
    "text" "text",
    "cooldown_action_key" "text" NOT NULL,
    "cooldown_target_key" "text" NOT NULL,
    "mail_center_link_id" "uuid",
    "contact_message_id" "uuid",
    "contact_source_expected" boolean DEFAULT false NOT NULL,
    "notification_source_kind" "text",
    "notification_source_token" "uuid",
    "notification_friendship_id" "uuid",
    "notification_subscription_id" "uuid",
    "notification_poll_task_id" "uuid",
    "notification_base_task_id" "uuid",
    "notification_device_share_id" "uuid",
    "notification_snapshot" "jsonb",
    "notification_allocation_id" "uuid",
    "notification_copy_offer_id" "uuid",
    CONSTRAINT "mail_queue_notification_source_kind_check" CHECK ((("notification_source_kind" IS NULL) OR ("notification_source_kind" = ANY (ARRAY['friend'::"text", 'subscription'::"text", 'poll'::"text", 'base'::"text", 'device'::"text", 'copy'::"text"]))))
);


--
-- Name: COLUMN "mail_queue"."text"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."mail_queue"."text" IS 'Plain text alternative for email clients that do not support HTML (Apple Mail preview, etc.)';


--
-- Name: _mail_notification_probe("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_notification_probe"("p_kind" "text", "p_id" "uuid", "p_action" "text") RETURNS "public"."mail_queue"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE q public.mail_queue; info jsonb;
BEGIN
 q.created_by:=auth.uid();q.notification_source_kind:=p_kind;q.cooldown_action_key:=p_action;
 CASE p_kind
  WHEN 'friend' THEN q.notification_friendship_id:=p_id;SELECT token INTO q.notification_source_token FROM public.friendships WHERE id=p_id;
  WHEN 'subscription' THEN q.notification_subscription_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_subscriptions WHERE id=p_id;
  WHEN 'poll' THEN q.notification_poll_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.poll_tasks WHERE id=p_id;
  WHEN 'base' THEN q.notification_base_task_id:=p_id;SELECT token INTO q.notification_source_token FROM public.base_share_tasks WHERE id=p_id;
  WHEN 'device' THEN q.notification_device_share_id:=p_id;SELECT token INTO q.notification_source_token FROM public.control_device_shares WHERE id=p_id;
  WHEN 'copy' THEN q.notification_copy_offer_id:=p_id;SELECT token INTO q.notification_source_token FROM public.resource_copy_offers WHERE id=p_id;
  ELSE RETURN NULL;
 END CASE;
 info:=public._mail_notification_source_info(q);IF info IS NULL THEN RETURN NULL;END IF;
 q.to_email:=info->>'email';q.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(q.to_email));
 RETURN q;
END $$;


--
-- Name: _mail_notification_queue_live("public"."mail_queue"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_notification_queue_live"("q" "public"."mail_queue") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
BEGIN
 IF q.cooldown_action_key ~ '^(friend|poll|base|device|copy):' THEN
  RETURN public._mail_notification_source_live(q) AND EXISTS(SELECT 1 FROM public.mail_notification_allocations a WHERE a.id=q.notification_allocation_id
   AND a.consumed_queue_id=q.id AND a.consumed_at IS NOT NULL AND a.revoked_at IS NULL AND a.owner_id=q.created_by
   AND a.to_email=public._norm_email(q.to_email) AND a.source_kind=q.notification_source_kind AND a.source_token=q.notification_source_token
   AND a.snapshot=q.notification_snapshot AND a.friendship_id IS NOT DISTINCT FROM q.notification_friendship_id
   AND a.subscription_id IS NOT DISTINCT FROM q.notification_subscription_id AND a.poll_task_id IS NOT DISTINCT FROM q.notification_poll_task_id
   AND a.base_task_id IS NOT DISTINCT FROM q.notification_base_task_id AND a.device_share_id IS NOT DISTINCT FROM q.notification_device_share_id
   AND a.copy_offer_id IS NOT DISTINCT FROM q.notification_copy_offer_id);
 END IF;
 IF q.created_by IS NOT NULL OR q.notification_source_kind IS NOT NULL OR q.notification_allocation_id IS NOT NULL THEN RETURN false; END IF;
 IF q.cooldown_action_key='mail:center_verify' THEN RETURN public._mail_center_verification_live(q.mail_center_link_id,q.to_email); END IF;
 IF q.contact_source_expected OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id IS NOT NULL THEN
  RETURN public._mail_contact_source_live(q.contact_message_id,q.to_email,q.cooldown_action_key);
 END IF;
 RETURN public._contact_mail_enabled(q.to_email);
END $$;


--
-- Name: _mail_notification_source_info("public"."mail_queue"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_notification_source_info"("q" "public"."mail_queue") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE info jsonb;
BEGIN
 CASE q.notification_source_kind
 WHEN 'friend' THEN
  SELECT jsonb_build_object('owner_id',CASE WHEN f.decision_user_id=f.requester_id THEN f.addressee_id ELSE f.requester_id END,
   'recipient_id',f.decision_user_id,'email',public._norm_email(u.email),'friendship_id',f.id,'subscription_id',f.source_subscription_id,
   'active',f.status='pending' AND f.cancelled_at IS NULL AND (f.source_subscription_id IS NULL OR EXISTS(
    SELECT 1 FROM public.poll_subscriptions s WHERE s.id=f.source_subscription_id AND s.owner_id=f.requester_id
     AND coalesce(s.registered_user_id,s.subscriber_user_id)=f.addressee_id AND s.status IN('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL)),
   'snapshot',jsonb_build_object('source_subscription_id',f.source_subscription_id)) INTO info
  FROM public.friendships f JOIN auth.users u ON u.id=f.decision_user_id WHERE f.id=q.notification_friendship_id AND f.token=q.notification_source_token;
 WHEN 'subscription' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',coalesce(s.registered_user_id,s.subscriber_user_id),'email',public._norm_email(s.subscriber_email),
   'subscription_id',s.id,'active',s.status='pending' AND s.cancelled_at IS NULL AND s.declined_at IS NULL AND s.subscriber_user_id IS NULL
    AND s.registered_user_id IS NULL AND public._poll_registered_uid(s.subscriber_email) IS NULL,
   'snapshot',jsonb_build_object('subscriber_email',public._norm_email(s.subscriber_email))) INTO info
  FROM public.poll_subscriptions s WHERE s.id=q.notification_subscription_id AND s.token=q.notification_source_token;
 WHEN 'poll' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,'email',public._norm_email(CASE WHEN t.recipient_user_id IS NULL THEN t.recipient_email ELSE u.email END),
   'game_id',t.game_id,'friendship_id',t.source_friendship_id,'subscription_id',t.source_subscription_id,
   'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL AND g.owner_id=t.owner_id
    AND g.status::text='poll_open' AND g.type::text=t.poll_type AND g.share_key_poll=t.share_key_poll AND public._poll_task_source_active(t),
   'snapshot',jsonb_build_object('game_id',t.game_id,'poll_key',t.share_key_poll,'poll_type',t.poll_type)) INTO info
  FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id LEFT JOIN auth.users u ON u.id=t.recipient_user_id WHERE t.id=q.notification_poll_task_id AND t.token=q.notification_source_token;
 WHEN 'base' THEN
  SELECT jsonb_build_object('owner_id',t.owner_id,'recipient_id',t.recipient_user_id,'email',public._norm_email(u.email),'base_id',t.base_id,
   'friendship_id',t.source_friendship_id,'active',t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL
    AND t.created_at>clock_timestamp()-interval '5 days' AND b.owner_id=t.owner_id AND public._base_task_source_active(t),
   'snapshot',jsonb_build_object('base_id',t.base_id,'role',t.role)) INTO info
  FROM public.base_share_tasks t JOIN public.question_bases b ON b.id=t.base_id JOIN auth.users u ON u.id=t.recipient_user_id WHERE t.id=q.notification_base_task_id AND t.token=q.notification_source_token;
 WHEN 'device' THEN
  SELECT jsonb_build_object('owner_id',s.owner_id,'recipient_id',s.recipient_id,'email',public._norm_email(CASE WHEN s.recipient_id IS NULL THEN s.recipient_email ELSE u.email END),
   'game_id',s.game_id,'session_id',s.session_id,'active',s.revoked_at IS NULL AND g.owner_id=s.owner_id AND rs.game_id=s.game_id AND rs.owner_id=s.owner_id
    AND rs.ended_at IS NULL AND rs.expires_at>clock_timestamp() AND rs.last_activity_at>clock_timestamp()-interval '1 hour',
   'snapshot',jsonb_build_object('game_id',s.game_id,'session_id',s.session_id,'device_type',s.device_type)) INTO info
  FROM public.control_device_shares s JOIN public.games g ON g.id=s.game_id JOIN public.control_runtime_sessions rs ON rs.id=s.session_id
   LEFT JOIN auth.users u ON u.id=s.recipient_id WHERE s.id=q.notification_device_share_id AND s.token=q.notification_source_token;
 WHEN 'copy' THEN
  SELECT jsonb_build_object('owner_id',o.sender_identity,'recipient_id',o.recipient_id,'email',public._norm_email(u.email),
   'active',o.status='pending' AND o.created_at+interval '5 days'>clock_timestamp(),
   'snapshot',jsonb_build_object('offer_id',o.id,'resource_kind',o.resource_kind,'name',o.name)) INTO info
  FROM public.resource_copy_offers o JOIN auth.users u ON u.id=o.recipient_id
  WHERE o.id=q.notification_copy_offer_id AND o.token=q.notification_source_token;
 ELSE RETURN NULL;
 END CASE;
 RETURN info;
END $$;


--
-- Name: _mail_notification_source_live("public"."mail_queue"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_notification_source_live"("q" "public"."mail_queue") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE info jsonb; owner_id uuid; recipient_id uuid; mailbox text;
BEGIN
 IF NOT public._mail_notification_action_matches(q.notification_source_kind,q.cooldown_action_key) THEN RETURN false; END IF;
 info:=public._mail_notification_source_info(q);
 IF info IS NULL OR info->>'active' IS DISTINCT FROM 'true' OR q.notification_snapshot IS NULL THEN RETURN false; END IF;
 owner_id:=(info->>'owner_id')::uuid;recipient_id:=(info->>'recipient_id')::uuid;mailbox:=info->>'email';
 IF q.created_by IS DISTINCT FROM owner_id OR public._norm_email(q.to_email) IS DISTINCT FROM mailbox
  OR q.notification_snapshot->'resource' IS DISTINCT FROM info->'snapshot'
  OR (q.notification_snapshot->>'recipient_id')::uuid IS DISTINCT FROM recipient_id
  OR (q.notification_snapshot->>'identity_id')::uuid IS DISTINCT FROM public._poll_registered_uid(mailbox) THEN RETURN false; END IF;
 IF q.notification_source_kind<>'copy' AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=owner_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 IF recipient_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=recipient_id AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN false; END IF;
 RETURN public._contact_mail_enabled(mailbox);
END $$;


--
-- Name: _mail_notification_source_lock("public"."mail_queue"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_notification_source_lock"("q" "public"."mail_queue") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE before_info jsonb; after_info jsonb; ids uuid[]; mails text[]; mailbox text; f public.friendships; s public.poll_subscriptions;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   before_info:=public._mail_notification_source_info(q);
   IF before_info IS NULL THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
   SELECT * INTO f FROM public.friendships WHERE id=(before_info->>'friendship_id')::uuid;
   SELECT * INTO s FROM public.poll_subscriptions WHERE id=(before_info->>'subscription_id')::uuid;
   SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(ARRAY[q.created_by,(before_info->>'owner_id')::uuid,(before_info->>'recipient_id')::uuid,
     public._poll_registered_uid(before_info->>'email'),f.requester_id,f.addressee_id,s.owner_id,s.registered_user_id,s.subscriber_user_id]) AS roots(id) WHERE id IS NOT NULL;
   PERFORM 1 FROM auth.users WHERE id=ANY(ids) ORDER BY id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.profiles WHERE id=ANY(ids) ORDER BY id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.user_flags WHERE user_id=ANY(ids) ORDER BY user_id FOR SHARE NOWAIT;
   SELECT array_agg(DISTINCT mail ORDER BY mail) INTO mails FROM unnest(ARRAY[public._norm_email(q.to_email),public._norm_email(before_info->>'email'),public._norm_email(s.subscriber_email)]) AS roots(mail) WHERE mail IS NOT NULL;
   FOREACH mailbox IN ARRAY coalesce(mails,'{}'::text[]) LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('poll-email-identity:'||mailbox,351)) THEN RAISE EXCEPTION 'mail identity busy' USING ERRCODE='55P03'; END IF;
   END LOOP;
   PERFORM 1 FROM public.email_unsub_tokens WHERE public._norm_email(email)=ANY(mails) ORDER BY email FOR SHARE NOWAIT;
   IF f.id IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,f.addressee_id)::text||':'||GREATEST(f.requester_id,f.addressee_id)::text,329)) THEN RAISE EXCEPTION 'friend pair busy' USING ERRCODE='55P03'; END IF;
   IF s.id IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended(s.owner_id::text||':email:'||public._norm_email(s.subscriber_email),333)) THEN RAISE EXCEPTION 'subscriber pair busy' USING ERRCODE='55P03'; END IF;
   PERFORM 1 FROM public.games WHERE id=(before_info->>'game_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.question_bases WHERE id=(before_info->>'base_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.control_runtime_sessions WHERE id=(before_info->>'session_id')::uuid FOR SHARE NOWAIT;
   PERFORM 1 FROM public.poll_subscriptions WHERE id=s.id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.friendships WHERE id=f.id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.poll_tasks WHERE id=q.notification_poll_task_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.base_share_tasks WHERE id=q.notification_base_task_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.control_device_shares WHERE id=q.notification_device_share_id FOR SHARE NOWAIT;
   after_info:=public._mail_notification_source_info(q);
   IF before_info IS DISTINCT FROM after_info THEN RAISE EXCEPTION 'source parents changed' USING ERRCODE='55P03'; END IF;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: _mail_original361_base_share_create("uuid", "uuid", "public"."base_share_role", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_base_share_create"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role", "p_from_friend" boolean, "p_requested_email" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); owner uuid; title text; label text; email text;
 target text; allowed boolean; deadline timestamptz; enabled boolean; t public.base_share_tasks%rowtype; source_friend uuid;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN QUERY SELECT false,'auth required',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 SELECT b.owner_id,b.name INTO owner,title FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR owner<>uid THEN RETURN QUERY SELECT false,'not_owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 IF p_role IS NULL THEN RETURN QUERY SELECT false,'invalid_role',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 IF p_recipient_user_id=uid THEN RETURN QUERY SELECT false,'owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 SELECT public._norm_email(u.email) INTO email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=p_recipient_user_id AND NOT p.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF NOT FOUND THEN RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[email],ARRAY[uid,p_recipient_user_id]);
 SELECT public._norm_email(u.email) INTO email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=p_recipient_user_id AND NOT p.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF NOT FOUND THEN RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 PERFORM public._poll_identity_mail_locks(ARRAY[email]);
 IF p_requested_email IS NOT NULL AND public._poll_registered_uid(p_requested_email) IS DISTINCT FROM p_recipient_user_id THEN
  RETURN QUERY SELECT false,'unknown_user',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN;
 END IF;
 IF p_from_friend THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(uid,p_recipient_user_id)::text||':'||GREATEST(uid,p_recipient_user_id)::text,329));
  SELECT f.id INTO source_friend FROM public.friendships f WHERE f.status='active' AND f.cancelled_at IS NULL
   AND ((f.requester_id=uid AND f.addressee_id=p_recipient_user_id) OR (f.addressee_id=uid AND f.requester_id=p_recipient_user_id)) FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'not_friend',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_recipient_user_id);
 SELECT b.name INTO title FROM public.question_bases b WHERE id=p_base_id AND b.owner_id=uid FOR KEY SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'not_owner',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 DELETE FROM public.base_share_tasks bt WHERE bt.base_id=p_base_id AND bt.recipient_user_id=p_recipient_user_id
 AND bt.status IN ('pending','opened','declined')
 AND coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')<=now();
 IF EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=p_recipient_user_id) THEN
   RETURN QUERY SELECT false,'already_active',NULL::text,NULL::text,title,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.base_share_tasks bt WHERE bt.base_id=p_base_id AND bt.owner_id=uid AND bt.recipient_user_id=p_recipient_user_id
 AND bt.status IN ('pending','opened') AND bt.cancelled_at IS NULL
 AND coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')>now()) THEN
   RETURN QUERY SELECT false,'already_pending',NULL::text,NULL::text,title,NULL::text,NULL::timestamptz,p_recipient_user_id; RETURN; END IF;
 deadline:=public._base_share_refusal_until(p_base_id,p_recipient_user_id);
 IF deadline IS NOT NULL THEN RETURN QUERY SELECT false,'declined',NULL::text,NULL::text,title,NULL::text,deadline,p_recipient_user_id; RETURN; END IF;
 enabled:=public._contact_mail_enabled(email);
 target:='pair:'||uid||':'||p_recipient_user_id||':base:'||p_base_id;
 IF enabled THEN
   SELECT c.ok,c.next_allowed_at INTO allowed,deadline FROM public.mail_cooldown_reserve('base:share',target) c;
   IF NOT allowed THEN RETURN QUERY SELECT false,'cooldown',NULL::text,NULL::text,title,NULL::text,deadline,p_recipient_user_id; RETURN; END IF;
 END IF;
 SELECT coalesce(nullif(p.username,''),u.email) INTO label FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=uid;
 INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,email_sent_at,email_send_count,source_kind,source_friendship_id)
 VALUES(uid,p_base_id,p_recipient_user_id,email,p_role,'pending',CASE WHEN enabled THEN now() END,CASE WHEN enabled THEN 1 ELSE 0 END,CASE WHEN p_from_friend THEN 'friend' ELSE 'base' END,source_friend)
 RETURNING * INTO t;
 RETURN QUERY SELECT true,NULL::text,CASE WHEN enabled THEN email END,'/go/?b='||t.token,title,label,NULL::timestamptz,p_recipient_user_id;
END; $$;


--
-- Name: _mail_original361_base_share_resend("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_base_share_resend"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.base_share_tasks%rowtype; b public.question_bases%rowtype;
 email text; label text; target text; allowed boolean; deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR t.status NOT IN ('pending','opened') OR t.cancelled_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','not_pending'); END IF;
 SELECT * INTO b FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id;
 IF NOT FOUND OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')<=now() THEN
   RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 SELECT public._norm_email(u.email) INTO email FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=t.recipient_user_id AND NOT p.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','unknown_user'); END IF;
 IF NOT public._contact_mail_enabled(email) THEN RETURN jsonb_build_object('ok',true,'mail_allowed',false); END IF;
 target:='pair:'||t.owner_id||':'||t.recipient_user_id||':base:'||t.base_id;
 SELECT ok,next_allowed_at INTO allowed,deadline FROM public.mail_cooldown_reserve('base:share',target);
 IF NOT allowed THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',deadline); END IF;
 UPDATE public.base_share_tasks SET email_sent_at=now(),email_send_count=email_send_count+1 WHERE id=t.id;
 SELECT coalesce(nullif(p.username,''),p.email) INTO label FROM public.profiles p WHERE id=t.owner_id;
 RETURN jsonb_build_object('ok',true,'mail_allowed',true,'mail_to',email,'mail_link','/go/?b='||t.token,
   'base_name',b.name,'owner_label',label,'recipient_id',t.recipient_user_id,'base_id',t.base_id);
END; $$;


--
-- Name: _mail_original361_control_device_share_create("uuid", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_control_device_share_create"("p_game_id" "uuid", "p_device_type" "text", "p_recipient_user_id" "uuid" DEFAULT NULL::"uuid", "p_recipient_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
DECLARE
  v_uid uuid:=auth.uid(); v_owner uuid; v_session public.control_runtime_sessions;
  v_recipient uuid:=p_recipient_user_id; v_email text:=lower(trim(coalesce(p_recipient_email,'')));
  v_created public.control_device_shares; v_existing public.control_device_shares;
  v_target text; v_mail_email text; v_flag boolean:=true; v_mail_allowed boolean:=false; v_until timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  IF (p_recipient_user_id IS NOT NULL) = (p_recipient_email IS NOT NULL) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_required');
  END IF;
  IF p_recipient_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_email');
  END IF;

  IF v_email<>'' THEN v_recipient:=public._poll_registered_uid(v_email); END IF;
  PERFORM 1 FROM auth.users WHERE id=ANY(ARRAY[v_uid,v_recipient]) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF v_email<>'' AND public._poll_registered_uid(v_email) IS DISTINCT FROM v_recipient THEN RETURN jsonb_build_object('ok',false,'error','recipient_changed'); END IF;
  SELECT public._norm_email(u.email) INTO v_mail_email FROM auth.users u WHERE u.id=v_recipient;
  PERFORM public._poll_identity_email_refs(ARRAY[nullif(v_email,''),v_mail_email],ARRAY[v_uid,v_recipient]);
  IF v_email<>'' AND public._poll_registered_uid(v_email) IS DISTINCT FROM v_recipient THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_changed');
  END IF;
  IF v_recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_recipient AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_not_found');
  END IF;
  IF v_recipient IS NULL AND NOT public._contact_mail_enabled(v_email) THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  SELECT * INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND owner_id=v_uid AND ended_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;

  IF v_recipient IS NOT NULL AND v_recipient=v_uid THEN RETURN jsonb_build_object('ok',false,'error','self_share'); END IF;
  IF v_recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_recipient) THEN
    RETURN jsonb_build_object('ok',false,'error','recipient_not_found');
  END IF;
  IF v_recipient IS NOT NULL THEN v_email:=''; END IF;

  SELECT * INTO v_existing FROM public.control_device_shares
  WHERE session_id=v_session.id AND device_type=p_device_type AND revoked_at IS NULL
    AND ((v_recipient IS NOT NULL AND recipient_id=v_recipient)
      OR (v_recipient IS NULL AND lower(recipient_email)=v_email))
  LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'created',false,'share_id',v_existing.id,
      'token',v_existing.token,'recipient_id',v_existing.recipient_id,
      'recipient_email',v_existing.recipient_email,'mail_allowed',false);
  END IF;

  INSERT INTO public.control_device_shares(session_id,game_id,owner_id,recipient_id,recipient_email,device_type)
  VALUES(v_session.id,p_game_id,v_uid,v_recipient,CASE WHEN v_recipient IS NULL THEN v_email END,p_device_type)
  RETURNING * INTO v_created;

  IF v_recipient IS NOT NULL THEN
    SELECT public._norm_email(u.email) INTO v_mail_email FROM auth.users u WHERE u.id=v_recipient;
    v_flag:=public._contact_mail_enabled(v_mail_email);
    v_target:='pair:'||v_uid::text||':'||v_recipient::text||':device:'||p_device_type||':game:'||p_game_id::text;
  ELSE
    v_flag:=public._contact_mail_enabled(v_email);
    v_target:='pair:'||v_uid::text||':'||md5(v_email)||':device:'||p_device_type||':game:'||p_game_id::text;
  END IF;
  IF v_flag THEN
    SELECT ok,next_allowed_at INTO v_mail_allowed,v_until
      FROM public.mail_cooldown_reserve('device:share',v_target);
  END IF;
  RETURN jsonb_build_object('ok',true,'created',true,'share_id',v_created.id,'token',v_created.token,
    'recipient_id',v_created.recipient_id,'recipient_email',v_created.recipient_email,
    'mail_allowed',v_mail_allowed,'mail_to',CASE WHEN v_flag THEN coalesce(v_mail_email,nullif(v_email,'')) END,'mail_disabled',NOT v_flag,
    'cooldown_until',v_until,'cooldown_target_key',v_target);
END;
$_$;


--
-- Name: _mail_original361_friends_invite("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_friends_invite"("p_handle" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_h        text := trim(coalesce(p_handle, ''));
  v_is_email boolean := position('@' in trim(coalesce(p_handle, ''))) > 1;
  v_prof     public.profiles%rowtype;
  v_ex       public.friendships%rowtype;
  v_target   text;
  v_auth_email text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_id       uuid;
  v_token    uuid;
  v_enabled boolean; v_prev_count integer:=0; v_prev_sent timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  IF v_h = '' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'empty handle');
  END IF;

  SELECT p.* INTO v_prof
  FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE ((v_is_email AND p.id=public._poll_registered_uid(v_h))
      OR (NOT v_is_email AND lower(p.username)=lower(v_h)))
    AND NOT p.is_guest AND public._norm_email(u.email) IS NOT NULL
    AND public._poll_identity_regular(u.id,to_jsonb(u));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'unknown_user', 'has_email_only', v_is_email);
  END IF;

  IF v_prof.id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'err', 'self');
  END IF;

  SELECT public._norm_email(email) INTO v_prof.email FROM auth.users WHERE id=v_prof.id;
  PERFORM public._poll_identity_email_refs(ARRAY[v_prof.email],ARRAY[v_uid,v_prof.id]);
  SELECT public._norm_email(email) INTO v_auth_email FROM auth.users WHERE id=v_prof.id;
  IF v_auth_email IS DISTINCT FROM v_prof.email OR
     (v_is_email AND public._poll_registered_uid(v_h) IS DISTINCT FROM v_prof.id) THEN
    RETURN jsonb_build_object('ok',false,'err','unknown_user','has_email_only',v_is_email);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(v_uid,v_prof.id)::text||':'||GREATEST(v_uid,v_prof.id)::text,329));
  PERFORM public._subscriber_pair_lock(v_uid,v_prof.email);
  v_cd_until:=public._subscriber_refusal_until(v_uid,v_prof.email);
  IF v_cd_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','after_reject');
  END IF;
  SELECT * INTO v_ex
  FROM public.friendships f
  WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(v_uid, v_prof.id)
    AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(v_uid, v_prof.id);

  -- Both directions refer to the same relationship and refusal.
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.cancelled_at IS NULL AND (v_ex.status<>'declined' OR v_ex.declined_at>now()-interval '30 days') THEN
      RETURN jsonb_build_object('ok',false,'err','already','id',v_ex.id,
        'status',v_ex.status,'direction',CASE WHEN v_ex.status='active' THEN 'friend'
          WHEN v_ex.decision_user_id=v_uid THEN 'incoming' ELSE 'outgoing' END);
    END IF;
    IF v_ex.declined_at>now()-interval '30 days' THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_ex.declined_at+interval '30 days','reason','after_reject');
    END IF;
    IF v_ex.email_sent_at>now()-interval '30 days' THEN
      v_prev_count:=v_ex.email_send_count; v_prev_sent:=v_ex.email_sent_at;
    END IF;
  END IF;
  v_target := 'pair:' || v_uid::text || ':' || v_prof.id::text;
  SELECT max(next_allowed_at) INTO v_cd_until FROM public.mail_cooldowns
   WHERE action_key='friend:invite_after_reject' AND next_allowed_at>now()
   AND target_key IN (v_target,'pair:'||v_prof.id||':'||v_uid);
  IF v_cd_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','after_reject');
  END IF;
  v_enabled:=public._contact_mail_enabled(v_prof.email);
  IF v_enabled THEN
    v_cd_until:=public._friend_mail_limit_until(v_uid,v_prof.id);
    IF v_cd_until>now() THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','mail_limit');
    END IF;
    SELECT greatest(max(next_allowed_at),v_prev_sent+interval '5 days') INTO v_cd_until
     FROM public.mail_cooldowns WHERE action_key IN ('friend:invite','friend:resend')
     AND target_key IN (v_target,'pair:'||v_prof.id||':'||v_uid);
    IF v_cd_until>now() THEN
      RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_cd_until,'reason','invite');
    END IF;
  END IF;
  -- Delete only after all checks; copy the still-valid budget to the new token.
  IF v_ex.id IS NOT NULL THEN DELETE FROM public.friendships WHERE id=v_ex.id; END IF;
  BEGIN
    INSERT INTO public.friendships(requester_id,addressee_id,status,email_sent_at,email_send_count)
    VALUES(v_uid,v_prof.id,'pending',CASE WHEN v_enabled THEN now() ELSE v_prev_sent END,
      v_prev_count+CASE WHEN v_enabled THEN 1 ELSE 0 END)
    RETURNING id,token INTO v_id,v_token;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok',false,'err','already');
  END;
  IF v_enabled THEN PERFORM public.mail_cooldown_reserve('friend:invite',v_target); END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                            'to', v_prof.email, 'mail_allowed', v_enabled,
                            'accepted', false, 'status', 'pending');
END;
$$;


--
-- Name: _mail_original361_friends_resend("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_friends_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_f        public.friendships%rowtype;
  v_to       text;
  v_target   text;
  v_cd_ok    boolean;
  v_cd_until timestamptz;
  v_lim      timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;

  v_f:=public._friend_locked(p_id);
  IF v_f.id IS NULL OR v_f.decision_user_id=v_uid OR v_f.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  IF v_f.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'err',CASE WHEN v_f.status='declined' THEN 'declined' ELSE 'not_pending' END);
  END IF;

  SELECT public._norm_email(u.email) INTO v_to FROM auth.users u WHERE u.id=v_f.decision_user_id;
  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok', true, 'mail_allowed', false);
  END IF;

  IF v_f.email_sent_at>now()-interval '5 days' THEN
    RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_f.email_sent_at+interval '5 days');
  END IF;
  v_lim := public._friend_mail_limit_until(v_uid, v_f.decision_user_id);
  IF v_lim IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_lim, 'reason', 'mail_limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' || v_f.decision_user_id::text;
  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:invite', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  SELECT c.ok, c.next_allowed_at INTO v_cd_ok, v_cd_until
  FROM public.mail_cooldown_check('friend:resend', v_target) c;
  IF NOT v_cd_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_cd_until);
  END IF;

  SELECT public._norm_email(u.email) INTO v_to FROM auth.users u WHERE u.id=v_f.decision_user_id;
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this user');
  END IF;

  UPDATE public.friendships
     SET email_sent_at = now(), email_send_count = email_send_count + 1
   WHERE id = p_id;

  PERFORM public.mail_cooldown_reserve('friend:resend', v_target);

  RETURN jsonb_build_object('ok', true, 'to', v_to, 'kind', 'friend_invite',
                            'link', 'go?f=' || v_f.token::text, 'token', v_f.token);
END;
$$;


--
-- Name: _mail_original361_poll_share_remind("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_poll_share_remind"("p_game_id" "uuid", "p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  g record;
  t public.poll_tasks%rowtype;
  v_to text;
  v_target text;
  v_ok boolean;
  v_until timestamptz;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  SELECT * INTO t FROM public.poll_tasks WHERE id=p_task_id AND game_id=p_game_id AND owner_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
  PERFORM public._poll_identity_email_refs(ARRAY[t.recipient_email],ARRAY[v_uid,t.recipient_user_id]);
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
  IF t.share_key_poll IS DISTINCT FROM g.share_key_poll THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task expired');
  END IF;

  IF NOT public._poll_task_source_active(t) THEN RETURN jsonb_build_object('ok',false,'err','task expired'); END IF;
  v_to:=public._norm_email(coalesce(t.recipient_email,(SELECT u.email FROM auth.users u WHERE u.id=t.recipient_user_id)));
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this recipient');
  END IF;

  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok',true,'mail_allowed',false,'mail','[]'::jsonb);
  END IF;
  IF t.reminder_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'err', 'reminder limit');
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
    'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text,
    'game_name', g.name, 'poll_type', t.poll_type,
    'reminder_count', t.reminder_count + 1,
    'mail', jsonb_build_array(jsonb_build_object(
      'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text))
  );
END $$;


--
-- Name: _mail_original361_poll_share_send("uuid", "uuid"[], "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_poll_share_send"("p_game_id" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_game public.games%rowtype; r record;
  v_target text; v_ok boolean; v_until timestamptz; v_id uuid; v_token uuid;
  v_mail_enabled boolean;
  v_created int:=0; v_kept int:=0; v_blocked int:=0; v_mail jsonb:='[]';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  PERFORM public._poll_share_contact_locks(v_uid,p_friend_ids,p_subscriber_ids);
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','game not found'); END IF;
  IF v_game.type::text NOT IN ('poll_text','poll_points') OR v_game.status::text<>'poll_open' THEN
    RETURN jsonb_build_object('ok',false,'err','poll not open');
  END IF;
  FOR r IN
    SELECT p.id AS user_id,(SELECT public._norm_email(email) FROM auth.users WHERE id=p.id) AS email,NULL::uuid AS source_subscription_id FROM public.profiles p
      WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND NOT p.is_guest AND public.are_friends(v_uid,p.id)
    UNION
    SELECT NULL::uuid,lower(trim(s.subscriber_email)),s.id AS source_subscription_id FROM public.poll_subscriptions s
      WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[])) AND s.owner_id=v_uid
        AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND s.status='active'
        AND public._poll_registered_uid(s.subscriber_email) IS NULL
  LOOP
    IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.owner_id=v_uid AND t.game_id=p_game_id
      AND t.share_key_poll=v_game.share_key_poll AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL) AND (t.recipient_user_id=r.user_id OR lower(trim(t.recipient_email))=r.email)) THEN
      v_kept:=v_kept+1; CONTINUE;
    END IF;
    v_target:='pair:'||v_uid::text||':'||coalesce(r.user_id::text,'email:'||md5(r.email))||':game:'||p_game_id::text;
    v_mail_enabled:=public._contact_mail_enabled(r.email);
    IF r.user_id IS NULL AND NOT v_mail_enabled THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    IF v_mail_enabled THEN
    v_until:=public._poll_daily_cap_until(v_uid,r.email);
    SELECT ok INTO v_ok FROM public.mail_cooldown_check('poll:share',v_target);
    IF NOT v_ok OR v_until IS NOT NULL THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    SELECT ok INTO v_ok FROM public.mail_cooldown_reserve('poll:share',v_target);
    IF NOT v_ok THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    END IF;
    INSERT INTO public.poll_tasks(owner_id,recipient_user_id,recipient_email,game_id,poll_type,share_key_poll,token,status,source_subscription_id)
      VALUES(v_uid,r.user_id,CASE WHEN r.user_id IS NULL THEN r.email END,p_game_id,v_game.type::text,v_game.share_key_poll,gen_random_uuid(),'pending',r.source_subscription_id)
      RETURNING id,token INTO v_id,v_token;
    v_created:=v_created+1;
    IF v_mail_enabled THEN
    v_mail:=v_mail||jsonb_build_array(jsonb_build_object('task_id',v_id,'to',r.email,'token',v_token,'link','/go/?t='||v_token::text));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'created',v_created,'kept',v_kept,'blocked',v_blocked,'mail',v_mail);
END; $$;


--
-- Name: _mail_original361_polls_hub_subscriber_resend("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_mail_original361_polls_hub_subscriber_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); s public.poll_subscriptions%rowtype;
 v_to text; v_target text; v_ok boolean; v_until timestamptz; v_unsub uuid;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[s.subscriber_email],ARRAY[v_uid,s.subscriber_user_id,s.registered_user_id]);
 v_to:=public._norm_email(s.subscriber_email);
 IF v_to IS NULL AND s.subscriber_user_id IS NOT NULL THEN
   SELECT public._norm_email(email) INTO v_to FROM auth.users WHERE id=s.subscriber_user_id;
 END IF;
 IF v_to IS NULL THEN RETURN jsonb_build_object('ok',false,'err','no email for this subscriber'); END IF;
 -- Serialize the budget across separate historical rows for this same pair.
 PERFORM public._subscriber_pair_lock(v_uid,v_to);
 SELECT * INTO s FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not found'); END IF;
 IF s.status<>'pending' OR s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','only pending can be resent');
 END IF;
 IF s.registered_user_id IS NOT NULL OR s.subscriber_user_id IS NOT NULL OR public._poll_registered_uid(v_to) IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','has_account');
 END IF;
 v_until:=public._subscriber_refusal_until(v_uid,v_to);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','after_reject'); END IF;
 IF NOT public._contact_mail_enabled(v_to) THEN
   RETURN jsonb_build_object('ok',true,'mail_allowed',false);
 END IF;
 v_target:='pair:'||v_uid::text||':email:'||md5(v_to);
 v_until:=public._poll_sub_mail_limit_until(v_uid,NULL,v_to);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','mail_limit'); END IF;
 -- The first delivery follows the initial invitation reservation. Later ones
 -- must honor that reservation as well as the reminder reservation.
 IF s.email_send_count>0 THEN
   SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite',v_target);
   IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 END IF;
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:resend',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_reserve('poll:resend',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 UPDATE public.poll_subscriptions SET email_sent_at=now(),email_send_count=email_send_count+1 WHERE id=s.id;
 v_unsub:=public._ensure_unsub_token(v_to);
 RETURN jsonb_build_object('ok',true,'mail_allowed',true,'to',v_to,'kind','sub_invite',
   'link','/go/?s='||s.token,'token',s.token,'registered',false,'unsub_token',v_unsub);
END; $$;


--
-- Name: _norm_email("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_norm_email"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select nullif(lower(btrim(p)), '');
$$;


--
-- Name: _poll_anon_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_anon_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NEW.share_key_poll IS DISTINCT FROM OLD.share_key_poll OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.type IS DISTINCT FROM OLD.type OR NEW.status::text<>'poll_open' THEN
  DELETE FROM public.poll_anonymous_limits WHERE game_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: _poll_anon_hash("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_anon_hash"("p_game" "uuid", "p_key" "text", "p_token" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT encode(sha256(convert_to(p_game::text||':'||p_key||':'||p_token,'UTF8')),'hex');
$$;


--
-- Name: _poll_assert_owner("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_assert_owner"("p_game_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
END $$;


--
-- Name: _poll_assert_voter("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_assert_voter"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 PERFORM public._poll_assert_voter_362_original(p_game_id,p_key,p_voter_token);
 IF left(p_voter_token,5)='task:' OR EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_anonymous_limits WHERE game_id=p_game_id
  AND key_hash=public._poll_anon_hash(p_game_id,p_key,'key')
  AND voter_hash=public._poll_anon_hash(p_game_id,p_key,p_voter_token) AND in_progress)
 THEN RAISE EXCEPTION 'anonymous_full_form_required'; END IF;
END $$;


--
-- Name: _poll_assert_voter_362_original("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_assert_voter_362_original"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text") RETURNS "void"
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
 IF NOT public._poll_task_source_active(t) THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.status NOT IN ('pending','opened') OR t.declined_at IS NOT NULL OR t.cancelled_at IS NOT NULL OR t.done_at IS NOT NULL THEN RAISE EXCEPTION 'Task unavailable'; END IF;
 IF t.recipient_user_id IS NOT NULL THEN
  IF auth.uid() IS DISTINCT FROM t.recipient_user_id THEN RAISE EXCEPTION 'Not your task'; END IF;
 ELSE
  registered:=public._poll_registered_uid(t.recipient_email);
  IF registered IS NOT NULL AND auth.uid() IS DISTINCT FROM registered THEN RAISE EXCEPTION 'Not your task'; END IF;
  IF registered IS NOT NULL THEN UPDATE public.poll_tasks SET recipient_user_id=registered,recipient_email=NULL WHERE id=t.id; END IF;
 END IF;
END; $$;


--
-- Name: _poll_bind_identity("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_bind_identity"("p_uid" "uuid", "p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE r record; s record;
BEGIN
 IF public._norm_email(p_email) IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id<>p_uid AND public._norm_email(email)=public._norm_email(p_email)) THEN RETURN; END IF;
 -- Identity precedes contact locks, contact rows precede task rows.
 FOR s IN SELECT DISTINCT owner_id FROM public.poll_subscriptions
  WHERE registered_user_id IS NULL AND identity_tracking_enabled AND subscriber_user_id IS NULL
   AND public._norm_email(subscriber_email)=public._norm_email(p_email) ORDER BY owner_id LOOP
  PERFORM public._subscriber_pair_lock(s.owner_id,p_email);
 END LOOP;
 UPDATE public.poll_subscriptions SET registered_user_id=p_uid
  WHERE registered_user_id IS NULL AND identity_tracking_enabled AND subscriber_user_id IS NULL
   AND public._norm_email(subscriber_email)=public._norm_email(p_email);
 FOR r IN SELECT id FROM public.poll_tasks WHERE recipient_user_id IS NULL
  AND public._norm_email(recipient_email)=public._norm_email(p_email) ORDER BY game_id,id FOR UPDATE LOOP
  UPDATE public.poll_tasks SET recipient_user_id=p_uid,recipient_email=NULL WHERE id=r.id AND recipient_user_id IS NULL;
 END LOOP;
END $$;


--
-- Name: _poll_daily_cap_until("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_daily_cap_until"("p_owner" "uuid", "p_email" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT created_at+interval '24 hours' FROM public.poll_mail_budget_events
 WHERE owner_id=p_owner AND recipient_key=md5(public._norm_email(p_email)) AND created_at>now()-interval '24 hours'
 ORDER BY created_at DESC OFFSET 2 LIMIT 1
$$;


--
-- Name: _poll_finish_tally("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_finish_tally"("p_game_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.poll_sessions
     SET is_open = false, closed_at = now()
   WHERE game_id = p_game_id AND is_open = true;

  DELETE FROM public.device_connect_codes WHERE game_id = p_game_id AND device_type = 'poll_qr';

  -- czekające zaproszenia kończą się razem z ankietą (zrobione / odrzucone zostają jako historia)
  DELETE FROM public.poll_tasks WHERE game_id = p_game_id AND status IN ('pending', 'opened');

  DELETE FROM public.poll_tally_drafts WHERE game_id = p_game_id;

  UPDATE public.games
     SET status = 'ready',
         poll_closed_at = now(),
         poll_ended_key = share_key_poll,
         share_key_poll = public.gen_share_key(18),
         updated_at = now()
   WHERE id = p_game_id;
END $$;


--
-- Name: _poll_identity_auth_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_identity_auth_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: _poll_identity_email_refs("text"[], "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_identity_email_refs"("p_emails" "text"[], "p_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: _poll_identity_mail_locks("text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_identity_mail_locks"("p_emails" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE e text;
BEGIN
 FOR e IN SELECT DISTINCT public._norm_email(x) FROM unnest(coalesce(p_emails,'{}'::text[])) x WHERE public._norm_email(x) IS NOT NULL ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('poll-email-identity:'||e,351));
 END LOOP;
END $$;


--
-- Name: _poll_identity_profile_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_identity_profile_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: _poll_identity_refs("uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_identity_refs"("p_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=ANY(coalesce(p_ids,'{}'::uuid[])) ORDER BY id FOR KEY SHARE;
 IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Not your task'; END IF;
END $$;


--
-- Name: _poll_identity_regular("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_identity_regular"("p_uid" "uuid", "p_identity" "jsonb") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT NOT coalesce((SELECT p.is_guest FROM public.profiles p WHERE p.id=p_uid),
   coalesce(p_identity->>'is_anonymous','false')='true' OR coalesce(p_identity->'raw_user_meta_data'->>'is_guest','false')='true')
 AND NOT(coalesce(p_identity->>'is_anonymous','false')='true' AND
   ((p_identity->>'email_confirmed_at') IS NULL OR public._norm_email(p_identity->>'email') IS NULL));
$$;


--
-- Name: _poll_identity_task_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_identity_task_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE holder uuid; src public.poll_subscriptions%rowtype; ids uuid[];
BEGIN
 PERFORM public._poll_identity_email_refs(ARRAY[NEW.recipient_email],ARRAY[NEW.owner_id,NEW.recipient_user_id,auth.uid()]);
 IF NEW.source_subscription_id IS NOT NULL THEN
  SELECT * INTO src FROM public.poll_subscriptions WHERE id=NEW.source_subscription_id FOR SHARE;
  IF NOT FOUND OR src.owner_id IS DISTINCT FROM NEW.owner_id OR src.status<>'active' OR src.cancelled_at IS NOT NULL OR src.declined_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid contact source'; END IF;
  holder:=coalesce(src.registered_user_id,src.subscriber_user_id,public._poll_registered_uid(src.subscriber_email));
  IF NEW.recipient_user_id IS NOT NULL AND holder IS DISTINCT FROM NEW.recipient_user_id THEN RAISE EXCEPTION 'Wrong contact recipient'; END IF;
  IF NEW.recipient_email IS NOT NULL AND (public._norm_email(NEW.recipient_email) IS DISTINCT FROM public._norm_email(src.subscriber_email)
    OR(holder IS NOT NULL AND holder IS DISTINCT FROM public._poll_registered_uid(NEW.recipient_email))) THEN RAISE EXCEPTION 'Wrong contact recipient'; END IF;
  UPDATE public.poll_subscriptions SET identity_tracking_enabled=true,registered_user_id=coalesce(registered_user_id,holder) WHERE id=src.id AND (NOT identity_tracking_enabled OR (registered_user_id IS NULL AND holder IS NOT NULL));
 ELSIF NEW.recipient_user_id IS NOT NULL AND NEW.source_friendship_id IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(NEW.owner_id,NEW.recipient_user_id)::text||':'||GREATEST(NEW.owner_id,NEW.recipient_user_id)::text,329));
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.friendships WHERE status='active'
   AND((requester_id=NEW.owner_id AND addressee_id=NEW.recipient_user_id) OR(addressee_id=NEW.owner_id AND requester_id=NEW.recipient_user_id));
  IF cardinality(ids)>1 THEN RAISE EXCEPTION 'Ambiguous friendship source'; END IF;
  NEW.source_friendship_id:=ids[1];
 END IF;
 IF NEW.recipient_user_id IS NULL AND NEW.recipient_email IS NOT NULL THEN
  holder:=public._poll_registered_uid(NEW.recipient_email);
  IF holder IS NOT NULL THEN NEW.recipient_user_id:=holder;NEW.recipient_email:=NULL; END IF;
 END IF;
 IF NEW.source_friendship_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.friendships
  WHERE id=NEW.source_friendship_id AND status='active' AND cancelled_at IS NULL AND ((requester_id=NEW.owner_id AND addressee_id=NEW.recipient_user_id) OR(addressee_id=NEW.owner_id AND requester_id=NEW.recipient_user_id))) THEN RAISE EXCEPTION 'Invalid friendship source'; END IF;
 NEW.source_kind:=CASE WHEN NEW.source_subscription_id IS NOT NULL THEN 'subscriber' WHEN NEW.source_friendship_id IS NOT NULL THEN 'friend' ELSE 'game' END;
 IF NOT public._poll_task_source_active(NEW) THEN RAISE EXCEPTION 'Invalid contact source'; END IF;
 RETURN NEW;
END $$;


--
-- Name: _poll_mail_cooldown_until("uuid", "uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_mail_cooldown_until"("p_owner" "uuid", "p_user" "uuid", "p_email" "text", "p_game" "uuid") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT greatest(
  (SELECT max(next_allowed_at) FROM public.mail_cooldowns WHERE action_key='poll:share'
   AND target_key='pair:'||p_owner||':'||coalesce(p_user::text,'email:'||md5(public._norm_email(p_email)))||':game:'||p_game
   AND next_allowed_at>now()), public._poll_daily_cap_until(p_owner,p_email))
 WHERE public._contact_mail_enabled(p_email)
$$;


--
-- Name: _poll_open_unchecked("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_open_unchecked"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
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
-- Name: _poll_points_close_unchecked("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_points_close_unchecked"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
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

  -- 315: normalizacja (0 głosów liczone jako 1, suma 100, min 1) we wspólnej funkcji
  perform public._poll_points_normalize(p_game_id);

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


--
-- Name: _poll_points_normalize("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_points_normalize"("p_game_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
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
end;
$$;


--
-- Name: _poll_registered_uid("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_registered_uid"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE ids uuid[];
BEGIN
 SELECT array_agg(u.id ORDER BY u.id) INTO ids FROM auth.users u
 WHERE public._norm_email(u.email)=public._norm_email(p_email) AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF coalesce(cardinality(ids),0)>1 THEN RAISE EXCEPTION 'Ambiguous task recipient'; END IF;
 RETURN ids[1];
END $$;


--
-- Name: _poll_share_contact_locks("uuid", "uuid"[], "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_share_contact_locks"("p_owner" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "void"
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


--
-- Name: _poll_sub_mail_limit_until("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_sub_mail_limit_until"("p_owner" "uuid", "p_user" "uuid", "p_email" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE WHEN coalesce(sum(s.email_send_count), 0) >= 2
              THEN max(s.email_sent_at) + interval '30 days' END
  FROM public.poll_subscriptions s
  WHERE s.owner_id = p_owner
    AND ((p_user IS NOT NULL AND s.subscriber_user_id = p_user)
      OR (p_email IS NOT NULL AND lower(s.subscriber_email) = lower(p_email)))
    AND s.email_sent_at > now() - interval '30 days'
$$;


--
-- Name: _poll_task_change("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_task_change"("p_token" "uuid", "p_action" "text") RETURNS "text"
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
 IF NOT public._poll_task_source_active(t) THEN RETURN 'expired'; END IF;
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


--
-- Name: _poll_task_cleanup_partial_votes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_task_cleanup_partial_votes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF OLD.done_at IS NULL AND OLD.status<>'done'
 AND (TG_OP='DELETE' OR NEW.status IN ('declined','cancelled')) THEN
  DELETE FROM public.poll_votes WHERE game_id=OLD.game_id AND voter_token=public.poll_task_voter_token(OLD.id);
  DELETE FROM public.poll_text_entries WHERE game_id=OLD.game_id AND voter_token=public.poll_task_voter_token(OLD.id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


--
-- Name: _poll_task_finish_batch("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_task_finish_batch"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE tid uuid;
BEGIN
 IF left(p_voter_token,5)<>'task:' THEN RETURN; END IF;
 -- Zachowujemy SHARE rodzica → UPDATE potomka, bez upgrade rodzica do UPDATE.
 PERFORM public._poll_assert_voter(p_game_id,p_key,p_voter_token);
 tid:=substring(p_voter_token FROM 6)::uuid;
 IF public._poll_task_has_all_votes(tid) THEN
  UPDATE public.poll_tasks SET status='done',done_at=now(),opened_at=coalesce(opened_at,now()) WHERE id=tid;
 END IF;
END; $$;


--
-- Name: _poll_task_has_all_votes("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_task_has_all_votes"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.questions WHERE game_id=t.game_id)
 AND NOT EXISTS(SELECT 1 FROM public.questions q WHERE q.game_id=t.game_id AND NOT (
  CASE t.poll_type WHEN 'poll_text' THEN EXISTS(
   SELECT 1 FROM public.poll_text_entries v JOIN public.poll_sessions s ON s.id=v.poll_session_id
   WHERE v.game_id=t.game_id AND v.question_id=q.id AND v.voter_token=public.poll_task_voter_token(t.id)
    AND s.game_id=t.game_id AND s.question_id=q.id AND s.is_open)
  WHEN 'poll_points' THEN EXISTS(
   SELECT 1 FROM public.poll_votes v JOIN public.poll_sessions s ON s.id=v.poll_session_id
   WHERE v.game_id=t.game_id AND v.question_id=q.id AND v.voter_token=public.poll_task_voter_token(t.id)
    AND s.game_id=t.game_id AND s.question_id=q.id AND s.is_open)
  ELSE false END))
 FROM public.poll_tasks t WHERE t.id=p_task_id
$$;


--
-- Name: poll_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid",
    "recipient_email" "text",
    "game_id" "uuid" NOT NULL,
    "poll_type" "text" NOT NULL,
    "share_key_poll" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opened_at" timestamp with time zone,
    "done_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "email_sent_at" timestamp with time zone,
    "email_send_count" integer DEFAULT 0 NOT NULL,
    "reminder_count" integer DEFAULT 0 NOT NULL,
    "source_subscription_id" "uuid",
    "source_friendship_id" "uuid",
    "source_kind" "text" DEFAULT 'game'::"text" NOT NULL,
    CONSTRAINT "poll_tasks_contact_kind" CHECK (((("source_subscription_id" IS NOT NULL) AND ("source_kind" = 'subscriber'::"text")) OR (("source_friendship_id" IS NOT NULL) AND ("source_kind" = 'friend'::"text")) OR (("source_subscription_id" IS NULL) AND ("source_friendship_id" IS NULL) AND ("source_kind" = 'game'::"text")))),
    CONSTRAINT "poll_tasks_one_contact_source" CHECK (("num_nonnulls"("source_subscription_id", "source_friendship_id") <= 1)),
    CONSTRAINT "poll_tasks_one_recipient_chk" CHECK (((("recipient_user_id" IS NOT NULL) AND ("recipient_email" IS NULL)) OR (("recipient_user_id" IS NULL) AND ("recipient_email" IS NOT NULL)))),
    CONSTRAINT "poll_tasks_poll_type_check" CHECK (("poll_type" = ANY (ARRAY['poll_text'::"text", 'poll_points'::"text"]))),
    CONSTRAINT "poll_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'opened'::"text", 'done'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


--
-- Name: _poll_task_source_active("public"."poll_tasks"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_task_source_active"("p_task" "public"."poll_tasks") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT (p_task.recipient_user_id IS NOT NULL OR public._contact_mail_enabled(p_task.recipient_email)) AND (CASE p_task.source_kind
 WHEN 'subscriber' THEN EXISTS(SELECT 1 FROM public.poll_subscriptions s
  WHERE s.id=p_task.source_subscription_id AND s.owner_id=p_task.owner_id
  AND s.status='active' AND s.cancelled_at IS NULL AND s.declined_at IS NULL
  AND ((p_task.recipient_user_id IS NOT NULL AND coalesce(s.registered_user_id,s.subscriber_user_id)=p_task.recipient_user_id)
   OR (p_task.recipient_user_id IS NULL AND s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email)=public._norm_email(p_task.recipient_email))))
 WHEN 'friend' THEN EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=p_task.source_friendship_id
  AND f.status='active' AND f.cancelled_at IS NULL
  AND LEAST(f.requester_id,f.addressee_id)=LEAST(p_task.owner_id,p_task.recipient_user_id)
  AND GREATEST(f.requester_id,f.addressee_id)=GREATEST(p_task.owner_id,p_task.recipient_user_id))
 WHEN 'game' THEN true ELSE false END);
$$;


--
-- Name: _poll_task_vote_write_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_task_vote_write_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE gid uuid; key text;
BEGIN
 IF left(NEW.voter_token,5)='task:' THEN
  gid:=NEW.game_id;
  IF gid IS NULL THEN SELECT game_id INTO gid FROM public.poll_sessions WHERE id=NEW.poll_session_id; END IF;
  SELECT share_key_poll INTO key FROM public.games WHERE id=gid;
  PERFORM public._poll_assert_voter(gid,key,NEW.voter_token);
 END IF;
 RETURN NEW;
END; $$;


--
-- Name: _poll_text_close_unchecked("uuid", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_text_close_unchecked"("p_game_id" "uuid", "p_key" "text", "p_payload" "jsonb") RETURNS "void"
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


--
-- Name: _poll_text_tally_points("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_poll_text_tally_points"("p_answers" "jsonb") RETURNS TABLE("ord" integer, "atext" "text", "points" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r record;
  v_used integer[] := ARRAY[]::integer[];
  v_p integer;
  v_n integer := 0;
BEGIN
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;

  FOR r IN
    WITH c AS (
      SELECT min(s.idx) AS idx,
             (array_agg(s.txt ORDER BY s.idx))[1] AS txt,
             sum(s.cnt)::bigint AS cnt
      FROM (
        SELECT x.i::integer AS idx,
               left(btrim(coalesce(x.v->>'text', '')), 17) AS txt,
               CASE WHEN jsonb_typeof(x.v->'count') = 'number'
                    THEN greatest(0, floor((x.v->>'count')::numeric))::bigint ELSE 0 END AS cnt
        FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS x(v, i)
      ) s
      WHERE s.txt <> '' AND s.cnt > 0
      GROUP BY lower(s.txt)
    ),
    f AS (
      SELECT c.idx, c.txt,
             ((100 * c.cnt) / t.total)::integer AS fl,
             (100 * c.cnt) % t.total AS rem
      FROM c CROSS JOIN (SELECT sum(cnt) AS total FROM c) t
    ),
    d AS (
      SELECT f.*, 100 - sum(f.fl) OVER () AS diff,
             row_number() OVER (ORDER BY f.rem DESC, f.idx) AS fidx
      FROM f
    )
    SELECT d.txt, d.fl + CASE WHEN d.fidx <= d.diff THEN 1 ELSE 0 END AS pts, d.fidx
    FROM d
    WHERE d.fl + CASE WHEN d.fidx <= d.diff THEN 1 ELSE 0 END >= 3
    ORDER BY 2 DESC, d.fidx
    LIMIT 6
  LOOP
    v_p := r.pts;
    WHILE v_p > 0 AND v_p = ANY(v_used) LOOP
      v_p := v_p - 1;
    END LOOP;
    v_used := v_used || v_p;
    v_n := v_n + 1;
    ord := v_n; atext := r.txt; points := v_p;
    RETURN NEXT;
  END LOOP;
END $$;


--
-- Name: _resource_clone_asset_register("uuid", "uuid", "text", "text", "text", integer, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_asset_register"("p_actor" "uuid", "p_job" "uuid", "p_reference" "text", "p_kind" "text", "p_mime" "text", "p_size" integer, "p_etag" "text", "p_content_hash" "text", "p_source_path" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE item public.resource_clone_jobs; asset public.resource_clone_assets; fingerprint text; ext text; aid uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor FOR UPDATE;
 IF NOT FOUND OR item.actor_id IS NULL OR item.status<>'preparing' OR item.resource_kind<>'logo' OR item.created_at+interval '1 hour'<=clock_timestamp() THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public._logo_clone_image_refs(item.source_snapshot#>'{logo,payload,source}') ref WHERE ref=p_reference) THEN RAISE EXCEPTION 'invalid_copy_image_reference'; END IF;
 fingerprint:=encode(sha256(convert_to(p_reference,'UTF8')),'hex');
 SELECT * INTO asset FROM public.resource_clone_assets WHERE job_id=p_job AND reference_hash=fingerprint;
 IF FOUND THEN
  IF asset.source_kind IS DISTINCT FROM p_kind OR asset.mime IS DISTINCT FROM p_mime OR asset.byte_size IS DISTINCT FROM p_size OR asset.etag IS DISTINCT FROM p_etag OR
   asset.content_hash IS DISTINCT FROM p_content_hash OR asset.source_path IS DISTINCT FROM p_source_path THEN RAISE EXCEPTION 'copy_image_source_changed'; END IF;
  RETURN to_jsonb(asset)||jsonb_build_object('copy_id',item.id,'recipient_id',item.recipient_id,'source_owner_id',item.actor_identity,'asset_id',asset.id);
 END IF;
 IF p_kind='storage' AND (p_source_path IS NULL OR p_source_path NOT LIKE item.actor_identity::text||'/%' OR p_etag IS NULL OR p_etag !~ '^[a-f0-9]{32}$') THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
 IF p_kind IN('embedded','demo_asset') AND (p_content_hash IS NULL OR p_content_hash !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
 ext:=CASE p_mime WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/gif' THEN 'gif' WHEN 'image/webp' THEN 'webp' END;
 IF ext IS NULL THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
 INSERT INTO public.resource_clone_assets(id,job_id,reference_hash,reference,source_kind,source_path,mime,byte_size,etag,content_hash,destination_path)
  VALUES(aid,p_job,fingerprint,p_reference,p_kind,p_source_path,p_mime,p_size,p_etag,p_content_hash,item.recipient_id::text||'/copies/'||item.id::text||'/'||aid::text||'.'||ext) RETURNING * INTO asset;
 RETURN to_jsonb(asset)||jsonb_build_object('copy_id',item.id,'recipient_id',item.recipient_id,'source_owner_id',item.actor_identity,'asset_id',asset.id);
END $_$;


--
-- Name: _resource_clone_begin("uuid", "uuid", "text", "uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_begin"("p_actor" "uuid", "p_owner" "uuid", "p_kind" "text", "p_source" "uuid", "p_action" "text", "p_request" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE item public.resource_clone_jobs; snapshot jsonb; target uuid;
BEGIN
 IF p_actor IS NULL OR p_owner IS NULL OR p_source IS NULL OR p_request IS NULL OR p_kind IS NULL OR p_action IS NULL OR
  p_kind NOT IN('game','base','logo') OR p_action NOT IN('duplicate','send') OR
  (p_action='duplicate' AND p_actor<>p_owner) OR (p_action='send' AND (p_actor=p_owner OR p_kind='base')) THEN RAISE EXCEPTION 'invalid_copy_action'; END IF;
 PERFORM 1 FROM auth.users u WHERE id IN(p_actor,p_owner) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,p_owner) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>(CASE WHEN p_actor=p_owner THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE actor_identity=p_actor AND recipient_id=p_owner AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF item.source_id<>p_source OR item.resource_kind<>p_kind OR item.action<>p_action THEN RAISE EXCEPTION 'request_conflict'; END IF;
  target:=CASE p_kind WHEN 'game' THEN item.game_id WHEN 'base' THEN item.base_id ELSE item.logo_id END;
  IF item.status IN('removed','expired') OR (item.status='complete' AND target IS NULL) THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('id',item.id,'status',item.status,'target_id',target,'snapshot',item.source_snapshot,'recipient_id',item.recipient_id,'actor_id',item.actor_identity);
 END IF;
 IF p_action='send' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_actor,p_owner)::text||':'||GREATEST(p_actor,p_owner)::text,329));
  PERFORM 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL AND
   ((requester_id=p_actor AND addressee_id=p_owner) OR (requester_id=p_owner AND addressee_id=p_actor)) FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_friend'; END IF;
 END IF;
 snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);
 INSERT INTO public.resource_clone_jobs(actor_id,actor_identity,recipient_id,source_id,resource_kind,action,request_id,source_snapshot)
  VALUES(p_actor,p_actor,p_owner,p_source,p_kind,p_action,p_request,snapshot) RETURNING * INTO item;
 RETURN jsonb_build_object('id',item.id,'status',item.status,'snapshot',snapshot,'recipient_id',item.recipient_id,'actor_id',item.actor_identity);
END $$;


--
-- Name: _resource_clone_check_assets("text", "uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_check_assets"("p_kind" "text", "p_job" "uuid", "p_definition" "jsonb", "p_storage_base" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage', 'pg_temp'
    AS $_$
DECLARE ref text;
BEGIN
 IF p_kind='logo' THEN
  IF p_storage_base IS NULL OR p_storage_base !~ '^https://[a-zA-Z0-9.-]+$' THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
  FOR ref IN SELECT public._logo_clone_image_refs(p_definition#>'{payload,source}') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.resource_clone_assets a JOIN storage.objects o ON o.bucket_id='user-logos' AND o.name=a.destination_path
    WHERE a.job_id=p_job AND ref=p_storage_base||'/storage/v1/object/public/user-logos/'||a.destination_path AND
     o.metadata->>'mimetype'=a.mime AND (o.metadata->>'size')::bigint=a.byte_size AND
     (a.source_kind<>'storage' OR trim(both '"' from o.metadata->>'eTag')=a.etag)) THEN RAISE EXCEPTION 'unmaterialized_copy_image'; END IF;
  END LOOP;
 END IF;
END $_$;


--
-- Name: _resource_clone_cleanup("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_cleanup"("p_owner" "uuid", "p_job" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.resource_clone_jobs WHERE id=p_job AND recipient_id=p_owner AND status='complete' AND logo_id IS NOT NULL) THEN RETURN; END IF;
 INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
  VALUES('user-logos',p_owner::text||'/copies/'||p_job::text,true,'logo',p_job) ON CONFLICT DO NOTHING;
 PERFORM public.storage_cleanup_kick();
END $$;


--
-- Name: _resource_clone_duplicate_name("text", "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_duplicate_name"("p_kind" "text", "p_owner" "uuid", "p_name" "text", "p_suffix" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE candidate text; ending text; number integer:=1;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('game','base','logo') OR p_suffix IS NULL OR p_suffix NOT IN('kopia','copy','копія') THEN RAISE EXCEPTION 'invalid_copy_name'; END IF;
 LOOP
  ending:=' '||p_suffix||CASE WHEN number=1 THEN '' ELSE ' '||number::text END;
  candidate:=trim(rtrim(left(trim(coalesce(p_name,'')),80-char_length(ending)))||ending);
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE p_kind='game' AND owner_id=p_owner AND name=candidate
   UNION ALL SELECT 1 FROM public.question_bases WHERE p_kind='base' AND owner_id=p_owner AND name=candidate
   UNION ALL SELECT 1 FROM public.user_logos WHERE p_kind='logo' AND user_id=p_owner AND name=candidate) THEN RETURN candidate; END IF;
  number:=number+1;
 END LOOP;
END $$;


--
-- Name: _resource_clone_finish_duplicate("uuid", "uuid", "jsonb", boolean, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_finish_duplicate"("p_actor" "uuid", "p_job" "uuid", "p_definition" "jsonb", "p_demo" boolean, "p_storage_base" "text", "p_suffix" "text" DEFAULT 'kopia'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE item public.resource_clone_jobs; target uuid; result jsonb; hash text; ref text; original_name text; name_key text[]; named_definition jsonb;
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor;
 IF NOT FOUND OR item.action<>'duplicate' THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job FOR UPDATE NOWAIT;
 name_key:=CASE WHEN item.resource_kind='logo' THEN ARRAY['name'] ELSE ARRAY[item.resource_kind,'name'] END;
 named_definition:=p_definition #- name_key;
 hash:=encode(sha256(convert_to(named_definition::text,'UTF8')),'hex');
 target:=CASE item.resource_kind WHEN 'game' THEN item.game_id WHEN 'base' THEN item.base_id ELSE item.logo_id END;
 IF item.status='complete' THEN
  IF item.definition_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'request_conflict'; END IF;
  IF target IS NULL THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('ok',true,'id',target,'already',true);
 END IF;
 IF item.status IN('removed','expired') THEN RAISE EXCEPTION 'previously_removed'; END IF;
 IF item.created_at+interval '1 hour'<=clock_timestamp() THEN
  UPDATE public.resource_clone_jobs SET status='expired',source_snapshot=NULL WHERE id=p_job;
  IF item.resource_kind='logo' THEN PERFORM public._resource_clone_cleanup(item.recipient_id,item.id); END IF;
  RETURN jsonb_build_object('ok',false,'error','expired');
 END IF;
 IF item.resource_kind='logo' THEN
  IF p_storage_base IS NULL OR p_storage_base !~ '^https://[a-zA-Z0-9.-]+$' THEN RAISE EXCEPTION 'invalid_copy_storage_plan'; END IF;
  FOR ref IN SELECT public._logo_clone_image_refs(p_definition#>'{payload,source}') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.resource_clone_assets a JOIN storage.objects o ON o.bucket_id='user-logos' AND o.name=a.destination_path
    WHERE a.job_id=p_job AND ref=p_storage_base||'/storage/v1/object/public/user-logos/'||a.destination_path AND
     o.metadata->>'mimetype'=a.mime AND (o.metadata->>'size')::bigint=a.byte_size AND
     (a.source_kind<>'storage' OR trim(both '"' from o.metadata->>'eTag')=a.etag)) THEN RAISE EXCEPTION 'unmaterialized_copy_image'; END IF;
  END LOOP;
 END IF;
 original_name:=item.source_snapshot#>>ARRAY[item.resource_kind,'name'];
 IF coalesce(trim(original_name),'')='' THEN
  original_name:=CASE WHEN p_definition#>>name_key=p_suffix THEN '' ELSE regexp_replace(p_definition#>>name_key,' '||p_suffix||'( [0-9]+)?$','') END;
 END IF;
 named_definition:=jsonb_set(p_definition,name_key,to_jsonb(public._resource_clone_duplicate_name(item.resource_kind,item.recipient_id,original_name,p_suffix)));
 result:=public._resource_clone_write(item.actor_identity,item.recipient_id,item.resource_kind,'duplicate',item.source_id,item.request_id,named_definition,p_demo);
 target:=(result->>'id')::uuid;
 UPDATE public.resource_clone_jobs SET status='complete',source_snapshot=NULL,completed_at=clock_timestamp(),definition_hash=hash,
  game_id=CASE WHEN resource_kind='game' THEN target END,base_id=CASE WHEN resource_kind='base' THEN target END,logo_id=CASE WHEN resource_kind='logo' THEN target END WHERE id=p_job;
 -- The file manifest remains tied to the result; the copied bytes are not
 -- duplicated in a database snapshot after the resource has been published.
 UPDATE public.resource_clone_assets SET reference='' WHERE job_id=p_job;
 RETURN result;
END $_$;


--
-- Name: _resource_clone_finish_send("uuid", "uuid", "jsonb", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_finish_send"("p_actor" "uuid", "p_job" "uuid", "p_definition" "jsonb", "p_demo" boolean, "p_storage_base" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE item public.resource_clone_jobs; existing public.resource_copy_offers; hash text; target uuid; offer_id uuid; offer_token uuid; allocation_id uuid;
 blocked_until timestamptz; imported jsonb; label text; receiver_label text; recipient_email text; key text[]; named jsonb; variant text;
BEGIN
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job AND actor_identity=p_actor;
 IF NOT FOUND OR item.action<>'send' THEN RAISE EXCEPTION 'invalid_copy_job'; END IF;
 PERFORM 1 FROM auth.users WHERE id IN(p_actor,item.recipient_id) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,item.recipient_id) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>2 THEN RAISE EXCEPTION 'auth_required'; END IF;
 SELECT * INTO item FROM public.resource_clone_jobs WHERE id=p_job FOR UPDATE NOWAIT;
 key:=CASE item.resource_kind WHEN 'game' THEN ARRAY['game','name'] ELSE ARRAY['name'] END;
 hash:=encode(sha256(convert_to((p_definition #- key)::text,'UTF8')),'hex');
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND request_id=item.request_id;
 IF item.status='complete' THEN
  IF item.definition_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'request_conflict'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'previously_removed'; END IF;
  SELECT public._norm_email(u.email) INTO recipient_email FROM auth.users u WHERE u.id=item.recipient_id;
  RETURN jsonb_build_object('ok',true,'offer_id',existing.id,'go_token',existing.token,'mail_to',recipient_email,
   'mail_allowed',EXISTS(SELECT 1 FROM public.mail_notification_allocations a WHERE a.copy_offer_id=existing.id AND a.revoked_at IS NULL),'already',true);
 END IF;
 IF item.status IN('removed','expired') THEN RAISE EXCEPTION 'previously_removed'; END IF;
 IF item.created_at+interval '1 hour'<=clock_timestamp() THEN
  UPDATE public.resource_clone_jobs SET status='expired',source_snapshot=NULL WHERE id=p_job;
  PERFORM public._resource_clone_cleanup(item.recipient_id,p_job);
  RETURN jsonb_build_object('ok',false,'error','expired');
 END IF;
 IF p_demo IS DISTINCT FROM false OR coalesce((item.source_snapshot->>'demo_origin')::boolean,false) OR coalesce((item.source_snapshot#>>ARRAY[item.resource_kind,'is_demo'])::boolean,false) THEN RAISE EXCEPTION 'demo_not_sendable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_actor,item.recipient_id)::text||':'||GREATEST(p_actor,item.recipient_id)::text,329));
 PERFORM 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL AND
  ((requester_id=p_actor AND addressee_id=item.recipient_id) OR (requester_id=item.recipient_id AND addressee_id=p_actor)) FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_friend'; END IF;
 SELECT max(decided_at+interval '30 days') INTO blocked_until FROM public.resource_copy_offers
  WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND source_id=item.source_id AND status='declined';
 IF blocked_until>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','declined_cooldown','cooldown_until',blocked_until); END IF;
 SELECT * INTO existing FROM public.resource_copy_offers WHERE sender_identity=p_actor AND recipient_id=item.recipient_id AND source_id=item.source_id AND status='pending' FOR UPDATE;
 IF FOUND THEN
  IF existing.created_at+interval '5 days'>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','already_sent'); END IF;
  PERFORM public._copy_discard(existing.id,'expired');
 END IF;
 PERFORM public._resource_clone_check_assets(item.resource_kind,p_job,p_definition,p_storage_base);
 named:=jsonb_set(p_definition,key,to_jsonb(public._resource_clone_send_name(item.resource_kind,item.recipient_id,p_definition#>>key)));
 imported:=public._resource_clone_write(p_actor,item.recipient_id,item.resource_kind,'send',item.source_id,item.request_id,named,false);
 IF imported->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'clone_import_failed'; END IF;
 target:=(imported->>'id')::uuid;
 SELECT coalesce(nullif(p.username,''),u.email) INTO label FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=p_actor;
 SELECT coalesce(nullif(p.username,''),u.email),public._norm_email(u.email) INTO receiver_label,recipient_email FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=item.recipient_id;
 IF item.resource_kind='game' THEN
  UPDATE public.games SET received_from_label=label,received_from_identity=p_actor WHERE id=target;
  variant:=named#>>'{game,type}';
 ELSE
  UPDATE public.user_logos SET received_from_label=label,received_from_identity=p_actor WHERE id=target;
  variant:=named->>'type';
 END IF;
 INSERT INTO public.resource_copy_offers(recipient_id,sender_id,sender_identity,sender_label,source_id,resource_kind,variant,name,request_id,payload_hash,game_id,logo_id)
 VALUES(item.recipient_id,p_actor,p_actor,label,item.source_id,item.resource_kind,variant,named#>>key,item.request_id,hash,
  CASE WHEN item.resource_kind='game' THEN target END,CASE WHEN item.resource_kind='logo' THEN target END) RETURNING id,token INTO offer_id,offer_token;
 INSERT INTO public.resource_copy_history(sender_id,game_id,logo_id,offer_id,recipient_identity,recipient_label)
 VALUES(p_actor,CASE WHEN item.resource_kind='game' THEN item.source_id END,CASE WHEN item.resource_kind='logo' THEN item.source_id END,offer_id,item.recipient_id,receiver_label);
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 allocation_id:=public._mail_allocate_notification('copy',offer_id,'copy:send');
 UPDATE public.resource_clone_jobs SET status='complete',source_snapshot=NULL,definition_hash=hash,completed_at=clock_timestamp(),
  game_id=CASE WHEN resource_kind='game' THEN target END,logo_id=CASE WHEN resource_kind='logo' THEN target END WHERE id=p_job;
 UPDATE public.resource_clone_assets SET reference='' WHERE job_id=p_job;
 RETURN jsonb_build_object('ok',true,'offer_id',offer_id,'go_token',offer_token,'mail_to',recipient_email,'mail_allowed',allocation_id IS NOT NULL,'already',false);
END $$;


--
-- Name: _resource_clone_gc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_gc"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE item public.resource_clone_jobs; processed integer:=0;
BEGIN
 FOR item IN SELECT * FROM public.resource_clone_jobs WHERE status='preparing' AND (created_at+interval '1 hour'<=clock_timestamp() OR actor_id IS NULL) FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.resource_clone_jobs SET status='expired',source_snapshot=NULL WHERE id=item.id;
  IF item.resource_kind='logo' THEN PERFORM public._resource_clone_cleanup(item.recipient_id,item.id); END IF;
  processed:=processed+1;
 END LOOP;
 -- A late service upload can outlive the account/job cascade. The owner UUID,
 -- not the email or a new account, determines that these files are orphaned.
 INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
  SELECT DISTINCT 'user-logos',split_part(o.name,'/',1)||'/copies/'||split_part(o.name,'/',3),true,'user',split_part(o.name,'/',1)::uuid
   FROM storage.objects o WHERE o.bucket_id='user-logos' AND
    o.name ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/copies/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}[.](png|jpg|gif|webp)$' AND
    NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=split_part(o.name,'/',1)::uuid) ON CONFLICT DO NOTHING;
 IF processed>0 OR EXISTS(SELECT 1 FROM public.storage_cleanup_queue WHERE attempts<20) THEN PERFORM public.storage_cleanup_kick(); END IF;
 RETURN processed;
END $_$;


--
-- Name: _resource_clone_job_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_job_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF OLD.resource_kind='logo' AND OLD.status<>'complete' THEN
  INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
   VALUES('user-logos',OLD.recipient_id::text||'/copies/'||OLD.id::text,true,'logo',OLD.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END $$;


--
-- Name: _resource_clone_logo_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_logo_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 INSERT INTO public.storage_cleanup_queue(bucket,path,is_folder,owner_kind,owner_id)
  SELECT 'user-logos',recipient_id::text||'/copies/'||id::text,true,'logo',OLD.id FROM public.resource_clone_jobs WHERE logo_id=OLD.id ON CONFLICT DO NOTHING;
 UPDATE public.resource_clone_jobs SET status='removed',source_snapshot=NULL WHERE logo_id=OLD.id;
 RETURN OLD;
END $$;


--
-- Name: _resource_clone_read("uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_read"("p_actor" "uuid", "p_kind" "text", "p_source" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE root jsonb; snapshot jsonb; templates jsonb; inherited_demo boolean;
BEGIN
 IF p_actor IS NULL OR p_kind IS NULL OR p_kind NOT IN('game','base','logo') OR p_source IS NULL THEN RAISE EXCEPTION 'invalid_copy_source'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'auth_required'; END IF;
 -- Parent locks prevent new child FK insertions while reading the definition.
 IF p_kind='game' THEN
  SELECT jsonb_build_object('id',g.id,'name',g.name,'type',g.type,'status',g.status,'is_demo',g.is_demo) INTO root
   FROM public.games g WHERE id=p_source AND owner_id=p_actor FOR UPDATE NOWAIT;
 ELSIF p_kind='base' THEN
  SELECT jsonb_build_object('id',b.id,'name',b.name,'is_demo',b.is_demo) INTO root
   FROM public.question_bases b WHERE id=p_source AND owner_id=p_actor FOR UPDATE NOWAIT;
 ELSE
  SELECT jsonb_build_object('id',l.id,'name',l.name,'type',l.type,'payload',l.payload,'is_demo',l.is_demo) INTO root
   FROM public.user_logos l WHERE id=p_source AND user_id=p_actor FOR UPDATE NOWAIT;
 END IF;
 IF root IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF EXISTS(SELECT 1 FROM public.resource_copy_offers o WHERE status='pending' AND
  CASE p_kind WHEN 'game' THEN o.game_id WHEN 'logo' THEN o.logo_id END=p_source) THEN RAISE EXCEPTION 'received_copy_pending'; END IF;
 IF p_kind='game' AND root->>'status' NOT IN('draft','ready') THEN RAISE EXCEPTION 'not_exportable'; END IF;
 IF p_kind='game' AND root->>'type' NOT IN('prepared','poll_text','poll_points') THEN RAISE EXCEPTION 'not_exportable'; END IF;
 IF EXISTS(SELECT 1 FROM public.edit_locks l WHERE heartbeat_at>clock_timestamp()-public.edit_lock_ttl() AND (
  (l.resource_type=p_kind AND l.resource_id=p_source) OR
  (p_kind='logo' AND l.resource_type='logos' AND l.resource_id=p_actor) OR
  (p_kind='base' AND (
   (l.resource_type='base_question' AND l.resource_id IN(SELECT id FROM public.qb_questions WHERE base_id=p_source)) OR
   (l.resource_type='base_folder' AND l.resource_id IN(SELECT id FROM public.qb_categories WHERE base_id=p_source)) OR
   (l.resource_type='base_tag' AND l.resource_id IN(SELECT id FROM public.qb_tags WHERE base_id=p_source))))
 )) THEN RAISE EXCEPTION 'resource_in_use'; END IF;
 IF p_kind='game' THEN
  PERFORM 1 FROM public.questions WHERE game_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.answers a JOIN public.questions q ON q.id=a.question_id WHERE q.game_id=p_source ORDER BY a.id FOR SHARE OF a NOWAIT;
  SELECT jsonb_build_object('game',root,'questions',coalesce(jsonb_agg(jsonb_build_object('text',q.text,'answers',coalesce((
   SELECT jsonb_agg(jsonb_build_object('text',a.text,'fixed_points',a.fixed_points) ORDER BY a.ord,a.id)
    FROM public.answers a WHERE a.question_id=q.id),'[]'::jsonb)) ORDER BY q.ord,q.id),'[]'::jsonb)) INTO snapshot
   FROM public.questions q WHERE q.game_id=p_source;
 ELSIF p_kind='base' THEN
  PERFORM 1 FROM public.qb_categories WHERE base_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.qb_tags WHERE base_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.qb_questions WHERE base_id=p_source ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.qb_question_tags e JOIN public.qb_questions q ON q.id=e.question_id WHERE q.base_id=p_source ORDER BY e.question_id,e.tag_id FOR SHARE OF e NOWAIT;
  PERFORM 1 FROM public.qb_category_tags e JOIN public.qb_categories c ON c.id=e.category_id WHERE c.base_id=p_source ORDER BY e.category_id,e.tag_id FOR SHARE OF e NOWAIT;
  snapshot:=jsonb_build_object('base',root,
   'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'name',name,'ord',ord) ORDER BY ord,id) FROM public.qb_categories WHERE base_id=p_source),'[]'),
   'tags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'ord',ord) ORDER BY ord,id) FROM public.qb_tags WHERE base_id=p_source),'[]'),
   'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'ord',ord,'payload',payload) ORDER BY ord,id) FROM public.qb_questions WHERE base_id=p_source),'[]'),
   'question_tags',coalesce((SELECT jsonb_agg(jsonb_build_object('question_id',e.question_id,'tag_id',e.tag_id) ORDER BY e.question_id,e.tag_id) FROM public.qb_question_tags e JOIN public.qb_questions q ON q.id=e.question_id WHERE q.base_id=p_source),'[]'),
   'category_tags',coalesce((SELECT jsonb_agg(jsonb_build_object('category_id',e.category_id,'tag_id',e.tag_id) ORDER BY e.category_id,e.tag_id) FROM public.qb_category_tags e JOIN public.qb_categories c ON c.id=e.category_id WHERE c.base_id=p_source),'[]'));
 ELSE snapshot:=jsonb_build_object('logo',root); END IF;
 SELECT coalesce(bool_or(demo_origin),false) INTO inherited_demo FROM public.resource_clone_receipts
  WHERE recipient_id=p_actor AND CASE p_kind WHEN 'game' THEN game_id WHEN 'base' THEN base_id ELSE logo_id END=p_source;
 inherited_demo:=inherited_demo OR EXISTS(SELECT 1 FROM public.resource_demo_origins WHERE CASE p_kind WHEN 'game' THEN game_id WHEN 'base' THEN base_id ELSE logo_id END=p_source);
 SELECT coalesce(jsonb_agg(jsonb_build_object('slot',slot,'lang',lang,'payload',payload) ORDER BY slot,lang),'[]') INTO templates FROM public.demo_template_data
  WHERE (p_kind='game' AND payload ? 'game') OR (p_kind='logo' AND slot LIKE 'logo_%');
 RETURN snapshot||jsonb_build_object('demo_origin',inherited_demo,'demo_templates',templates);
END $$;


--
-- Name: _resource_clone_send_name("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_send_name"("p_kind" "text", "p_owner" "uuid", "p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE original text:=left(trim(p_name),80); candidate text; number integer:=1; tail text;
BEGIN
 IF coalesce(original,'')='' OR p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'invalid_copy_name'; END IF;
 LOOP
  tail:=CASE WHEN number=1 THEN '' ELSE ' '||number::text END;
  candidate:=left(original,80-length(tail))||tail;
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE p_kind='game' AND owner_id=p_owner AND name=candidate) AND
     NOT EXISTS(SELECT 1 FROM public.user_logos WHERE p_kind='logo' AND user_id=p_owner AND name=candidate) THEN RETURN candidate; END IF;
  number:=number+1;
  IF number>10000 THEN RAISE EXCEPTION 'copy_name_unavailable'; END IF;
 END LOOP;
END $$;


--
-- Name: _resource_clone_write("uuid", "uuid", "text", "text", "uuid", "uuid", "jsonb", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_clone_write"("p_actor" "uuid", "p_owner" "uuid", "p_kind" "text", "p_action" "text", "p_source" "uuid", "p_request" "uuid", "p_definition" "jsonb", "p_demo" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE receipt public.resource_clone_receipts; copy_id uuid:=gen_random_uuid(); target uuid; hash text; imported jsonb;
 catmap jsonb; tagmap jsonb; qmap jsonb; packet_name text; typ text; source_snapshot jsonb;
BEGIN
 IF p_actor IS NULL OR p_owner IS NULL OR p_source IS NULL OR p_request IS NULL OR p_definition IS NULL OR
  p_kind IS NULL OR p_action IS NULL OR p_demo IS NULL OR p_kind NOT IN('game','base','logo') OR p_action NOT IN('duplicate','send') OR
  (p_action='duplicate' AND p_actor<>p_owner) OR (p_action='send' AND (p_actor=p_owner OR p_kind='base')) THEN RAISE EXCEPTION 'invalid_copy_action'; END IF;
 PERFORM 1 FROM auth.users u WHERE id IN(p_actor,p_owner) ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF (SELECT count(*) FROM auth.users u WHERE id IN(p_actor,p_owner) AND public._poll_identity_regular(u.id,to_jsonb(u)))<>(CASE WHEN p_actor=p_owner THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'auth_required'; END IF;
 hash:=encode(sha256(convert_to(p_definition::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.resource_clone_receipts WHERE creator_identity=p_actor AND recipient_id=p_owner AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF receipt.source_id<>p_source OR receipt.resource_kind<>p_kind OR receipt.action<>p_action OR receipt.definition_hash<>hash OR receipt.demo_origin IS DISTINCT FROM p_demo THEN RAISE EXCEPTION 'request_conflict'; END IF;
  target:=CASE p_kind WHEN 'game' THEN receipt.game_id WHEN 'base' THEN receipt.base_id ELSE receipt.logo_id END;
  IF target IS NULL THEN RAISE EXCEPTION 'previously_removed'; END IF;
  RETURN jsonb_build_object('ok',true,'id',target,'already',true);
 END IF;
 source_snapshot:=public._resource_clone_read(p_actor,p_kind,p_source);
 IF (source_snapshot#>>ARRAY[p_kind,'is_demo'])::boolean OR (source_snapshot->>'demo_origin')::boolean THEN
  IF p_demo IS DISTINCT FROM true THEN RAISE EXCEPTION 'invalid_demo_provenance'; END IF;
 END IF;
 IF p_action='send' AND coalesce(p_demo,false) THEN RAISE EXCEPTION 'demo_not_sendable'; END IF;
 IF p_action='send' AND NOT EXISTS(SELECT 1 FROM public.friendships WHERE status='active' AND cancelled_at IS NULL AND
  ((requester_id=p_actor AND addressee_id=p_owner) OR (requester_id=p_owner AND addressee_id=p_actor))) THEN RAISE EXCEPTION 'not_friend'; END IF;
 IF p_kind='game' THEN
  imported:=public._game_import_package(p_definition,p_owner,copy_id);
  IF imported->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'clone_import_failed'; END IF;
  target:=(imported->>'id')::uuid;
 ELSIF p_kind='base' THEN
  IF jsonb_typeof(p_definition->'base') IS DISTINCT FROM 'object' OR jsonb_typeof(p_definition->'questions') IS DISTINCT FROM 'array' OR
   jsonb_typeof(p_definition->'categories') IS DISTINCT FROM 'array' OR jsonb_typeof(p_definition->'tags') IS DISTINCT FROM 'array' OR
   jsonb_typeof(p_definition->'question_tags') IS DISTINCT FROM 'array' OR jsonb_typeof(p_definition->'category_tags') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_definition->'categories') x GROUP BY x->>'id' HAVING count(*)>1) OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(p_definition->'tags') x GROUP BY x->>'id' HAVING count(*)>1) OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(p_definition->'questions') x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  packet_name:=left(trim(p_definition#>>'{base,name}'),80);
  IF coalesce(packet_name,'')='' THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  INSERT INTO public.question_bases(owner_id,name) VALUES(p_owner,packet_name) RETURNING id INTO target;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO catmap FROM jsonb_array_elements(p_definition->'categories') x;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO tagmap FROM jsonb_array_elements(p_definition->'tags') x;
  SELECT coalesce(jsonb_object_agg(x->>'id',gen_random_uuid()),'{}') INTO qmap FROM jsonb_array_elements(p_definition->'questions') x;
  INSERT INTO public.qb_categories(id,base_id,parent_id,name,ord)
   SELECT (catmap->>(x->>'id'))::uuid,target,(catmap->>(x->>'parent_id'))::uuid,left(x->>'name',80),coalesce((x->>'ord')::int,0)
    FROM jsonb_array_elements(p_definition->'categories') x;
  INSERT INTO public.qb_tags(id,base_id,name,color,ord)
   SELECT (tagmap->>(x->>'id'))::uuid,target,left(x->>'name',40),left(x->>'color',24),coalesce((x->>'ord')::int,0)
    FROM jsonb_array_elements(p_definition->'tags') x;
  INSERT INTO public.qb_questions(id,base_id,category_id,ord,payload,updated_by)
   SELECT (qmap->>(x->>'id'))::uuid,target,(catmap->>(x->>'category_id'))::uuid,coalesce((x->>'ord')::int,0),coalesce(x->'payload','{}'),p_owner
    FROM jsonb_array_elements(p_definition->'questions') x;
  INSERT INTO public.qb_question_tags(question_id,tag_id)
   SELECT DISTINCT (qmap->>(x->>'question_id'))::uuid,(tagmap->>(x->>'tag_id'))::uuid
    FROM jsonb_array_elements(p_definition->'question_tags') x WHERE qmap ? (x->>'question_id') AND tagmap ? (x->>'tag_id');
  INSERT INTO public.qb_category_tags(category_id,tag_id)
   SELECT DISTINCT (catmap->>(x->>'category_id'))::uuid,(tagmap->>(x->>'tag_id'))::uuid
    FROM jsonb_array_elements(p_definition->'category_tags') x WHERE catmap ? (x->>'category_id') AND tagmap ? (x->>'tag_id');
 ELSE
  packet_name:=left(trim(p_definition->>'name'),80);typ:=p_definition->>'type';
  IF coalesce(packet_name,'')='' OR typ NOT IN('GLYPH_30x10','PIX_150x70') OR jsonb_typeof(p_definition->'payload') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_copy_definition'; END IF;
  INSERT INTO public.user_logos(user_id,name,type,payload) VALUES(p_owner,packet_name,typ,p_definition->'payload') RETURNING id INTO target;
 END IF;
 INSERT INTO public.resource_clone_receipts(id,recipient_id,creator_id,creator_identity,request_id,source_id,resource_kind,action,demo_origin,definition_hash,game_id,base_id,logo_id)
  VALUES(copy_id,p_owner,p_actor,p_actor,p_request,p_source,p_kind,p_action,coalesce(p_demo,false),hash,
   CASE WHEN p_kind='game' THEN target END,CASE WHEN p_kind='base' THEN target END,CASE WHEN p_kind='logo' THEN target END);
 RETURN jsonb_build_object('ok',true,'id',target,'already',false);
END $$;


--
-- Name: _resource_copy_history_gc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_copy_history_gc"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE removed integer;
BEGIN DELETE FROM public.resource_copy_history WHERE sent_at<=clock_timestamp()-interval '30 days'; GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed; END $$;


--
-- Name: _resource_copy_mail_epoch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_copy_mail_epoch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.token IS DISTINCT FROM OLD.token OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id THEN
  UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE copy_offer_id=OLD.id AND revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: _resource_copy_offer_gc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_copy_offer_gc"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE item public.resource_copy_offers; removed integer:=0;
BEGIN
 FOR item IN SELECT * FROM public.resource_copy_offers WHERE status='pending' AND created_at+interval '5 days'<=clock_timestamp() FOR UPDATE SKIP LOCKED LOOP
  PERFORM public._copy_discard(item.id,'expired');removed:=removed+1;
 END LOOP;
 RETURN removed;
END $$;


--
-- Name: _resource_demo_origin_mark(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_resource_demo_origin_mark"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NEW.is_demo THEN
  IF TG_TABLE_NAME='games' THEN INSERT INTO public.resource_demo_origins(owner_id,game_id) VALUES(NEW.owner_id,NEW.id) ON CONFLICT(game_id) DO NOTHING;
  ELSIF TG_TABLE_NAME='question_bases' THEN INSERT INTO public.resource_demo_origins(owner_id,base_id) VALUES(NEW.owner_id,NEW.id) ON CONFLICT(base_id) DO NOTHING;
  ELSE INSERT INTO public.resource_demo_origins(owner_id,logo_id) VALUES(NEW.user_id,NEW.id) ON CONFLICT(logo_id) DO NOTHING; END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: _storage_cleanup_kick_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_storage_cleanup_kick_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.storage_cleanup_kick();
  return null;
end;
$$;


--
-- Name: _storage_cleanup_on_game_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_storage_cleanup_on_game_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
  values ('user-sounds', old.owner_id::text || '/' || old.id::text, true, 'game', old.id);
  return old;
end;
$$;


--
-- Name: _storage_cleanup_on_logo_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_storage_cleanup_on_logo_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_path text;
BEGIN
  v_path := public._logo_url_path(old.payload #>> '{source,imageUrl}', old.user_id);
  IF v_path IS NOT NULL THEN
    INSERT INTO public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
    VALUES ('user-logos', v_path, false, 'logo', old.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN old;
END;
$$;


--
-- Name: _storage_cleanup_on_profile_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_storage_cleanup_on_profile_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- cały folder użytkownika w obu bucketach (także stare ścieżki sprzed 214)
  insert into public.storage_cleanup_queue(bucket, path, is_folder, owner_kind, owner_id)
  values ('user-sounds', old.id::text, true, 'user', old.id),
         ('user-logos',  old.id::text, true, 'user', old.id);
  return old;
end;
$$;


--
-- Name: _subscriber_close("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_subscriber_close"("p_token" "uuid", "p_allow_active" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE s public.poll_subscriptions%rowtype; e text;
BEGIN
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT public._norm_email(coalesce(s.subscriber_email,p.email)) INTO e
 FROM (SELECT 1) x LEFT JOIN auth.users p ON p.id=s.subscriber_user_id;
 IF e IS NULL THEN RETURN false; END IF;
 IF s.registered_user_id IS NOT NULL AND auth.uid() IS DISTINCT FROM s.registered_user_id THEN RETURN false; END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[e],ARRAY[auth.uid(),s.owner_id,s.subscriber_user_id,s.registered_user_id]);
 PERFORM public._subscriber_pair_lock(s.owner_id,e);
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
 IF NOT FOUND OR s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL
 OR NOT (s.status='pending' OR (p_allow_active AND s.status='active')) THEN RETURN false; END IF;
 IF s.registered_user_id IS NOT NULL AND auth.uid() IS DISTINCT FROM s.registered_user_id THEN RETURN false; END IF;
 UPDATE public.poll_subscriptions SET status='declined',declined_at=now(),opened_at=coalesce(opened_at,now()) WHERE id=s.id;
 PERFORM public.mail_cooldown_reserve('poll:invite_after_reject','pair:'||s.owner_id::text||CASE WHEN s.registered_user_id IS NULL THEN ':email:'||md5(e) ELSE ':user:'||s.registered_user_id::text END);
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=now()
 WHERE owner_id=s.owner_id AND status IN ('pending','opened')
 AND (source_subscription_id=s.id OR (source_kind='game' AND ((s.subscriber_user_id IS NOT NULL AND recipient_user_id=s.subscriber_user_id) OR public._norm_email(recipient_email)=e)));
 RETURN true;
END; $$;


--
-- Name: _subscriber_identity_account_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_subscriber_identity_account_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 DELETE FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject'
  AND (target_key LIKE 'pair:'||OLD.id::text||':%' OR target_key LIKE 'pair:%:user:'||OLD.id::text);
 RETURN OLD;
END $$;


--
-- Name: _subscriber_identity_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_subscriber_identity_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 PERFORM public._poll_identity_email_refs(ARRAY[NEW.subscriber_email],ARRAY[NEW.owner_id,NEW.subscriber_user_id,auth.uid()]);
 NEW.registered_user_id:=coalesce(NEW.subscriber_user_id,public._poll_registered_uid(NEW.subscriber_email));
 RETURN NEW;
END $$;


--
-- Name: _subscriber_identity_refusal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_subscriber_identity_refusal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE holder uuid:=coalesce(NEW.registered_user_id,NEW.subscriber_user_id); old_key text; new_key text; deadline timestamptz;
BEGIN
 IF holder IS NULL THEN RETURN NEW; END IF;
 old_key:='pair:'||NEW.owner_id::text||':email:'||md5(public._norm_email(NEW.subscriber_email));
 new_key:='pair:'||NEW.owner_id::text||':user:'||holder::text;
 SELECT greatest(NEW.declined_at+interval '30 days',max(next_allowed_at)) INTO deadline
  FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject' AND target_key=old_key;
 IF deadline IS NOT NULL THEN
  INSERT INTO public.mail_cooldowns(action_key,target_key,next_allowed_at)
  VALUES('poll:invite_after_reject',new_key,deadline)
  ON CONFLICT(action_key,target_key) DO UPDATE SET next_allowed_at=greatest(public.mail_cooldowns.next_allowed_at,excluded.next_allowed_at),updated_at=now();
  IF NOT EXISTS(SELECT 1 FROM public.poll_subscriptions s WHERE s.owner_id=NEW.owner_id
    AND s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL
    AND public._norm_email(s.subscriber_email)=public._norm_email(NEW.subscriber_email)
    AND s.declined_at>now()-interval '30 days') THEN
   DELETE FROM public.mail_cooldowns WHERE action_key='poll:invite_after_reject' AND target_key=old_key;
  END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: _subscriber_pair_lock("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_subscriber_pair_lock"("p_owner" "uuid", "p_email" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT pg_advisory_xact_lock(hashtextextended(p_owner::text||':email:'||public._norm_email(p_email),333));
$$;


--
-- Name: _subscriber_refusal_until("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_subscriber_refusal_until"("p_owner" "uuid", "p_email" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 WITH recipient AS (SELECT public._poll_registered_uid(p_email) AS id), relevant AS (
  SELECT s.* FROM public.poll_subscriptions s,recipient r WHERE s.owner_id=p_owner
  AND (s.registered_user_id=r.id OR s.subscriber_user_id=r.id
    OR(s.registered_user_id IS NULL AND s.subscriber_user_id IS NULL AND public._norm_email(s.subscriber_email)=public._norm_email(p_email)))
 ) SELECT greatest((SELECT max(declined_at)+interval '30 days' FROM relevant WHERE declined_at>now()-interval '30 days'),
  (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c,recipient r WHERE c.action_key='poll:invite_after_reject' AND c.next_allowed_at>now()
   AND(c.target_key='pair:'||p_owner::text||':email:'||md5(public._norm_email(p_email))
    OR c.target_key='pair:'||p_owner::text||':user:'||r.id::text)));
$$;


--
-- Name: acknowledge_display_audio_unlock("uuid", "text", "text", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."acknowledge_display_audio_unlock"("p_game_id" "uuid", "p_key" "text", "p_nonce" "text", "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE changed integer;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.display_audio_unlock SET acknowledged_nonce=request_nonce,acknowledged_at=now()
    WHERE game_id=p_game_id AND request_nonce=p_nonce;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;


--
-- Name: acquire_edit_lock("text", "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."acquire_edit_lock"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text", "p_context" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.acquire_edit_lock_mode(p_resource_type, p_resource_id, p_tab_id, p_context, 'exclusive');
$$;


--
-- Name: acquire_edit_lock_mode("text", "uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."acquire_edit_lock_mode"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text", "p_context" "text" DEFAULT NULL::"text", "p_mode" "text" DEFAULT 'exclusive'::"text") RETURNS "jsonb"
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
  if p_mode not in ('exclusive', 'shared') then  -- 316:
    return jsonb_build_object('ok', false, 'error', 'unknown_mode');
  end if;
  if p_resource_type not in ('game', 'logo', 'logos', 'base', 'base_question', 'base_folder', 'base_tag') then  -- 316: + logos
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
  v_exists := case p_resource_type
    when 'game' then exists (select 1 from public.games where id = p_resource_id)
    when 'logo' then exists (select 1 from public.user_logos where id = p_resource_id)
    when 'logos' then p_resource_id = v_uid  -- 316: id = użytkownik
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

  -- 316: serializacja zajmowania w obrębie zasobu; logo i pula logo użytkownika
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

  -- 316: wygasłe trzymania innych kart tego zasobu znikają (zwalniają klucz
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
      'blocker_type', v_row.resource_type, 'blocker_mode', v_row.mode,
      'blocker_context', v_row.holder_context);
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


--
-- Name: admin_config_get("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_config_get"("p_key" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT value FROM public.app_config WHERE key = p_key;
$$;


--
-- Name: admin_config_set("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_config_set"("p_key" "text", "p_value" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    insert into public.app_config (key, value, note)
    values (p_key, coalesce(p_value, ''), p_note)
    on conflict (key) do update
        set value = excluded.value,
            note  = coalesce(excluded.note, app_config.note);
    return true;
end;
$$;


--
-- Name: admin_move_message("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_move_message"("p_message_id" "uuid", "p_target_ticket" "text") RETURNS TABLE("ok" boolean, "err" "text", "old_ticket" "text", "new_ticket" "text", "old_email" "text", "new_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_msg    public.contact_report_messages%ROWTYPE;
  v_old    public.contact_reports%ROWTYPE;
  v_new    public.contact_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_msg FROM public.contact_report_messages WHERE id = p_message_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'message_not_found'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  SELECT * INTO v_old FROM public.contact_reports WHERE id = v_msg.report_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'source_ticket_not_found'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  SELECT * INTO v_new FROM public.contact_reports WHERE ticket_number = p_target_ticket LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'target_ticket_not_found'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  IF v_old.id = v_new.id THEN
    RETURN QUERY SELECT false, 'same_ticket'::text, null::text, null::text, null::text, null::text; RETURN;
  END IF;

  UPDATE public.contact_report_messages
  SET report_id = v_new.id, moved_from_report_id = v_old.id
  WHERE id = p_message_id;

  RETURN QUERY SELECT true, null::text, v_old.ticket_number, v_new.ticket_number, v_old.email, v_new.email;
END;
$$;


--
-- Name: admin_update_contact_report("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_update_contact_report"("p_id" "uuid", "p_status" "text" DEFAULT NULL::"text", "p_reply_message" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_exists boolean;
begin
  select exists(select 1 from public.contact_reports where id = p_id) into v_exists;
  if not v_exists then
    return query select false, 'not_found'::text;
    return;
  end if;

  if p_status is not null and p_status not in ('open','replied','closed') then
    return query select false, 'invalid_status'::text;
    return;
  end if;

  update public.contact_reports
  set
    status        = coalesce(p_status, status),
    reply_message = coalesce(p_reply_message, reply_message),
    replied_at    = case
                      when p_status = 'replied' then now()
                      else replied_at
                    end
  where id = p_id;

  -- log outbound message to thread
  if p_reply_message is not null then
    insert into public.contact_report_messages (report_id, direction, body, from_email)
    values (p_id, 'outbound', p_reply_message, 'kontakt@familiada.online');
  end if;

  return query select true, null::text;
end;
$$;


--
-- Name: answers_rules_state_stmt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."answers_rules_state_stmt"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct q.game_id) into v_ids
    from new_rows r join public.questions q on q.id = r.question_id;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct q.game_id) into v_ids
    from old_rows r join public.questions q on q.id = r.question_id;
  else
    select array_agg(distinct q.game_id) into v_ids
    from (select question_id from new_rows union select question_id from old_rows) r
    join public.questions q on q.id = r.question_id;
  end if;
  if v_ids is not null then
    perform public.games_rules_state_refresh(v_ids);
  end if;
  return null;
end;
$$;


--
-- Name: are_friends("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."are_friends"("a" "uuid", "b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'active'
      AND ((f.requester_id = a AND f.addressee_id = b)
        OR (f.requester_id = b AND f.addressee_id = a))
  )
$$;


--
-- Name: assert_game_answers_minmax(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."assert_game_answers_minmax"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  qn int;
  bad_q int;
  an int;
begin
  -- Walidujemy tylko gdy zmieniasz status na poll_open (start) albo ready (zamykanie)
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status not in ('poll_open'::game_status, 'poll_stopped'::game_status, 'ready'::game_status) then
    return new;
  end if;

  -- gra preparowana nie ma sondażu, więc nie blokuj statusów z tej funkcji
  if new.type = 'prepared'::game_type then
    return new;
  end if;

  -- >= 10 pytań zawsze dla poll_text i poll_points
  select count(*) into qn
  from public.questions
  where game_id = new.id;

  if qn < 10 then
    raise exception 'assert_game_answers_minmax: need >=10 questions (have %)', qn;
  end if;

  -- poll_points: każde pytanie musi mieć 3..6 odpowiedzi (dla startu i zamknięcia)
  if new.type = 'poll_points'::game_type then
    select q.ord into bad_q
    from public.questions q
    where q.game_id = new.id
      and (
        (select count(*) from public.answers a where a.question_id = q.id) < 3
        or
        (select count(*) from public.answers a where a.question_id = q.id) > 6
      )
    order by q.ord
    limit 1;

    if bad_q is not null then
      select count(*) into an
      from public.answers a
      join public.questions q on q.id = a.question_id
      where q.game_id = new.id and q.ord = bad_q;

      raise exception 'assert_game_answers_minmax: question % must have 3..6 answers (have %)', bad_q, an;
    end if;
  end if;

  -- poll_text: tu nie walidujemy liczby odpowiedzi (bo w trakcie to teksty od ludzi),
  -- jedynie >=10 pytań.

  return new;
end $$;


--
-- Name: assign_message_to_report("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."assign_message_to_report"("p_message_id" "uuid", "p_report_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.messages SET report_id = p_report_id WHERE id = p_message_id;
END;
$$;


--
-- Name: auth_clear_email_change("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."auth_clear_email_change"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  sets text[] := array[]::text[];
  q    text;
  has_col boolean;
BEGIN
  -- new_email (legacy GoTrue)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'new_email'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'new_email = '''''); END IF;

  -- email_change (current GoTrue)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change = '''''); END IF;

  -- email_change_token_current
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_current'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_token_current = '''''); END IF;

  -- email_change_token_new
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_new'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_token_new = '''''); END IF;

  -- email_change_sent_at
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_sent_at'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_sent_at = null'); END IF;

  -- email_change_confirm_status
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_confirm_status'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_confirm_status = 0'); END IF;

  IF array_length(sets, 1) IS NULL THEN
    RETURN false; -- unknown GoTrue layout
  END IF;

  q := format('UPDATE auth.users SET %s WHERE id = $1', array_to_string(sets, ', '));
  EXECUTE q USING p_user_id;

  RETURN true;
END;
$_$;


--
-- Name: badges_get(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."badges_get"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_polls   integer;
  v_friends integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('tasks_pending', 0, 'friends_pending', 0);
  END IF;
  PERFORM public.poll_claim_email_records();

  SELECT count(*) INTO v_polls
  FROM public.poll_tasks t
  WHERE t.recipient_user_id = v_uid
    AND t.done_at IS NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL;

  SELECT count(*) INTO v_friends
  FROM public.friendships f
  WHERE f.decision_user_id = v_uid AND f.status = 'pending' AND f.cancelled_at IS NULL;

  RETURN jsonb_build_object('tasks_pending', v_polls, 'friends_pending', v_friends);
END;
$$;


--
-- Name: base_can_access("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_can_access"("p_base_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = p_user_id
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = p_user_id
        )
      )
  );
$$;


--
-- Name: base_can_edit("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_can_edit"("p_base_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = p_user_id
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = p_user_id
            and s.role = 'editor'
        )
      )
  );
$$;


--
-- Name: base_declines_list_mine(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_declines_list_mine"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'base_id',b.id,'name',b.name,
  'owner_label',coalesce(nullif(p.username,''),p.email),'role',t.role,'token',t.token,
  'declined_at',t.declined_at,'expires_at',t.declined_at+interval '30 days') ORDER BY t.declined_at DESC),'[]'::jsonb)
 FROM public.base_share_tasks t JOIN public.question_bases b ON b.id=t.base_id
 JOIN public.profiles p ON p.id=t.owner_id
 WHERE t.recipient_user_id=auth.uid() AND b.owner_id=t.owner_id AND t.cancelled_at IS NULL AND t.status='declined' AND t.declined_at>now()-interval '30 days';
$$;


--
-- Name: base_has_share("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_has_share"("p_base_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.question_base_shares s
    where s.base_id = p_base_id
      and s.user_id = p_user_id
  );
$$;


--
-- Name: base_is_owner("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_is_owner"("p_base_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and b.owner_id = p_user_id
  );
$$;


--
-- Name: base_share_accept("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_accept"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); t public.base_share_tasks%rowtype;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND NOT is_guest) THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=uid;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(t.base_id,uid);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=uid FOR UPDATE;
 IF NOT FOUND OR t.recipient_user_id IS DISTINCT FROM uid OR t.status NOT IN ('pending','opened') OR t.cancelled_at IS NOT NULL
 OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')<=now() THEN RETURN false; END IF;
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.question_base_shares(base_id,user_id,role) VALUES(t.base_id,uid,t.role)
 ON CONFLICT(base_id,user_id) DO UPDATE SET role=excluded.role;
 UPDATE public.base_share_tasks SET status='done',accepted_at=coalesce(accepted_at,now()) WHERE id=t.id;
 RETURN true;
END; $$;


--
-- Name: base_share_by_email("uuid", "text", "public"."base_share_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_by_email"("p_base_id" "uuid", "p_email" "text", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE recipient uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN QUERY SELECT false,'auth required',NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::uuid; RETURN; END IF;
 SELECT id INTO recipient FROM public.profiles WHERE public._norm_email(email)=public._norm_email(p_email) AND NOT is_guest LIMIT 1;
 RETURN QUERY SELECT * FROM public.base_share_by_user(p_base_id,recipient,p_role);
END; $$;


--
-- Name: base_share_by_user("uuid", "text", "public"."base_share_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_by_user"("p_base_id" "uuid", "p_user_lookup" "text", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_lookup text := lower(trim(p_user_lookup));
  v_recipient uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND public._poll_identity_regular(u.id,to_jsonb(u))) OR NOT EXISTS (
    SELECT 1 FROM public.question_bases qb WHERE qb.id = p_base_id AND qb.owner_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT false, 'not_owner', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT pr.id INTO v_recipient FROM public.profiles pr JOIN auth.users u ON u.id=pr.id
  WHERE NOT pr.is_guest AND public._poll_identity_regular(u.id,to_jsonb(u))
    AND ((position('@' in v_lookup)>0 AND public._poll_registered_uid(v_lookup)=pr.id)
      OR (position('@' in v_lookup)=0 AND lower(trim(pr.username))=v_lookup)) LIMIT 1;

  IF v_recipient IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_user', NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public._base_share_create(p_base_id, v_recipient, p_role, false, CASE WHEN position('@' in v_lookup)>0 THEN v_lookup END);
END;
$$;


--
-- Name: base_share_by_user("uuid", "uuid", "public"."base_share_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_by_user"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN
 RETURN QUERY SELECT * FROM public._base_share_create(p_base_id,p_recipient_user_id,p_role,false);
 END $$;


--
-- Name: base_share_cancel_task("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_cancel_task"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.base_share_tasks%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now()
 WHERE id=p_task_id AND owner_id=auth.uid() AND status IN ('pending','opened','declined');
 RETURN FOUND;
END; $$;


--
-- Name: base_share_decline("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_decline"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN false; END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT public._base_task_source_lock(v_t) THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(v_t.base_id,v_uid);
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_t.status NOT IN ('pending','opened') OR v_t.cancelled_at IS NOT NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF coalesce(v_t.declined_at+interval '30 days',v_t.created_at+interval '5 days')<=now() THEN RETURN false; END IF;
 UPDATE public.base_share_tasks SET status='declined',declined_at=coalesce(declined_at,now()) WHERE id=p_task_id;
 IF v_t.declined_at IS NULL THEN
  PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||v_t.owner_id||':'||v_uid||':base:'||v_t.base_id);
 END IF;
 RETURN true;
END; $$;


--
-- Name: base_share_panel("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_panel"("p_base_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); b public.question_bases%rowtype; friends jsonb; outgoing jsonb; active jsonb;
BEGIN
 SELECT * INTO b FROM public.question_bases WHERE id=p_base_id AND owner_id=uid;
 IF uid IS NULL OR NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,
  'cooldown_until',greatest(public._base_share_refusal_until(p_base_id,f.user_id),
   (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c WHERE public._contact_mail_enabled(f.email) AND c.action_key='base:share' AND c.next_allowed_at>now()
    AND c.target_key='pair:'||uid||':'||f.user_id||':base:'||p_base_id)),
  'email_enabled',public._contact_mail_enabled(f.email)) ORDER BY f.label),'[]'::jsonb) INTO friends
 FROM public.friends_list() f WHERE f.status='active' AND f.direction='friend'
 AND NOT EXISTS(SELECT 1 FROM public.question_base_shares s WHERE s.base_id=p_base_id AND s.user_id=f.user_id)
 AND NOT EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.base_id=p_base_id AND t.recipient_user_id=f.user_id
  AND t.status IN ('pending','opened') AND t.cancelled_at IS NULL
  AND coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now());
 SELECT coalesce(jsonb_agg(jsonb_build_object('task_id',t.id,'recipient_user_id',t.recipient_user_id,
  'label',coalesce(nullif(p.username,''),t.recipient_email),'email',t.recipient_email,'role',t.role,'status',t.status,
  'is_friend',public.are_friends(uid,t.recipient_user_id),'email_enabled',public._contact_mail_enabled(p.email),
  'declined_at',t.declined_at,'expires_at',coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days'),
  'cooldown_until',CASE WHEN t.status='declined' THEN public._base_share_refusal_until(p_base_id,t.recipient_user_id)
    ELSE (SELECT max(c.next_allowed_at) FROM public.mail_cooldowns c WHERE c.action_key='base:share' AND c.next_allowed_at>now()
     AND c.target_key='pair:'||uid||':'||t.recipient_user_id||':base:'||p_base_id) END)
 ORDER BY t.created_at DESC),'[]'::jsonb) INTO outgoing
 FROM public.base_share_tasks t JOIN public.profiles p ON p.id=t.recipient_user_id
 WHERE t.base_id=p_base_id AND t.owner_id=uid AND t.cancelled_at IS NULL
 AND ((t.status IN ('pending','opened') AND coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now())
 OR (t.status='declined' AND t.declined_at>now()-interval '5 days'));
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'label',coalesce(nullif(p.username,''),p.email),
  'email',p.email,'role',s.role,'status','done','is_friend',public.are_friends(uid,s.user_id)) ORDER BY p.username),'[]'::jsonb) INTO active
 FROM public.question_base_shares s JOIN public.profiles p ON p.id=s.user_id WHERE s.base_id=p_base_id;
 RETURN jsonb_build_object('ok',true,'friends',friends,'outgoing',outgoing,'active',active);
END; $$;


--
-- Name: base_share_resend("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_resend"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_base_share_resend(p_task_id);
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification('base',p_task_id,'base:share'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: base_share_tasks_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_tasks_cleanup"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 DELETE FROM public.base_share_tasks
 WHERE status IN ('pending','opened','declined')
   AND CASE WHEN declined_at IS NOT NULL THEN declined_at+interval '30 days'
            ELSE created_at+interval '5 days' END<=now();
$$;


--
-- Name: base_share_to_friend("uuid", "uuid", "public"."base_share_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_to_friend"("p_base_id" "uuid", "p_recipient_user_id" "uuid", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text", "mail_to" "text", "mail_link" "text", "base_name" "text", "owner_label" "text", "cooldown_until" timestamp with time zone, "recipient_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN
 RETURN QUERY SELECT * FROM public._base_share_create(p_base_id,p_recipient_user_id,p_role,true);
 END $$;


--
-- Name: base_share_token_info("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_token_info"("p_token" "text") RETURNS TABLE("status" "text", "base_id" "uuid", "recipient_user_id" "uuid", "recipient_email" "text", "owner_id" "uuid", "owner_email" "text", "owner_username" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    t.status,
    t.base_id,
    t.recipient_user_id,
    t.recipient_email,
    t.owner_id,
    op.email as owner_email,
    op.username as owner_username
  from public.base_share_tasks t
  JOIN public.question_bases b ON b.id=t.base_id AND b.owner_id=t.owner_id
  left join public.profiles op on op.id = t.owner_id
  where t.token::text=p_token AND public._base_task_source_active(t)
  and (t.status not in ('pending','opened','declined') OR coalesce(t.declined_at+interval '30 days',t.created_at+interval '5 days')>now())
  limit 1;
$$;


--
-- Name: base_share_undo_decline("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_undo_decline"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_t public.base_share_tasks%rowtype;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF NOT public._base_task_source_lock(v_t) THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(v_t.base_id,v_uid);
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 SELECT * INTO v_t FROM public.base_share_tasks WHERE id=p_task_id AND recipient_user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF v_t.status<>'declined' OR v_t.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_declined'); END IF;
 PERFORM 1 FROM public.question_bases WHERE id=v_t.base_id AND owner_id=v_t.owner_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF v_t.declined_at+interval '30 days'<=now() THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 UPDATE public.base_share_tasks SET status='pending' WHERE id=p_task_id;
 RETURN jsonb_build_object('ok',true,'id',p_task_id,'status','pending');
END; $$;


--
-- Name: base_share_update_invite_role("uuid", "public"."base_share_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."base_share_update_invite_role"("p_task_id" "uuid", "p_role" "public"."base_share_role") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.base_share_tasks%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 IF p_role IS NULL THEN RETURN jsonb_build_object('ok',false,'err','invalid_role'); END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE id=p_task_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF NOT public._base_task_source_lock(t) THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 PERFORM public._base_share_pair_lock(t.base_id,t.recipient_user_id);
 PERFORM 1 FROM public.question_bases WHERE id=t.base_id AND owner_id=t.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 UPDATE public.base_share_tasks SET role=p_role WHERE id=p_task_id AND owner_id=auth.uid()
 AND status IN ('pending','opened','declined') AND cancelled_at IS NULL
 AND coalesce(declined_at+interval '30 days',created_at+interval '5 days')>now();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 RETURN jsonb_build_object('ok',true,'role',p_role);
END; $$;


--
-- Name: bases_count_incoming_share_invites(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."bases_count_incoming_share_invites"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_cnt integer;
begin
  perform public.base_share_tasks_cleanup();

  select count(*)::int into v_cnt
  from public.base_share_tasks t
  where t.recipient_user_id = auth.uid()
    and t.status in ('pending','opened');

  return coalesce(v_cnt, 0);
end;
$$;


--
-- Name: begin_display_audio_session("uuid", "text", "text", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."begin_display_audio_session"("p_game_id" "uuid", "p_key" "text", "p_session_nonce" "text", "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_session_nonce IS NULL OR length(p_session_nonce)<8 OR length(p_session_nonce)>100 THEN RAISE EXCEPTION 'invalid nonce'; END IF;
  INSERT INTO public.display_audio_unlock(game_id,session_nonce,request_nonce,acknowledged_nonce,requested_at,acknowledged_at)
    VALUES(p_game_id,p_session_nonce,p_session_nonce,NULL,now(),NULL)
    ON CONFLICT(game_id) DO UPDATE SET session_nonce=EXCLUDED.session_nonce,request_nonce=EXCLUDED.request_nonce,acknowledged_nonce=NULL,requested_at=now(),acknowledged_at=NULL;
  RETURN true;
END $$;


--
-- Name: can_access_base("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."can_access_base"("p_base_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = auth.uid()
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = auth.uid()
        )
      )
  );
$$;


--
-- Name: can_edit_base("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."can_edit_base"("p_base_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = auth.uid()
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = auth.uid()
            and s.role = 'editor'
        )
      )
  );
$$;


--
-- Name: can_edit_locked_resource("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."can_edit_locked_resource"("p_resource_type" "text", "p_resource_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE p_resource_type
    WHEN 'game' THEN EXISTS (
      SELECT 1 FROM public.games WHERE id = p_resource_id AND owner_id = auth.uid()
    )
    WHEN 'logo' THEN EXISTS (
      SELECT 1 FROM public.user_logos WHERE id = p_resource_id AND user_id = auth.uid()
    )
    WHEN 'logos' THEN p_resource_id = auth.uid()  -- 316: pula logo użytkownika
    WHEN 'base' THEN public.base_can_edit(p_resource_id, auth.uid())
    WHEN 'base_question' THEN EXISTS (
      SELECT 1 FROM public.qb_questions q
      WHERE q.id = p_resource_id AND public.base_can_edit(q.base_id, auth.uid())
    )
    WHEN 'base_folder' THEN EXISTS (
      SELECT 1 FROM public.qb_categories c
      WHERE c.id = p_resource_id AND public.base_can_edit(c.base_id, auth.uid())
    )
    WHEN 'base_tag' THEN EXISTS (
      SELECT 1 FROM public.qb_tags t
      WHERE t.id = p_resource_id AND public.base_can_edit(t.base_id, auth.uid())
    )
    ELSE false
  END;
$$;


--
-- Name: cancel_my_email_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cancel_my_email_change"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_new_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- W nowszych wersjach Supabase kolumna nazywa się 'email_change', a nie 'new_email'
  SELECT email_change INTO v_new_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Czyścimy tokeny i oczekujący e-mail
  PERFORM public.auth_clear_email_change(v_user_id);

  -- Oznaczamy intencję jako wygasłą w naszej tabeli pomocniczej
  IF v_new_email IS NOT NULL AND v_new_email <> '' THEN
    UPDATE public.email_intents
    SET status = 'expired', updated_at = now()
    WHERE email = lower(v_new_email);
  END IF;

  RETURN true;
END;
$$;


--
-- Name: marketing_raw_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marketing_raw_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "url" "text" NOT NULL,
    "emails_found" "jsonb" DEFAULT '[]'::"jsonb",
    "title" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "reject_reason" "text",
    "page_text" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "processing_started_at" timestamp with time zone
);


--
-- Name: claim_next_pending_lead(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."claim_next_pending_lead"() RETURNS SETOF "public"."marketing_raw_contacts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_id uuid;
BEGIN
  -- FOR UPDATE SKIP LOCKED is exactly what we need for concurrency
  SELECT id INTO target_id
  FROM "public"."marketing_raw_contacts"
  WHERE "status" = 'pending'
  ORDER BY "id" ASC  -- process oldest first
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF target_id IS NOT NULL THEN
    UPDATE "public"."marketing_raw_contacts"
    SET "status" = 'processing', "processing_started_at" = now()
    WHERE "id" = target_id;
    
    RETURN QUERY SELECT * FROM "public"."marketing_raw_contacts" WHERE "id" = target_id;
  END IF;

  RETURN;
END;
$$;


--
-- Name: cleanup_trash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cleanup_trash"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM public.messages
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '30 days'
     RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;


--
-- Name: clear_marketing_search_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."clear_marketing_search_logs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    TRUNCATE marketing_search_logs RESTART IDENTITY CASCADE;
END;
$$;


--
-- Name: contact_reports_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."contact_reports_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: contacts_list("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."contacts_list"("p_kind" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_row jsonb; v_rows jsonb; v_result jsonb:='[]';
  v_target text; v_until timestamptz; v_enabled boolean; v_declined_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  IF p_kind='friends' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO v_rows FROM public.friends_list() f;
  ELSIF p_kind='subscribers' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO v_rows FROM public.subscribers_list() s;
  ELSE RETURN jsonb_build_object('ok',false,'err','invalid_kind'); END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_until:=NULL; v_declined_at:=NULL;
    IF p_kind='friends' THEN
      SELECT declined_at INTO v_declined_at FROM public.friendships WHERE id=(v_row->>'id')::uuid;
    ELSE
      SELECT declined_at INTO v_declined_at FROM public.poll_subscriptions WHERE id=(v_row->>'id')::uuid;
    END IF;
    v_enabled:=public._contact_mail_enabled(v_row->>'email')
      AND (p_kind<>'subscribers' OR v_row->>'friend_user_id' IS NULL);
    IF v_row->>'status'='pending' AND (p_kind='subscribers' OR v_row->>'direction'='outgoing') THEN
      IF p_kind='friends' THEN
        v_target:='pair:'||v_uid::text||':'||(v_row->>'user_id');
        SELECT greatest(max(next_allowed_at),public._friend_mail_limit_until(v_uid,(v_row->>'user_id')::uuid),
            (v_row->>'email_sent_at')::timestamptz+interval '5 days')
          INTO v_until FROM public.mail_cooldowns
          WHERE target_key IN (v_target,'pair:'||(v_row->>'user_id')||':'||v_uid) AND action_key IN ('friend:invite','friend:resend');
      ELSE
        v_target:='pair:'||v_uid::text||':email:'||md5(lower(trim(v_row->>'email')));
        SELECT greatest(max(next_allowed_at),public._poll_sub_mail_limit_until(v_uid,NULL,v_row->>'email'))
          INTO v_until FROM public.mail_cooldowns
          WHERE target_key=v_target AND action_key IN ('poll:invite','poll:resend');
      END IF;
      IF v_until<=now() THEN v_until:=NULL; END IF;
    END IF;
    v_result:=v_result||jsonb_build_array(v_row||jsonb_build_object(
      'email_enabled',v_enabled,'resend_available_at',v_until,
      'declined_at',v_declined_at,'decline_expires_at',v_declined_at+interval '30 days'));
  END LOOP;
  RETURN v_result;
END; $$;


--
-- Name: control2_display_event("uuid", "text", "jsonb", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control2_display_event"("p_game_id" "uuid", "p_key" "text", "p_event" "jsonb", "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE sid uuid; event_name text; event_details jsonb;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_event IS NULL OR octet_length(p_event::text)>2000 THEN RAISE EXCEPTION 'invalid event'; END IF;
  event_name:=p_event->>'event_type';
  IF event_name IS NULL OR event_name NOT IN ('page_state','render_stall','runtime_error','network_state') THEN RAISE EXCEPTION 'invalid event type'; END IF;
  SELECT a.session_id INTO sid FROM public.game_session_active a
    JOIN public.game_sessions s ON s.id=a.session_id AND s.game_id=a.game_id
    WHERE a.game_id=p_game_id AND s.control_version=2 AND s.ended_at IS NULL;
  IF sid IS NULL THEN RETURN false; END IF;
  IF event_name='page_state' THEN
    event_details:=jsonb_build_object('reason',CASE WHEN p_event->>'reason' IN ('initial','visibilitychange','focus','blur') THEN p_event->>'reason' ELSE 'statechange' END,
      'visibility',CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'focused',CASE WHEN jsonb_typeof(p_event->'focused')='boolean' THEN (p_event->>'focused')::boolean ELSE NULL END,
      'was_discarded',CASE WHEN jsonb_typeof(p_event->'was_discarded')='boolean' THEN (p_event->>'was_discarded')::boolean ELSE NULL END);
  ELSIF event_name='render_stall' THEN
    event_details:=jsonb_build_object('max_frame_gap_ms',LEAST(60000,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'max_frame_gap_ms')='number' THEN (p_event->>'max_frame_gap_ms')::numeric ELSE 0 END))::integer,
      'stalled_frames',LEAST(10000,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'stalled_frames')='number' THEN (p_event->>'stalled_frames')::numeric ELSE 0 END))::integer,
      'visibility',CASE WHEN p_event->>'visibility' IN ('visible','hidden') THEN p_event->>'visibility' ELSE 'unknown' END,
      'state_rev',LEAST(9223372036854775807::numeric,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint);
  ELSIF event_name='runtime_error' THEN
    event_details:=jsonb_build_object('phase',CASE WHEN p_event->>'phase' IN ('render','completion_ack') THEN p_event->>'phase' ELSE 'other' END,
      'error_name',left(coalesce(p_event->>'error_name','Error'),80),
      'state_rev',LEAST(9223372036854775807::numeric,GREATEST(0,CASE WHEN jsonb_typeof(p_event->'state_rev')='number' THEN (p_event->>'state_rev')::numeric ELSE 0 END))::bigint);
  ELSE
    event_details:=jsonb_build_object('online',CASE WHEN jsonb_typeof(p_event->'online')='boolean' THEN (p_event->>'online')::boolean ELSE false END);
  END IF;
  INSERT INTO public.control2_device_events(game_id,session_id,event_type,event_id,details)
    VALUES(p_game_id,sid,event_name,left(p_event->>'event_id',80),event_details)
    ON CONFLICT(game_id,event_id) WHERE event_id IS NOT NULL DO NOTHING;
  DELETE FROM public.control2_device_events e WHERE e.game_id=p_game_id AND
    (e.created_at<now()-interval '30 days' OR e.id IN (SELECT id FROM public.control2_device_events WHERE game_id=p_game_id ORDER BY created_at DESC,id DESC OFFSET 500));
  RETURN true;
END $$;


--
-- Name: control2_session_ping("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control2_session_ping"("p_game_id" "uuid", "p_event" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE sid uuid; item jsonb; events jsonb; event_kind text; category text; session_ended boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT session_id INTO sid FROM public.game_session_active WHERE game_id=p_game_id;
  IF sid IS NULL THEN RETURN; END IF;
  SELECT coalesce(stats_detail->'events','[]'), ended_at IS NOT NULL INTO events, session_ended
    FROM public.game_sessions WHERE id=sid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF session_ended AND coalesce(p_event->>'kind','') <> 'diagnostic' THEN RETURN; END IF;
  IF p_event IS NOT NULL THEN
    event_kind:=p_event->>'kind';
    IF event_kind IS NULL OR event_kind NOT IN ('error','disconnect','reconnect','diagnostic') THEN RAISE EXCEPTION 'invalid event'; END IF;
    IF octet_length(p_event::text)>6000 THEN RAISE EXCEPTION 'event too large'; END IF;
    IF event_kind='diagnostic' THEN
      category:=p_event->>'category';
      IF category IS NULL OR category NOT IN ('connectivity','audio_start','display_delay') THEN RAISE EXCEPTION 'invalid diagnostic category'; END IF;
      item:=jsonb_build_object('kind',event_kind,'category',category,'at',now(),
        'message',left(coalesce(p_event->>'message',''),300),
        'devices',CASE WHEN jsonb_typeof(p_event->'devices')='array' THEN p_event->'devices' ELSE '[]'::jsonb END,
        'metrics',CASE WHEN jsonb_typeof(p_event->'metrics')='object' THEN p_event->'metrics' ELSE '{}'::jsonb END);
    ELSE
      item:=jsonb_build_object('kind',event_kind,'at',now(),
        'message',left(coalesce(p_event->>'message',''),1000),'devices',p_event->'devices');
    END IF;
    events:=events || jsonb_build_array(item);
    SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO events
      FROM jsonb_array_elements(events) WITH ORDINALITY e(value,ord)
      WHERE ord>jsonb_array_length(events)-100;
  END IF;
  UPDATE public.game_sessions SET last_seen_at=CASE WHEN ended_at IS NULL THEN now() ELSE last_seen_at END,
    stats_detail=jsonb_set(stats_detail,'{events}',events),
    client_meta=client_meta || jsonb_build_object('error_count',
      (SELECT count(*) FROM jsonb_array_elements(events) e WHERE e->>'kind'='error')) WHERE id=sid;
END;
$$;


--
-- Name: control_device_instance_heartbeat("uuid", "text", "text", "uuid", bigint, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_instance_heartbeat"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid", "p_epoch" bigint, "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
DECLARE
  v_session_id uuid;
  v_connection public.control_device_connections;
  v_slot public.control_device_slots;
  v_primary uuid;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','missing'); END IF;
  SELECT * INTO v_connection FROM public.control_device_connections
  WHERE id=p_connection_id AND session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND OR v_connection.state NOT IN ('waiting','primary') THEN
    RETURN jsonb_build_object('ok',false,'state','expired');
  END IF;

  IF v_connection.state='primary' AND v_slot.primary_connection_id=p_connection_id
     AND v_slot.epoch=p_epoch AND v_slot.lease_expires_at>clock_timestamp() THEN
    UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
      page_visibility=CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END,
      received_rev=GREATEST(received_rev,CASE WHEN coalesce(p_meta->>'received_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'received_rev')::bigint ELSE received_rev END),
      rendered_rev=GREATEST(rendered_rev,CASE WHEN coalesce(p_meta->>'rendered_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'rendered_rev')::bigint ELSE rendered_rev END),
      started_sound_cue_seq=GREATEST(started_sound_cue_seq,CASE WHEN coalesce(p_meta->>'started_sound_cue_seq','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'started_sound_cue_seq')::bigint ELSE started_sound_cue_seq END)
    WHERE id=p_connection_id;
    UPDATE public.control_device_slots SET lease_expires_at=clock_timestamp()+interval '12 seconds',
      updated_at=clock_timestamp() WHERE session_id=v_session_id AND device_type=p_device_type;
  ELSIF v_connection.state='primary' THEN
    UPDATE public.control_device_connections SET state='waiting',epoch=NULL,
      requested_at=clock_timestamp(),last_seen_at=clock_timestamp()
    WHERE id=p_connection_id;
  ELSE
    UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
      page_visibility=CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END,
      received_rev=GREATEST(received_rev,CASE WHEN coalesce(p_meta->>'received_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'received_rev')::bigint ELSE received_rev END),
      rendered_rev=GREATEST(rendered_rev,CASE WHEN coalesce(p_meta->>'rendered_rev','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'rendered_rev')::bigint ELSE rendered_rev END),
      started_sound_cue_seq=GREATEST(started_sound_cue_seq,CASE WHEN coalesce(p_meta->>'started_sound_cue_seq','') ~ '^[0-9]{1,18}$' THEN (p_meta->>'started_sound_cue_seq')::bigint ELSE started_sound_cue_seq END)
    WHERE id=p_connection_id;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$_$;


--
-- Name: FUNCTION "control_device_instance_heartbeat"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid", "p_epoch" bigint, "p_meta" "jsonb"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."control_device_instance_heartbeat"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid", "p_epoch" bigint, "p_meta" "jsonb") IS 'Renews an instance lease and monotonically records client render progress, fenced by the active primary epoch.';


--
-- Name: control_device_instance_register("uuid", "text", "text", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_instance_register"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid", "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_session_id uuid;
  v_protocol smallint;
  v_slot public.control_device_slots;
  v_existing public.control_device_connections;
  v_primary uuid;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer') OR p_connection_id IS NULL
     OR NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT device_protocol INTO v_protocol FROM public.control_runtime_sessions
  WHERE id=v_session_id AND game_id=p_game_id AND ended_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_protocol<>2 THEN RETURN jsonb_build_object('ok',true,'mode','legacy'); END IF;

  INSERT INTO public.control_device_slots(session_id,game_id,device_type)
  VALUES(v_session_id,p_game_id,p_device_type) ON CONFLICT(session_id,device_type) DO NOTHING;
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND device_type=p_device_type FOR UPDATE;
  SELECT * INTO v_existing FROM public.control_device_connections
  WHERE id=p_connection_id;
  IF FOUND THEN
    IF v_existing.session_id<>v_session_id OR v_existing.game_id<>p_game_id
       OR v_existing.device_type<>p_device_type
       OR v_existing.state NOT IN ('waiting','primary') THEN
      RAISE EXCEPTION 'connection_expired';
    END IF;
    IF v_existing.state='primary' AND NOT EXISTS (
      SELECT 1 FROM public.control_device_slots s
      WHERE s.session_id=v_session_id AND s.device_type=p_device_type
        AND s.primary_connection_id=p_connection_id AND s.epoch=v_existing.epoch
        AND s.lease_expires_at>clock_timestamp()
    ) THEN
      UPDATE public.control_device_connections SET state='waiting',epoch=NULL,
        requested_at=clock_timestamp(),last_seen_at=clock_timestamp()
      WHERE id=p_connection_id;
    ELSE
      UPDATE public.control_device_connections SET last_seen_at=clock_timestamp(),
      page_visibility=CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      focused=CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END
      WHERE id=p_connection_id;
      IF v_existing.state='primary' THEN
        UPDATE public.control_device_slots SET lease_expires_at=clock_timestamp()+interval '12 seconds',
          updated_at=clock_timestamp()
        WHERE session_id=v_session_id AND device_type=p_device_type
          AND primary_connection_id=p_connection_id AND epoch=v_existing.epoch;
      END IF;
    END IF;
  ELSE
    INSERT INTO public.control_device_connections(
      id,session_id,game_id,device_type,state,page_visibility,focused
    ) VALUES (
      p_connection_id,v_session_id,p_game_id,p_device_type,'waiting',
      CASE WHEN p_meta->>'visibility' IN ('visible','hidden') THEN p_meta->>'visibility' ELSE 'unknown' END,
      CASE WHEN jsonb_typeof(p_meta->'focused')='boolean' THEN (p_meta->>'focused')::boolean ELSE NULL END
    );
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;


--
-- Name: control_device_instance_release("uuid", "text", "text", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_instance_release"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid", "p_epoch" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_session_id uuid;
  v_connection public.control_device_connections;
  v_slot public.control_device_slots;
  v_primary uuid;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  SELECT * INTO v_slot FROM public.control_device_slots
  WHERE session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  SELECT * INTO v_connection FROM public.control_device_connections
  WHERE id=p_connection_id AND session_id=v_session_id AND game_id=p_game_id AND device_type=p_device_type FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'released',false); END IF;
  IF v_connection.state='primary' AND v_connection.epoch=p_epoch
     AND v_slot.primary_connection_id=p_connection_id AND v_slot.epoch=p_epoch THEN
    UPDATE public.control_device_connections SET state='released',released_at=clock_timestamp(),epoch=NULL
    WHERE id=p_connection_id;
    UPDATE public.control_device_slots SET lease_expires_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE session_id=v_session_id AND device_type=p_device_type;
  ELSIF v_connection.state='waiting' THEN
    UPDATE public.control_device_connections SET state='released',released_at=clock_timestamp()
    WHERE id=p_connection_id;
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN jsonb_build_object('ok',true,'released',true,'primary_connection_id',v_primary);
END;
$$;


--
-- Name: control_device_instance_status("uuid", "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_instance_status"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE v_session_id uuid; v_primary uuid;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type,p_key) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF NOT EXISTS(SELECT 1 FROM public.control_runtime_sessions WHERE id=v_session_id AND device_protocol=2) THEN
    RETURN jsonb_build_object('ok',true,'mode','legacy');
  END IF;
  v_primary := public._control_device_promote_waiting(v_session_id,p_device_type);
  RETURN public._control_device_status(v_session_id,p_device_type,p_connection_id)
    || jsonb_build_object('mode','lease','primary',v_primary=p_connection_id);
END;
$$;


--
-- Name: control_device_key_valid("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_key_valid"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE g public.games;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_device_type NOT IN ('display','host','buzzer') THEN RETURN false; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id;
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.control_device_link_tokens t
    JOIN public.control_runtime_sessions s ON s.id=t.session_id
    WHERE t.game_id=p_game_id AND t.device_type=p_device_type AND t.token::text=p_key
      AND s.ended_at IS NULL AND s.expires_at>now()
  ) OR EXISTS (
    SELECT 1 FROM public.control_device_shares sh
    JOIN public.control_runtime_sessions s ON s.id=sh.session_id
    WHERE sh.game_id=p_game_id AND sh.device_type=p_device_type AND sh.token::text=p_key
      AND (sh.recipient_id IS NOT NULL OR public._contact_mail_enabled(sh.recipient_email))
      AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
  );
END;
$$;


--
-- Name: control_device_realtime_authorize("uuid", "text", "text", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_realtime_authorize"("p_game_id" "uuid", "p_device_type" "text", "p_key" "text", "p_connection_id" "uuid", "p_epoch" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_session_id uuid;
BEGIN
  IF p_device_type NOT IN ('display','host','buzzer')
     OR NOT public._control_device_action_valid(
       p_game_id,p_device_type,p_key,p_connection_id,p_epoch
     ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_session_id := public._control_device_session_for_key(p_game_id,p_device_type,p_key);
  IF v_session_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.control_runtime_sessions
    WHERE id=v_session_id AND device_protocol=2
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'game_id',p_game_id,'device_type',p_device_type,
    'session_id',v_session_id,'connection_id',p_connection_id,'epoch',p_epoch
  );
END;
$$;


--
-- Name: control_device_realtime_claim_valid("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_realtime_claim_valid"("p_game_id" "uuid", "p_claims" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_game uuid; v_session uuid; v_connection uuid; v_epoch bigint;
  v_device text;
BEGIN
  IF p_claims IS NULL OR p_claims->>'role'<>'anon'
     OR p_claims->>'device_type' NOT IN ('display','host','buzzer')
     OR (p_claims->>'exp')::bigint <= extract(epoch FROM clock_timestamp())::bigint THEN RETURN false; END IF;
  v_game := (p_claims->>'game_id')::uuid;
  v_session := (p_claims->>'session_id')::uuid;
  v_connection := (p_claims->>'connection_id')::uuid;
  v_epoch := (p_claims->>'epoch')::bigint;
  v_device := p_claims->>'device_type';
  RETURN EXISTS (
    SELECT 1
    FROM public.control_runtime_sessions s
    JOIN public.control_device_slots slot ON slot.session_id=s.id
    JOIN public.control_device_connections c
      ON c.id=slot.primary_connection_id AND c.session_id=s.id
    WHERE v_game=p_game_id AND s.id=v_session
      AND s.game_id=p_game_id AND s.device_protocol=2
      AND s.ended_at IS NULL AND s.expires_at>clock_timestamp()
      AND slot.game_id=p_game_id AND slot.device_type=v_device
      AND slot.primary_connection_id=v_connection AND slot.epoch=v_epoch
      AND slot.lease_expires_at>clock_timestamp()
      AND c.state='primary' AND c.epoch=slot.epoch
      AND c.last_seen_at>clock_timestamp()-interval '12 seconds'
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;


--
-- Name: control_device_share_create("uuid", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_share_create"("p_game_id" "uuid", "p_device_type" "text", "p_recipient_user_id" "uuid" DEFAULT NULL::"uuid", "p_recipient_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE result jsonb; item jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_control_device_share_create(p_game_id,p_device_type,p_recipient_user_id,p_recipient_email);
 IF result->>'ok'='true' THEN IF result->>'created'='true' AND result->>'mail_allowed'='true' THEN PERFORM public._mail_allocate_notification('device',(result->>'share_id')::uuid,'device:share'); END IF; END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: control_device_share_create_by_lookup("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_share_create_by_lookup"("p_game_id" "uuid", "p_device_type" "text", "p_lookup" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE r jsonb;
BEGIN
 r:=public._control_share_recipient_lookup(p_game_id,p_lookup);
 IF r->>'ok'<>'true' THEN RETURN r; END IF;
 IF (r->>'by_email')::boolean THEN RETURN public.control_device_share_create(p_game_id,p_device_type,NULL,r->>'email'); END IF;
 RETURN public.control_device_share_create(p_game_id,p_device_type,(r->>'recipient_id')::uuid,NULL);
END $$;


--
-- Name: control_device_share_preflight("uuid", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_share_preflight"("p_game_id" "uuid", "p_device_type" "text", "p_recipient_user_id" "uuid" DEFAULT NULL::"uuid", "p_recipient_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
DECLARE v_uid uuid:=auth.uid(); v_recipient uuid:=p_recipient_user_id; v_email text:=lower(trim(coalesce(p_recipient_email,'')));
  v_session uuid; v_target text; v_mail_email text; v_flag boolean:=true; v_ok boolean; v_until timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND public._poll_identity_regular(u.id,to_jsonb(u))) OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=v_uid) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF (p_recipient_user_id IS NOT NULL) = (p_recipient_email IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'error','recipient_required'); END IF;
  IF p_recipient_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_email'); END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  SELECT id INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND owner_id=v_uid AND ended_at IS NULL AND expires_at>now();
  IF v_session IS NULL THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;
  IF p_recipient_email IS NOT NULL THEN
    v_recipient:=public._poll_registered_uid(v_email);
  END IF;
  IF v_recipient IS NULL AND NOT public._contact_mail_enabled(v_email) THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
  IF v_recipient=v_uid THEN RETURN jsonb_build_object('ok',false,'error','self_share'); END IF;
  IF v_recipient IS NOT NULL THEN
    SELECT public._norm_email(u.email) INTO v_mail_email FROM auth.users u WHERE u.id=v_recipient AND public._poll_identity_regular(u.id,to_jsonb(u));
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','recipient_not_found'); END IF;
    v_flag:=public._contact_mail_enabled(v_mail_email);
    v_target:='pair:'||v_uid::text||':'||v_recipient::text||':device:'||p_device_type||':game:'||p_game_id::text;
  ELSE
    v_flag:=public._contact_mail_enabled(v_email);
    v_target:='pair:'||v_uid::text||':'||md5(v_email)||':device:'||p_device_type||':game:'||p_game_id::text;
  END IF;
  IF EXISTS(SELECT 1 FROM public.control_device_shares WHERE session_id=v_session AND device_type=p_device_type
      AND revoked_at IS NULL AND ((v_recipient IS NOT NULL AND recipient_id=v_recipient)
        OR (v_recipient IS NULL AND recipient_email=v_email))) THEN
    RETURN jsonb_build_object('ok',true,'already_shared',true,'mail_disabled',NOT v_flag);
  END IF;
  IF v_flag THEN SELECT c.ok,c.next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('device:share',v_target) c; END IF;
  RETURN jsonb_build_object('ok',true,'already_shared',false,'mail_disabled',NOT v_flag,
    'mail_allowed',v_flag AND coalesce(v_ok,true),'cooldown_until',v_until);
END $_$;


--
-- Name: control_device_share_preflight_by_lookup("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_share_preflight_by_lookup"("p_game_id" "uuid", "p_device_type" "text", "p_lookup" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE r jsonb;
BEGIN
 r:=public._control_share_recipient_lookup(p_game_id,p_lookup);
 IF r->>'ok'<>'true' THEN RETURN r; END IF;
 IF (r->>'by_email')::boolean THEN RETURN public.control_device_share_preflight(p_game_id,p_device_type,NULL,r->>'email'); END IF;
 RETURN public.control_device_share_preflight(p_game_id,p_device_type,(r->>'recipient_id')::uuid,NULL);
END $$;


--
-- Name: control_device_share_resolve("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_share_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE sh public.control_device_shares; t public.control_device_link_tokens;
        s public.control_runtime_sessions; v_game_name text; v_owner_name text;
BEGIN
  SELECT * INTO sh FROM public.control_device_shares WHERE token=p_token;
  IF FOUND THEN
    IF sh.recipient_id IS NULL AND NOT public._contact_mail_enabled(sh.recipient_email) THEN RETURN jsonb_build_object('ok',false,'state','revoked'); END IF;
    SELECT * INTO s FROM public.control_runtime_sessions WHERE id=sh.session_id;
    IF sh.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'state','revoked'); END IF;
    IF NOT FOUND OR s.ended_at IS NOT NULL OR s.expires_at<=now() THEN
      IF FOUND AND s.ended_at IS NULL AND s.expires_at<=now() THEN PERFORM public.control_runtime_expire_one(s.id); END IF;
      RETURN jsonb_build_object('ok',false,'state','expired');
    END IF;
    SELECT g.name,p.username INTO v_game_name,v_owner_name FROM public.games g
      LEFT JOIN public.profiles p ON p.id=g.owner_id WHERE g.id=sh.game_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','expired'); END IF;
    RETURN jsonb_build_object('ok',true,'state','active','kind','share','game_id',sh.game_id,
      'device_type',sh.device_type,'key',sh.token,'game_name',v_game_name,'owner_username',v_owner_name);
  END IF;

  SELECT * INTO t FROM public.control_device_link_tokens WHERE token=p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','invalid'); END IF;
  SELECT * INTO s FROM public.control_runtime_sessions WHERE id=t.session_id;
  IF NOT FOUND OR s.ended_at IS NOT NULL OR s.expires_at<=now() THEN
    IF FOUND AND s.ended_at IS NULL AND s.expires_at<=now() THEN PERFORM public.control_runtime_expire_one(s.id); END IF;
    RETURN jsonb_build_object('ok',false,'state','expired');
  END IF;
  SELECT g.name,p.username INTO v_game_name,v_owner_name FROM public.games g
    LEFT JOIN public.profiles p ON p.id=g.owner_id WHERE g.id=t.game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'state','expired'); END IF;
  RETURN jsonb_build_object('ok',true,'state','active','kind','pairing','game_id',t.game_id,
    'device_type',t.device_type,'key',t.token,'game_name',v_game_name,'owner_username',v_owner_name);
END;
$$;


--
-- Name: control_device_share_revoke("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_share_revoke"("p_share_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_share public.control_device_shares;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_share FROM public.control_device_shares WHERE id=p_share_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'revoked',false); END IF;
  IF v_share.owner_id<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  IF v_share.revoked_at IS NULL THEN
    UPDATE public.control_device_shares SET revoked_at=now() WHERE id=p_share_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'revoked',true);
END;
$$;


--
-- Name: control_device_share_to_friend("uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_share_to_friend"("p_game_id" "uuid", "p_device_type" "text", "p_friend_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); mail text;
BEGIN
 IF uid IS NULL OR p_friend_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u)))
 THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
 PERFORM 1 FROM auth.users WHERE id=ANY(ARRAY[uid,p_friend_id]) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=uid AND public._poll_identity_regular(u.id,to_jsonb(u))) THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
 SELECT public._norm_email(email) INTO mail FROM auth.users WHERE id=p_friend_id;
 PERFORM public._poll_identity_email_refs(ARRAY[mail],ARRAY[uid,p_friend_id]);
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(uid,p_friend_id)::text||':'||GREATEST(uid,p_friend_id)::text,329));
 PERFORM 1 FROM public.friendships f WHERE f.status='active' AND f.cancelled_at IS NULL
  AND ((f.requester_id=uid AND f.addressee_id=p_friend_id) OR(f.addressee_id=uid AND f.requester_id=p_friend_id)) FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_friend'); END IF;
 RETURN public.control_device_share_create(p_game_id,p_device_type,p_friend_id,NULL);
END $$;


--
-- Name: control_device_shares_list("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_shares_list"("p_game_id" "uuid", "p_device_type" "text") RETURNS TABLE("share_id" "uuid", "recipient_id" "uuid", "recipient_username" "text", "recipient_email" "text", "recipient_kind" "text", "share_token" "uuid", "created_at" timestamp with time zone, "is_friend" boolean, "cooldown_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT sh.id, sh.recipient_id, p.username,
    (CASE WHEN sh.recipient_id IS NULL THEN sh.recipient_email ELSE u.email END)::text,
    CASE WHEN sh.recipient_id IS NULL THEN 'mail'
      WHEN public.are_friends(v_uid,sh.recipient_id) THEN 'friend' ELSE 'account' END,
    sh.token,sh.created_at,
    coalesce(public.are_friends(v_uid,sh.recipient_id),false),
    (SELECT mc.next_allowed_at FROM public.mail_cooldowns mc
      WHERE mc.action_key='device:share' AND mc.target_key = CASE
        WHEN sh.recipient_id IS NOT NULL THEN 'pair:'||v_uid::text||':'||sh.recipient_id::text||':device:'||p_device_type||':game:'||p_game_id::text
        ELSE 'pair:'||v_uid::text||':'||md5(sh.recipient_email)||':device:'||p_device_type||':game:'||p_game_id::text END)
  FROM public.control_device_shares sh
  JOIN public.control_runtime_sessions s ON s.id=sh.session_id
  LEFT JOIN public.profiles p ON p.id=sh.recipient_id
  LEFT JOIN auth.users u ON u.id=sh.recipient_id
  WHERE sh.game_id=p_game_id AND sh.owner_id=v_uid AND sh.device_type=p_device_type
    AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now()
  ORDER BY sh.created_at DESC;
END;
$$;


--
-- Name: control_device_slots_for_owner("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_device_slots_for_owner"("p_game_id" "uuid") RETURNS TABLE("device_type" "text", "primary_online" boolean, "waiting_count" integer, "lease_expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT s.device_type,
    s.primary_connection_id IS NOT NULL AND s.lease_expires_at>clock_timestamp(),
    (SELECT count(*)::integer FROM public.control_device_connections c
      WHERE c.session_id=s.session_id AND c.device_type=s.device_type AND c.state='waiting'
        AND c.last_seen_at>clock_timestamp()-interval '12 seconds'),
    s.lease_expires_at
  FROM public.control_device_slots s
  JOIN public.control_runtime_sessions r ON r.id=s.session_id
  WHERE s.game_id=p_game_id AND r.ended_at IS NULL AND r.expires_at>now();
END;
$$;


--
-- Name: control_runtime_device_link("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_runtime_device_link"("p_game_id" "uuid", "p_device_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_owner uuid; v_session public.control_runtime_sessions; v_token uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF p_device_type NOT IN ('display','host','buzzer') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner<>v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  SELECT * INTO v_session FROM public.control_runtime_sessions
    WHERE game_id=p_game_id AND ended_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','session_expired'); END IF;
  INSERT INTO public.control_device_link_tokens(session_id,game_id,device_type)
    VALUES(v_session.id,p_game_id,p_device_type)
    ON CONFLICT(session_id,device_type) DO UPDATE SET game_id=EXCLUDED.game_id
    RETURNING token INTO v_token;
  RETURN jsonb_build_object('ok',true,'token',v_token,'session_id',v_session.id,'expires_at',v_session.expires_at);
END;
$$;


--
-- Name: control_runtime_expire_due(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_runtime_expire_due"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_session record;
  v_count integer := 0;
BEGIN
  FOR v_session IN
    SELECT id FROM public.control_runtime_sessions
    WHERE ended_at IS NULL AND expires_at <= now()
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.control_runtime_expire_one(v_session.id) THEN v_count := v_count + 1; END IF;
  END LOOP;
  DELETE FROM public.control_runtime_sessions
  WHERE ended_at IS NOT NULL AND ended_at < now() - interval '90 days';
  RETURN v_count;
END;
$$;


--
-- Name: control_runtime_expire_one("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_runtime_expire_one"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_session public.control_runtime_sessions;
BEGIN
  SELECT * INTO v_session FROM public.control_runtime_sessions
  WHERE id = p_session_id AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Zachowujemy przebieg wyłącznie jako statystykę; usuwamy jego aktywny
  -- wskaźnik i stan runtime, żeby kolejny Control wrócił do parowania.
  UPDATE public.game_sessions gs
  SET status = 'abandoned', ended_at = now(), last_seen_at = now(),
      stats_detail = coalesce(gs.stats_detail, '{}'::jsonb) || '{"end_reason":"control_idle_expired"}'::jsonb
  FROM public.game_session_active active
  WHERE active.game_id = v_session.game_id
    AND gs.id = active.session_id
    AND gs.ended_at IS NULL;
  DELETE FROM public.game_session_active WHERE game_id = v_session.game_id;

  UPDATE public.game_state
  SET rev = rev + 1,
      top_card = 'devices', step = 'devices_display', phase = NULL,
      control_team = NULL, sound_cue_key = NULL,
      sound_cue_seq = sound_cue_seq + 1, detail = '{}'::jsonb,
      updated_at = now()
  WHERE game_id = v_session.game_id;

  DELETE FROM public.device_connect_codes WHERE game_id = v_session.game_id;
  DELETE FROM public.device_presence WHERE game_id = v_session.game_id;
  DELETE FROM public.display_audio_unlock WHERE game_id = v_session.game_id;
  DELETE FROM public.shared_devices WHERE game_id = v_session.game_id;
  UPDATE public.control_runtime_sessions
  SET ended_at = now(), end_reason = 'idle'
  WHERE id = p_session_id;
  RETURN true;
END;
$$;


--
-- Name: control_runtime_session_touch("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_runtime_session_touch"("p_game_id" "uuid", "p_session_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_session public.control_runtime_sessions;
  v_expired boolean := false;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'gone'); END IF;
  IF v_owner <> v_uid THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;

  SELECT * INTO v_session FROM public.control_runtime_sessions
  WHERE game_id = p_game_id AND ended_at IS NULL FOR UPDATE;

  IF FOUND AND v_session.expires_at <= v_now THEN
    PERFORM public.control_runtime_expire_one(v_session.id);
    v_expired := true;
    v_session := NULL;
  ELSIF FOUND AND p_session_id IS NOT NULL AND p_session_id <> v_session.id THEN
    -- Stara karta po wygaśnięciu nie może odświeżać ani przejąć nowej sesji.
    RETURN jsonb_build_object('ok', true, 'expired', true, 'session_id', v_session.id,
      'expires_at', v_session.expires_at);
  END IF;

  IF v_session.id IS NULL THEN
    IF p_session_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.control_runtime_sessions
        WHERE game_id = p_game_id AND id = p_session_id
          AND end_reason = 'idle' AND ended_at > v_now - interval '2 hours'
      ) INTO v_expired;
    END IF;
    INSERT INTO public.control_runtime_sessions(game_id, owner_id, last_activity_at, expires_at)
    VALUES (p_game_id, v_uid, v_now, v_now + interval '1 hour')
    RETURNING * INTO v_session;
  ELSE
    UPDATE public.control_runtime_sessions
    SET last_activity_at = v_now, expires_at = v_now + interval '1 hour'
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object('ok', true, 'expired', v_expired, 'session_id', v_session.id,
    'expires_at', v_session.expires_at);
END;
$$;


--
-- Name: control_runtime_session_touch_v2("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."control_runtime_session_touch_v2"("p_game_id" "uuid", "p_session_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_existing_id uuid;
  v_existing_protocol smallint;
  v_data jsonb;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT owner_id INTO v_owner FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
  IF v_owner <> v_uid THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;

  SELECT id, device_protocol INTO v_existing_id, v_existing_protocol
  FROM public.control_runtime_sessions
  WHERE game_id=p_game_id AND ended_at IS NULL AND expires_at>now()
  FOR UPDATE;

  v_data := public.control_runtime_session_touch(p_game_id,p_session_id);
  IF NOT coalesce((v_data->>'ok')::boolean,false) THEN RETURN v_data; END IF;
  v_session_id := (v_data->>'session_id')::uuid;

  -- Do not switch a live legacy session underneath already-open devices.
  -- A fresh session created by this client starts on the lease protocol.
  IF v_existing_id IS NULL THEN
    UPDATE public.control_runtime_sessions SET device_protocol=2 WHERE id=v_session_id;
    v_existing_protocol := 2;
  END IF;
  RETURN v_data || jsonb_build_object('device_protocol',coalesce(v_existing_protocol,1));
END;
$$;


--
-- Name: cooldown_email_get("text", "text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cooldown_email_get"("p_email" "text", "p_action_keys" "text"[]) RETURNS TABLE("action_key" "text", "next_allowed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  h text;
BEGIN
  h := md5(lower(trim(p_email)));

  RETURN QUERY
  SELECT ec.action_key, ec.next_allowed_at
  FROM public.email_cooldowns ec
  WHERE ec.email_hash = h
    AND ec.action_key = ANY(p_action_keys);
END;
$$;


--
-- Name: cooldown_email_release("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cooldown_email_release"("p_email" "text", "p_action_key" "text", "p_max_age_seconds" integer DEFAULT 60) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  h text;
BEGIN
  h := md5(lower(trim(p_email)));

  UPDATE public.email_cooldowns
     SET next_allowed_at = now(),
         updated_at = now()
   WHERE email_hash = h
     AND action_key = p_action_key
     AND updated_at >= (now() - make_interval(secs => p_max_age_seconds));

  RETURN TRUE;
END;
$$;


--
-- Name: cooldown_email_reserve("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cooldown_email_reserve"("p_email" "text", "p_action_key" "text", "p_cooldown_seconds" integer) RETURNS TABLE("ok" boolean, "next_allowed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  h text;
  cur_next timestamptz;
  new_next timestamptz;
BEGIN
  h := md5(lower(trim(p_email)));

  SELECT ec.next_allowed_at
    INTO cur_next
  FROM public.email_cooldowns ec
  WHERE ec.email_hash = h
    AND ec.action_key = p_action_key
  FOR UPDATE;

  IF NOT FOUND THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    INSERT INTO public.email_cooldowns(email_hash, action_key, next_allowed_at, updated_at)
    VALUES (h, p_action_key, new_next, now());
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  IF cur_next <= now() THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    UPDATE public.email_cooldowns
      SET next_allowed_at = new_next,
          updated_at = now()
      WHERE email_hash = h
        AND action_key = p_action_key;
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, cur_next;
  RETURN;
END;
$$;


--
-- Name: cooldown_get("text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cooldown_get"("p_action_keys" "text"[]) RETURNS TABLE("action_key" "text", "next_allowed_at" timestamp with time zone)
    LANGUAGE "sql"
    AS $$
  SELECT uc.action_key, uc.next_allowed_at
  FROM public.user_cooldowns uc
  WHERE uc.user_id = auth.uid()
    AND uc.action_key = ANY(p_action_keys);
$$;


--
-- Name: cooldown_release("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cooldown_release"("p_action_key" "text", "p_max_age_seconds" integer DEFAULT 60) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.user_cooldowns
     SET next_allowed_at = now(),
         updated_at = now()
   WHERE user_id = uid
     AND action_key = p_action_key
     AND updated_at >= (now() - make_interval(secs => p_max_age_seconds));

  RETURN TRUE;
END;
$$;


--
-- Name: cooldown_reserve("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cooldown_reserve"("p_action_key" "text", "p_cooldown_seconds" integer) RETURNS TABLE("ok" boolean, "next_allowed_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  uid uuid;
  cur_next timestamptz;
  new_next timestamptz;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT uc.next_allowed_at
    INTO cur_next
  FROM public.user_cooldowns uc
  WHERE uc.user_id = uid
    AND uc.action_key = p_action_key
  FOR UPDATE;

  IF NOT FOUND THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    INSERT INTO public.user_cooldowns(user_id, action_key, next_allowed_at, updated_at)
    VALUES (uid, p_action_key, new_next, now());
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  IF cur_next <= now() THEN
    new_next := now() + make_interval(secs => p_cooldown_seconds);
    UPDATE public.user_cooldowns
      SET next_allowed_at = new_next,
          updated_at = now()
      WHERE user_id = uid
        AND action_key = p_action_key;
    RETURN QUERY SELECT TRUE, new_next;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, cur_next;
  RETURN;
END;
$$;


--
-- Name: create_report("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."create_report"("p_subject" "text", "p_lang" "text" DEFAULT 'pl'::"text") RETURNS TABLE("id" "uuid", "ticket_number" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ticket text;
  v_id     uuid;
BEGIN
  v_ticket := public.generate_ticket_number();
  INSERT INTO public.reports (ticket_number, status, subject, lang)
  VALUES (v_ticket, 'open', COALESCE(p_subject,''), COALESCE(p_lang,'pl'))
  RETURNING reports.id INTO v_id;
  RETURN QUERY SELECT v_id, v_ticket;
END;
$$;


--
-- Name: cron_embed_missing_market_games(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."cron_embed_missing_market_games"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_url text;
  v_jwt text;
begin
  select value into v_url from public.app_config where key = 'edge_url';
  select value into v_jwt from public.app_config where key = 'edge_service_role_jwt';

  if coalesce(v_url, '') = '' or coalesce(v_jwt, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/generate-game',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt,
      'apikey', v_jwt
    ),
    body := '{"action":"embed-missing","lang":"all","limit":25}'
  );
end;
$$;


--
-- Name: decrement_provider_immediate("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."decrement_provider_immediate"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.email_providers
    SET rem_immediate = GREATEST(0, rem_immediate - 1)
    WHERE id = p_id;
END;
$$;


--
-- Name: decrement_provider_worker("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."decrement_provider_worker"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.email_providers
    SET rem_worker = GREATEST(0, rem_worker - 1)
    WHERE id = p_id;
END;
$$;


--
-- Name: delete_message("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."delete_message"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.messages WHERE id = p_message_id AND deleted_at IS NOT NULL;
END;
$$;


--
-- Name: delete_resource_checked("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."delete_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid", "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_resource_type = 'game' then
    if not exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 312: otwarta ankieta nie blokuje usunięcia (zostaje przerwana: głosy, sesje
    -- i zaproszenia znikają kaskadą). Blokuje tylko zajęta blokada gry.

    -- 316: game:G trzymane przez inną kartę (wyłączne albo współdzielone)
    select * into v_blocker
    from public.edit_lock_blockers('game', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- 312: maile w kolejce z zaproszeniami do ankiety tej gry (link
    -- go?t=<token> w treści; mail_queue nie ma kolumny z identyfikatorem gry).
    delete from public.mail_queue q
    using public.poll_tasks pt
    where pt.game_id = p_resource_id
      and position(('go?t=' || pt.token::text) in q.html) > 0;

    -- 312: zapamiętane urządzenia tej gry (FK dałby tylko SET NULL).
    delete from public.shared_devices where game_id = p_resource_id;

    delete from public.games where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'logo' then
    if not exists (select 1 from public.user_logos where id = p_resource_id and user_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 316: logo:L w innej karcie albo pula logo (logos) trzymana przez kogoś
    -- innego -- jedna reguła zgodności zamiast kontekstów settings / control.
    select * into v_blocker
    from public.edit_lock_blockers('logo', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked',
        'blocker_type', v_blocker.resource_type, 'blocker_context', v_blocker.holder_context);
    end if;

    delete from public.user_logos where id = p_resource_id;
    return jsonb_build_object('ok', true);

  elsif p_resource_type = 'base' then
    if not exists (select 1 from public.question_bases where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;

    -- 316: base:B trzymane (współdzielone -- eksplorator, albo wyłączne) przez
    -- kogoś innego.
    select * into v_blocker
    from public.edit_lock_blockers('base', p_resource_id, 'exclusive', p_tab_id)
    limit 1;

    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    -- Którykolwiek element WEWNĄTRZ tej bazy (pytanie/folder/tag) ma teraz
    -- aktywną sesję edycji (Warstwa 1, migracja 257) -- usunięcie całej
    -- bazy skasowałoby go (CASCADE) spod ręki edytującego bez ostrzeżenia.
    if exists (
      select 1 from public.edit_locks l
      where l.heartbeat_at > now() - public.edit_lock_ttl()  -- 316: TTL
        and l.holder_tab_id is distinct from p_tab_id
        and (
          (l.resource_type = 'base_question' and exists (
            select 1 from public.qb_questions q where q.id = l.resource_id and q.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_folder' and exists (
            select 1 from public.qb_categories c where c.id = l.resource_id and c.base_id = p_resource_id
          ))
          or (l.resource_type = 'base_tag' and exists (
            select 1 from public.qb_tags t where t.id = l.resource_id and t.base_id = p_resource_id
          ))
        )
    ) then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;

    delete from public.question_bases where id = p_resource_id;
    return jsonb_build_object('ok', true);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;
end;
$$;


--
-- Name: delete_user_everything("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."delete_user_everything"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_emails text[];
  v_email text;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- 312: e-maile konta (małymi literami) -- po nich czyścimy dane bez user_id
  select coalesce(array_agg(distinct e), array[]::text[]) into v_emails
  from (
    select lower(trim(u.email)) as e from auth.users u where u.id = p_user_id
    union
    select lower(trim(p.email)) from public.profiles p where p.id = p_user_id
  ) x
  where e is not null and e <> '';

  -- Serialize against snapshot/write jobs before inspecting the inbox.
  perform 1 from auth.users where id = p_user_id for update;

  --366: remove only this recipient inbox before pending resource guards.
  -- Sent copies already belong to their recipients and remain independent.
  delete from public.resource_copy_offers where recipient_id = p_user_id;

  -- 312: usunięcie konta jest nadrzędne -- nie sprawdza blokad (edit_locks);
  -- blokady trzymane przez to konto i na jego zasobach znikają.
  delete from public.edit_locks where holder_user_id = p_user_id;
  delete from public.edit_locks
   where (resource_type = 'game' and resource_id in (select id from public.games where owner_id = p_user_id))
      or (resource_type = 'base' and resource_id in (select id from public.question_bases where owner_id = p_user_id))
      or (resource_type = 'logo' and resource_id in (select id from public.user_logos where user_id = p_user_id));

  -- 312: głosy w cudzych ankietach zostają anonimowe (bez powiązania z kontem);
  -- głosy w własnych grach znikają razem z grami niżej.
  update public.poll_text_entries set voter_user_id = null where voter_user_id = p_user_id;
  update public.poll_votes set voter_user_id = null where voter_user_id = p_user_id;

  delete from public.friendships where requester_id=p_user_id OR addressee_id=p_user_id;
  delete from public.shared_devices where recipient_id=p_user_id;

  delete from public.poll_subscriptions where subscriber_user_id = p_user_id;
  delete from public.poll_subscriptions where owner_id = p_user_id;

  delete from public.poll_tasks where recipient_user_id = p_user_id;
  delete from public.poll_tasks where owner_id = p_user_id;

  -- 312: zaproszenia do baz (po user_id i po e-mailu)
  delete from public.base_share_tasks where recipient_user_id = p_user_id;
  delete from public.base_share_tasks where owner_id = p_user_id;

  delete from public.question_base_shares where user_id = p_user_id;
  delete from public.question_bases where owner_id = p_user_id;

  -- 312: gry (maile ankietowe właściciela znikają niżej przez created_by)
  delete from public.shared_devices where game_id in (select id from public.games where owner_id = p_user_id);
  delete from public.games where owner_id = p_user_id;

  delete from public.user_flags where user_id = p_user_id;
  delete from public.user_logos where user_id = p_user_id;

  -- 312: wszystko powiązane z e-mailem konta
  delete from public.mail_queue where created_by = p_user_id;
  delete from public.mail_function_logs where actor_user_id = p_user_id;
  delete from public.email_intents where user_id = p_user_id;
  delete from public.contact_reports where user_id = p_user_id;
  delete from public.mail_cooldowns
   where position(p_user_id::text in target_key) > 0;

  foreach v_email in array v_emails loop
    delete from public.shared_devices where lower(trim(recipient_email))=v_email;
    delete from public.poll_subscriptions where lower(subscriber_email) = v_email;
    delete from public.poll_tasks where lower(recipient_email) = v_email;
    delete from public.base_share_tasks where lower(recipient_email) = v_email;
    delete from public.mail_queue where lower(trim(to_email)) = v_email;
    delete from public.mail_function_logs where lower(recipient_email) = v_email;
    delete from public.email_unsub_tokens where lower(email) = v_email;
    delete from public.email_intents where lower(email) = v_email;
    delete from public.email_cooldowns where email_hash = md5(v_email);
    delete from public.mail_cooldowns where position(md5(v_email) in target_key) > 0;
    delete from public.contact_reports where lower(email) = v_email;
  end loop;

  -- profile first (also cascades by FK from auth.users if still present)
  delete from public.profiles where id = p_user_id;

  -- final auth user hard delete
  delete from auth.users where id = p_user_id;
end;
$$;


--
-- Name: device_ping("uuid", "public"."device_type", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."device_ping"("p_game_id" "uuid", "p_device_type" "public"."device_type", "p_key" "text", "p_device_id" "text" DEFAULT NULL::"text", "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE did text;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,p_device_type::text,p_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  did:=nullif(trim(coalesce(p_device_id,'')),'');
  IF did IS NULL THEN did:=encode(gen_random_bytes(8),'hex'); END IF;
  INSERT INTO public.device_presence(game_id,device_type,device_id,last_seen_at,meta)
  VALUES(p_game_id,p_device_type,did,now(),coalesce(p_meta,'{}'::jsonb))
  ON CONFLICT(game_id,device_type,device_id) DO UPDATE
    SET last_seen_at=excluded.last_seen_at,meta=excluded.meta;
  RETURN jsonb_build_object('ok',true,'device_id',did,'ts',now());
END $$;


--
-- Name: display_auth("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."display_auth"("p_game_id" "uuid", "p_key" "text") RETURNS TABLE("id" "uuid", "name" "text", "type" "public"."game_type", "status" "public"."game_status")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT g.id,g.name,g.type,g.status FROM public.games g
  WHERE g.id=p_game_id AND public.control_device_key_valid(p_game_id,'display',p_key)
$$;


--
-- Name: display_logo_get_public("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."display_logo_get_public"("p_game_id" "uuid", "p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_owner uuid; v_logo_id uuid; v_logo jsonb;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'display',p_key)
     AND NOT public.control_device_key_valid(p_game_id,'host',p_key) THEN RETURN NULL; END IF;
  SELECT owner_id,nullif(settings->'display'->>'logoId','')::uuid INTO v_owner,v_logo_id
    FROM public.games WHERE id=p_game_id;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF v_logo_id IS NOT NULL THEN
    SELECT jsonb_build_object('type',type,'payload',payload,'name',name) INTO v_logo
      FROM public.user_logos WHERE id=v_logo_id AND user_id=v_owner;
  END IF;
  RETURN v_logo;
END $$;


--
-- Name: e2e_friendships_cleanup("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_friendships_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     OR v_other_email !~ '^test([1-9]|1[0-3]|15)@familiada[.]online$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.friendships
  WHERE (requester_id = v_uid AND addressee_id = p_other_user_id)
     OR (requester_id = p_other_user_id AND addressee_id = v_uid);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.mail_cooldowns
  WHERE action_key LIKE 'friend:%'
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'mail_cooldowns_deleted', v_mail_cooldowns_deleted);
END;
$_$;


--
-- Name: e2e_marketplace_cleanup("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_marketplace_cleanup"("p_prefix" "text" DEFAULT 'E2E-MKT-'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_games int := 0;
  v_market int := 0;
  v_ratings int := 0;
begin
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_uid is null
     or v_email !~ '^test[0-9]+@familiada[.]online$'
     or p_prefix not like 'E2E-MKT-%' then
    return jsonb_build_object('ok', false, 'error', 'test account and E2E-MKT- prefix required');
  end if;

  delete from public.market_game_ratings where user_id = v_uid;
  get diagnostics v_ratings = row_count;

  delete from public.games g
  where g.owner_id = v_uid
    and (
      g.name like p_prefix || '%'
      or exists (
        select 1 from public.market_games mg
        where mg.id = g.source_market_id and mg.title like p_prefix || '%'
      )
    );
  get diagnostics v_games = row_count;

  delete from public.market_games
  where author_user_id = v_uid and title like p_prefix || '%';
  get diagnostics v_market = row_count;

  return jsonb_build_object(
    'ok', true,
    'games_deleted', v_games,
    'market_games_deleted', v_market,
    'ratings_deleted', v_ratings
  );
end;
$_$;


--
-- Name: e2e_poll_mail_budget_cleanup("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_poll_mail_budget_cleanup"("p_recipient_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE uid uuid:=auth.uid(); caller text; recipient text:=public._norm_email(p_recipient_email); n integer;
BEGIN
 SELECT public._norm_email(email) INTO caller FROM auth.users WHERE id=uid;
 IF uid IS NULL OR caller IS NULL OR caller !~ '^test[1-8]@familiada[.]online$'
 OR recipient IS NULL OR recipient !~ '^test([1-8]|11|12|14|15)@familiada[.]online$' THEN
  RETURN jsonb_build_object('ok',false,'err','test_accounts_required'); END IF;
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=uid AND recipient_key=md5(recipient);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('ok',true,'deleted',n);
END; $_$;


--
-- Name: e2e_poll_subscriptions_cleanup("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_poll_subscriptions_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_subscriptions_deleted integer := 0;
  v_tasks_deleted integer := 0;
  v_cooldowns_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     OR v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.poll_tasks
  WHERE (owner_id = v_uid AND recipient_user_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND recipient_user_id = v_uid);
  GET DIAGNOSTICS v_tasks_deleted = ROW_COUNT;

  DELETE FROM public.poll_subscriptions
  WHERE (owner_id = v_uid AND subscriber_user_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND subscriber_user_id = v_uid);
  GET DIAGNOSTICS v_subscriptions_deleted = ROW_COUNT;

  DELETE FROM public.email_cooldowns
  WHERE email_hash IN (md5(v_caller_email), md5(v_other_email));
  GET DIAGNOSTICS v_cooldowns_deleted = ROW_COUNT;

  DELETE FROM public.mail_cooldowns
  WHERE action_key IN ('poll:invite', 'poll:resend', 'poll:share', 'poll:invite_after_reject') -- 311: także blokada 30 dni po odrzuceniu (migracja 310)
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'subscriptions_deleted', v_subscriptions_deleted,
    'tasks_deleted', v_tasks_deleted,
    'cooldowns_deleted', v_cooldowns_deleted,
    'mail_cooldowns_deleted', v_mail_cooldowns_deleted
  );
END;
$_$;


--
-- Name: e2e_registered_subscriber_fixture(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_registered_subscriber_fixture"("p_remove" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE uid uuid:=auth.uid(); caller text; recipient uuid; sid uuid;
BEGIN
 SELECT lower(email) INTO caller FROM auth.users WHERE id=uid;
 IF caller IS NULL OR caller !~ '^test[1-7]@familiada[.]online$' THEN
   RETURN jsonb_build_object('ok',false,'err','test accounts required'); END IF;
 SELECT id INTO recipient FROM auth.users WHERE lower(email)='test8@familiada.online';
 IF NOT coalesce(p_remove,false) AND (recipient IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.profiles WHERE id=recipient AND NOT is_guest)) THEN
   RETURN jsonb_build_object('ok',false,'err','recipient test account missing'); END IF;
 DELETE FROM public.poll_subscriptions WHERE owner_id=uid
 AND (subscriber_user_id=recipient OR public._norm_email(subscriber_email)='test8@familiada.online');
 IF coalesce(p_remove,false) THEN RETURN jsonb_build_object('ok',true,'removed',true); END IF;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status,accepted_at)
 VALUES(uid,'test8@familiada.online','active',now()) RETURNING id INTO sid;
 RETURN jsonb_build_object('ok',true,'id',sid,'recipient_user_id',recipient);
END; $_$;


--
-- Name: e2e_shared_devices_cleanup("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_shared_devices_cleanup"("p_other_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_deleted integer := 0;
  v_mail_cooldowns_deleted integer := 0;
BEGIN
  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = v_uid;
  SELECT lower(email) INTO v_other_email FROM auth.users WHERE id = p_other_user_id;

  IF v_uid IS NULL
     OR v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     OR v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'test accounts required');
  END IF;

  DELETE FROM public.shared_devices
  WHERE (owner_id = v_uid AND recipient_id = p_other_user_id)
     OR (owner_id = p_other_user_id AND recipient_id = v_uid);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- device:share cooldown target_key niesie też device_type/game_id, stąd
  -- LIKE z prefiksem pary, nie dokładna wartość.
  DELETE FROM public.mail_cooldowns
  WHERE action_key = 'device:share'
    AND (
      target_key LIKE 'pair:' || v_uid::text || ':' || p_other_user_id::text || '%'
      OR target_key LIKE 'pair:' || p_other_user_id::text || ':' || v_uid::text || '%'
    );
  GET DIAGNOSTICS v_mail_cooldowns_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'mail_cooldowns_deleted', v_mail_cooldowns_deleted);
END;
$_$;


--
-- Name: e2e_storage_cleanup_peek("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_storage_cleanup_peek"("p_owner_id" "uuid") RETURNS TABLE("bucket" "text", "path" "text", "attempts" integer, "last_error" "text", "created_at" timestamp with time zone, "claimed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is null or v_email !~ '^test[0-9]+@familiada[.]online$' then
    raise exception 'e2e_only';
  end if;
  return query
  select q.bucket, q.path, q.attempts, q.last_error, q.created_at, q.claimed_at
  from public.storage_cleanup_queue q
  where q.owner_id = p_owner_id and q.path like (auth.uid()::text || '%');
end;
$_$;


--
-- Name: e2e_subscriber_email_cleanup("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_subscriber_email_cleanup"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE v_uid uuid:=auth.uid(); v_caller text; v_email text:=lower(trim(p_email));
BEGIN
  SELECT lower(email) INTO v_caller FROM auth.users WHERE id=v_uid;
  IF v_caller IS NULL OR v_caller !~ '^test[1-8]@familiada[.]online$'
    OR v_email NOT IN ('test14@familiada.online','test15@familiada.online') OR v_email IS NULL THEN
    RETURN jsonb_build_object('ok',false,'err','test accounts required');
  END IF;
  DELETE FROM public.poll_tasks WHERE owner_id=v_uid AND lower(recipient_email)=v_email;
  DELETE FROM public.poll_subscriptions WHERE owner_id=v_uid AND lower(subscriber_email)=v_email;
  DELETE FROM public.mail_cooldowns WHERE action_key LIKE 'poll:%'
    AND target_key LIKE 'pair:'||v_uid::text||':email:'||md5(v_email)||'%';
  DELETE FROM public.mail_cooldowns WHERE action_key='baseline:recipient'
    AND target_key='pair:'||v_uid::text||':'||md5(v_email);
  DELETE FROM public.email_cooldowns WHERE email_hash=md5(v_email);
  RETURN jsonb_build_object('ok',true);
END; $_$;


--
-- Name: e2e_subscriber_mail_flag(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."e2e_subscriber_mail_flag"("p_reset" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE caller text; stamp timestamptz;
BEGIN
 SELECT lower(email) INTO caller FROM auth.users WHERE id=auth.uid();
 IF caller IS NULL OR caller !~ '^test[1-8]@familiada[.]online$' THEN
   RETURN jsonb_build_object('ok',false,'err','test accounts required');
 END IF;
 SELECT suppressed_at INTO stamp FROM public.email_unsub_tokens
 WHERE public._norm_email(email)='test14@familiada.online';
 IF coalesce(p_reset,false) THEN
   UPDATE public.email_unsub_tokens SET suppressed_at=NULL
   WHERE public._norm_email(email)='test14@familiada.online';
 END IF;
 RETURN jsonb_build_object('ok',true,'previous_suppressed_at',stamp,
   'suppressed_at',CASE WHEN coalesce(p_reset,false) THEN NULL ELSE stamp END);
END; $_$;


--
-- Name: edit_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."edit_locks" (
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "holder_tab_id" "text" NOT NULL,
    "holder_user_id" "uuid" NOT NULL,
    "acquired_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "heartbeat_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "holder_context" "text",
    "mode" "text" DEFAULT 'exclusive'::"text" NOT NULL,
    CONSTRAINT "edit_locks_mode_check" CHECK (("mode" = ANY (ARRAY['exclusive'::"text", 'shared'::"text"])))
);


--
-- Name: edit_lock_blockers("text", "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."edit_lock_blockers"("p_type" "text", "p_id" "uuid", "p_mode" "text", "p_tab" "text") RETURNS SETOF "public"."edit_locks"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select l.*
  from public.edit_locks l
  where l.heartbeat_at > now() - public.edit_lock_ttl()
    and (case when p_tab is null then l.holder_user_id is distinct from auth.uid()
              else l.holder_tab_id <> p_tab end)
    and (
      -- ten sam zasób: przeszkadza, gdy którakolwiek strona trzyma wyłącznie
      (l.resource_type = p_type and l.resource_id = p_id
        and (l.mode = 'exclusive' or p_mode = 'exclusive'))
      -- logo:L <-> logos tego samego użytkownika
      or (p_type = 'logo' and l.resource_type = 'logos'
        and l.resource_id = (select ul.user_id from public.user_logos ul where ul.id = p_id))
      or (p_type = 'logos' and l.resource_type = 'logo'
        and exists (select 1 from public.user_logos ul
                    where ul.id = l.resource_id and ul.user_id = p_id))
    );
$$;


--
-- Name: edit_lock_ttl(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."edit_lock_ttl"() RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    AS $$ select interval '120 seconds' $$;


--
-- Name: email_get_status("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."email_get_status"("p_email" "text") RETURNS TABLE("status" "text", "intent" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user record;
  v_intent record;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return query select 'none'::text, 'signup'::text;
    return;
  end if;

  select
    u.id,
    u.email_confirmed_at,
    coalesce(u.raw_user_meta_data->>'familiada_email_change_intent', '') as meta_intent
  into v_user
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if found then
    if v_user.email_confirmed_at is not null then
      return query select 'confirmed'::text, 'signup'::text;
    else
      return query
      select
        'pending'::text,
        case when lower(v_user.meta_intent) = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
    end if;
    return;
  end if;

  select
    ei.status,
    ei.intent,
    ei.cooldown_until
  into v_intent
  from public.email_intents ei
  where ei.email = v_email
  limit 1;

  if found then
    if v_intent.status = 'confirmed' then
      return query select 'confirmed'::text, 'signup'::text;
      return;
    end if;
    if v_intent.status = 'pending' then
      return query
      select
        'pending'::text,
        case when v_intent.intent = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
      return;
    end if;
  end if;

  return query select 'none'::text, 'signup'::text;
end;
$$;


--
-- Name: email_intents_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."email_intents_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: email_mark_confirmed("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."email_mark_confirmed"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_auth_email text := '';
begin
  if v_email = '' then
    return;
  end if;

  select lower(u.email)
  into v_auth_email
  from auth.users u
  where u.id = auth.uid()
  limit 1;

  if v_auth_email = '' or v_auth_email <> v_email then
    return;
  end if;

  insert into public.email_intents (email, intent, status, cooldown_until)
  values (v_email, 'signup', 'confirmed', null)
  on conflict (email) do update set
    status = 'confirmed',
    cooldown_until = null,
    updated_at = now();
end;
$$;


--
-- Name: email_resend_prepare("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."email_resend_prepare"("p_email" "text", "p_intent" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "nextallowedat" timestamp with time zone, "status" "text", "intent" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_requested_intent text := lower(trim(coalesce(p_intent, '')));
  v_status text := 'none';
  v_existing_intent text := 'signup';
  v_final_intent text := 'signup';
  v_cooldown_until timestamptz;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return query select false, null::timestamptz, 'none'::text, 'signup'::text;
    return;
  end if;

  select s.status, s.intent into v_status, v_existing_intent
  from public.email_get_status(v_email) s
  limit 1;

  if v_requested_intent in ('signup', 'guest_migrate') then
    v_final_intent := v_requested_intent;
  elsif v_existing_intent in ('signup', 'guest_migrate') then
    v_final_intent := v_existing_intent;
  end if;

  if v_status = 'confirmed' then
    return query select false, null::timestamptz, 'confirmed'::text, v_final_intent;
    return;
  end if;

  select cooldown_until into v_cooldown_until
  from public.email_intents
  where email = v_email
  limit 1;

  if v_cooldown_until is not null and v_cooldown_until > now() then
    return query select false, v_cooldown_until, 'pending'::text, v_final_intent;
    return;
  end if;

  insert into public.email_intents (email, intent, status, cooldown_until)
  values (v_email, v_final_intent, 'pending', now() + interval '1 hour')
  on conflict (email) do update set
    intent = excluded.intent,
    status = 'pending',
    cooldown_until = excluded.cooldown_until,
    updated_at = now();

  return query select true, now() + interval '1 hour', 'pending'::text, v_final_intent;
end;
$$;


--
-- Name: enforce_max_answers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."enforce_max_answers"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  cnt int;
begin
  -- licz ile już jest odpowiedzi dla tego pytania
  select count(*) into cnt
  from public.answers a
  where a.question_id = new.question_id
    and (tg_op <> 'UPDATE' or a.id <> new.id);

  -- jeśli już jest 6, to kolejnej nie wolno
  if cnt >= 6 then
    raise exception 'max 6 answers per question';
  end if;

  return new;
end $$;


--
-- Name: expire_my_device_shares(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."expire_my_device_shares"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.shared_devices
  WHERE owner_id = auth.uid()
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;


--
-- Name: find_report_and_append_message("text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."find_report_and_append_message"("p_ticket_number" "text", "p_direction" "text", "p_body" "text", "p_from_email" "text" DEFAULT NULL::"text") RETURNS TABLE("found" boolean, "report_id" "uuid", "report_email" "text", "report_lang" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_report public.contact_reports%ROWTYPE;
begin
  select * into v_report
  from public.contact_reports
  where ticket_number = p_ticket_number
  limit 1;

  if not FOUND then
    return query select false, null::uuid, null::text, null::text;
    return;
  end if;

  insert into public.contact_report_messages (report_id, direction, body, from_email)
  values (v_report.id, p_direction, p_body, p_from_email);

  -- if user replied to a replied ticket, reopen it
  if p_direction = 'inbound' and v_report.status = 'replied' then
    update public.contact_reports
    set status = 'open', updated_at = now()
    where id = v_report.id;
  end if;

  return query select true, v_report.id, v_report.email, v_report.lang;
end;
$$;


--
-- Name: friend_invites_from_subscriptions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friend_invites_from_subscriptions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_created integer := 0;
  r         record;
  v_cd_ok   boolean;
  v_n       integer;
  source_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  v_email := public.poll_my_email();

  PERFORM public._poll_identity_email_refs(ARRAY[v_email],ARRAY[v_uid] || ARRAY(SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.registered_user_id = v_uid OR s.subscriber_user_id = v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled AND v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
    ORDER BY s.owner_id));

  FOR r IN
    SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.registered_user_id = v_uid OR s.subscriber_user_id = v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled AND v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
    ORDER BY s.owner_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(r.owner_id,v_uid)::text||':'||GREATEST(r.owner_id,v_uid)::text,329));
    PERFORM public._subscriber_pair_lock(r.owner_id,v_email);
    IF public._subscriber_refusal_until(r.owner_id,v_email) IS NOT NULL THEN CONTINUE; END IF;
    SELECT s.id INTO source_id FROM public.poll_subscriptions s
    WHERE s.owner_id=r.owner_id AND s.status IN ('pending','active')
      AND s.cancelled_at IS NULL AND s.declined_at IS NULL
      AND (s.registered_user_id=v_uid OR s.subscriber_user_id=v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled
          AND public._norm_email(s.subscriber_email)=v_email))
    ORDER BY s.created_at,s.id LIMIT 1 FOR SHARE;
    IF source_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(r.owner_id, v_uid)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(r.owner_id, v_uid)
    ) THEN
      CONTINUE;
    END IF;

    SELECT c.ok INTO v_cd_ok
    FROM public.mail_cooldown_check('friend:invite_after_reject', 'pair:' || r.owner_id::text || ':' || v_uid::text) c;
    IF NOT v_cd_ok THEN
      CONTINUE;
    END IF;

    INSERT INTO public.friendships (requester_id, addressee_id, status, source_subscription_id)
    VALUES (r.owner_id, v_uid, 'pending', source_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_created := v_created + v_n;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;


--
-- Name: friends_accept("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_accept"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); f public.friendships%rowtype; sender uuid; e text; deadline timestamptz;
BEGIN
 IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 f:=public._friend_locked(p_id);
 IF f.id IS NULL OR f.decision_user_id<>uid OR f.status<>'pending' OR f.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 sender:=CASE WHEN uid=f.requester_id THEN f.addressee_id ELSE f.requester_id END;
 SELECT email INTO e FROM public.profiles WHERE id=uid;
 PERFORM public._subscriber_pair_lock(sender,e);
 deadline:=public._subscriber_refusal_until(sender,e);
 IF deadline IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',deadline,'reason','after_reject'); END IF;
 UPDATE public.friendships SET status='active',accepted_at=now(),declined_at=NULL WHERE id=p_id;
 RETURN jsonb_build_object('ok',true,'action','accepted','id',p_id);
END
$$;


--
-- Name: friends_cancel("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_cancel"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); f public.friendships%rowtype;
BEGIN
 IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 f:=public._friend_locked(p_id);
 IF f.id IS NULL OR f.decision_user_id=uid OR f.status NOT IN ('pending','declined') OR f.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 -- Zachowujemy odmowę i budżet; tylko token i możliwość undo są cofnięte.
 UPDATE public.friendships SET cancelled_at=now(),status=CASE WHEN declined_at IS NOT NULL THEN 'declined' ELSE status END WHERE id=p_id;
 PERFORM public._friend_drop_pair_tasks(f.requester_id,f.addressee_id);
 RETURN jsonb_build_object('ok',true,'action','cancelled','id',p_id);
END
$$;


--
-- Name: friends_invite("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_invite"("p_handle" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_friends_invite(p_handle);
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' AND result->>'id' IS NOT NULL THEN PERFORM public._mail_allocate_notification('friend',(result->>'id')::uuid,'friend:invite'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: friends_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_list"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "label" "text", "email" "text", "status" "text", "direction" "text", "created_at" timestamp with time zone, "accepted_at" timestamp with time zone, "email_sent_at" timestamp with time zone, "email_send_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT f.id,
         p.id,
         coalesce(nullif(p.username, ''), public._norm_email(u.email)),
         public._norm_email(u.email),
         f.status,
         CASE WHEN f.status = 'active' THEN 'friend'
              WHEN f.decision_user_id = v_uid THEN 'incoming'
              ELSE 'outgoing' END,
         f.created_at, f.accepted_at, f.email_sent_at, f.email_send_count
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END
  JOIN auth.users u ON u.id=p.id
  WHERE f.cancelled_at IS NULL AND (f.requester_id=v_uid OR f.addressee_id=v_uid)
    AND (f.status<>'declined' OR (f.declined_at>now()-interval '30 days'
      AND (f.decision_user_id=v_uid OR f.declined_at>now()-interval '5 days')))
  ORDER BY f.created_at DESC;
END;
$$;


--
-- Name: friends_reject("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_reject"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); f public.friendships%rowtype;
BEGIN
 IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 f:=public._friend_locked(p_id);
 IF f.id IS NULL OR f.decision_user_id<>uid OR f.status<>'pending' OR f.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 UPDATE public.friendships SET status='declined',declined_at=coalesce(declined_at,now()) WHERE id=p_id;
 IF f.declined_at IS NULL THEN PERFORM public._friend_refusal_clocks(f.requester_id,f.addressee_id); END IF;
 PERFORM public._friend_drop_pair_tasks(f.requester_id,f.addressee_id);
 RETURN jsonb_build_object('ok',true,'action','rejected','id',p_id);
END
$$;


--
-- Name: friends_remove("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_remove"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); f public.friendships%rowtype;
BEGIN
 IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 f:=public._friend_locked(p_id);
 IF f.id IS NULL OR f.status<>'active' OR f.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 UPDATE public.friendships SET status='declined',decision_user_id=uid,declined_at=now() WHERE id=p_id;
 PERFORM public._friend_refusal_clocks(f.requester_id,f.addressee_id);
 PERFORM public._friend_drop_pair_tasks(f.requester_id,f.addressee_id);
 RETURN jsonb_build_object('ok',true,'action','declined','id',p_id);
END
$$;


--
-- Name: friends_resend("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_friends_resend(p_id);
 IF result->>'ok'='true' AND result->>'to' IS NOT NULL THEN PERFORM public._mail_allocate_notification('friend',p_id,'friend:resend'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: friends_token_info("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_token_info"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_f     public.friendships%rowtype;
  v_label text;
BEGIN
  SELECT * INTO v_f FROM public.friendships WHERE token=p_token AND cancelled_at IS NULL
    AND (status<>'declined' OR declined_at>now()-interval '30 days');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;
  SELECT coalesce(nullif(p.username, ''), p.email) INTO v_label
  FROM public.profiles p WHERE p.id = CASE WHEN v_f.decision_user_id=v_f.requester_id THEN v_f.addressee_id ELSE v_f.requester_id END;
  RETURN jsonb_build_object(
    'ok', true,
    'status', v_f.status,
    'requester_label', v_label,
    'addressee_matches_me', (auth.uid() IS NOT NULL AND v_f.decision_user_id = auth.uid())
  );
END;
$$;


--
-- Name: friends_undo_reject("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."friends_undo_reject"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); f public.friendships%rowtype;
BEGIN
 IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 f:=public._friend_locked(p_id);
 IF f.id IS NULL OR f.decision_user_id<>uid OR f.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','not_found'); END IF;
 IF f.status<>'declined' THEN RETURN jsonb_build_object('ok',false,'err','not_declined'); END IF;
 IF f.declined_at<=now()-interval '30 days' THEN RETURN jsonb_build_object('ok',false,'err','expired'); END IF;
 UPDATE public.friendships SET status='pending' WHERE id=p_id;
 RETURN jsonb_build_object('ok',true,'id',p_id,'status','pending');
END
$$;


--
-- Name: game_action_state("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_action_state"("p_game_id" "uuid") RETURNS TABLE("game_id" "uuid", "rev" timestamp with time zone, "can_edit" boolean, "needs_reset_warning" boolean, "can_play" boolean, "can_poll" boolean, "can_export" boolean, "reason_play" "text", "reason_poll" "text")
    LANGUAGE "sql" STABLE
    AS $$
with g as (
  select id, type, status, updated_at
  from public.games
  where id = p_game_id
),
qs as (
  select id, ord
  from public.questions
  where game_id = p_game_id
),
ans as (
  select
    a.question_id,
    count(*) as cnt,
    min(coalesce(a.fixed_points,0)) as minp,
    max(coalesce(a.fixed_points,0)) as maxp,
    sum(coalesce(a.fixed_points,0)) as sump
  from public.answers a
  join qs on qs.id = a.question_id
  group by a.question_id
),
agg as (
  select
    coalesce((select count(*) from qs), 0) as qn,
    coalesce((select min(cnt) from ans), 0) as an_min,
    coalesce((select max(cnt) from ans), 0) as an_max,
    coalesce((select bool_or(sump > 100) from ans), false) as sum_too_big,
    coalesce((select bool_or(minp < 0) from ans), false) as neg_pts,
    coalesce((select bool_or(maxp > 100) from ans), false) as over_pts
)
select
  g.id as game_id,
  g.updated_at as rev,

  /* EDIT — zgodnie z canEnterEdit() */
  case
    when g.type = 'prepared' then true
    when g.status in ('poll_open', 'poll_stopped') then false
    else true
  end as can_edit,

  /* warning resetu tylko dla poll_* w READY */
  (g.type <> 'prepared' and g.status = 'ready') as needs_reset_warning,

  /* PLAY — zgodnie z validateGameReadyToPlay() */
  case
    when g.type in ('poll_text','poll_points') then (g.status = 'ready')
    when g.type = 'prepared' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
      and not (select sum_too_big from agg)
      and not (select neg_pts from agg)
      and not (select over_pts from agg)
    else false
  end as can_play,

  /* POLL — zgodnie z validatePollEntry() + validatePollReadyToOpen() */
  case
    when g.type = 'prepared' then false
    when g.type = 'poll_text' then (select qn from agg) >= 10
    when g.type = 'poll_points' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
    else false
  end as can_poll,

  /* eksport: blokuj gdy sondaż otwarty */
  case
    when g.status in ('poll_open', 'poll_stopped') then false
    else true
  end as can_export,

  /* reason_play (opcjonalnie) */
  case
    when g.type in ('poll_text','poll_points') and g.status <> 'ready'
      then 'Gra dostępna dopiero po zamknięciu sondażu.'
    when g.type = 'prepared' and (select qn from agg) < 10
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'prepared' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    when g.type = 'prepared' and (select neg_pts from agg)
      then 'Punkty nie mogą być ujemne.'
    when g.type = 'prepared' and (select over_pts from agg)
      then 'Odpowiedź nie może mieć > 100 pkt.'
    when g.type = 'prepared' and (select sum_too_big from agg)
      then 'Suma punktów w pytaniu nie może przekroczyć 100.'
    else null
  end as reason_play,

  /* reason_poll (opcjonalnie) */
  case
    when g.type = 'prepared'
      then 'Preparowany nie ma sondażu.'
    when (g.type in ('poll_text','poll_points') and (select qn from agg) < 10)
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'poll_points' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    else null
  end as reason_poll
from g, agg;
$$;


--
-- Name: game_import_content("uuid", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_import_content"("p_game_id" "uuid", "p_name" "text", "p_questions" "jsonb") RETURNS "jsonb"
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


--
-- Name: game_import_package("jsonb", "uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_import_package"("p_payload" "jsonb", "p_owner_id" "uuid", "p_request_id" "uuid", "p_defaults" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_owner_id THEN RETURN jsonb_build_object('ok',false,'error','auth_required'); END IF;
 RETURN public._game_import_package(p_payload,p_owner_id,p_request_id,p_defaults);
EXCEPTION
 WHEN lock_not_available THEN RETURN jsonb_build_object('ok',false,'error','locked');
 WHEN raise_exception THEN
  IF SQLERRM='invalid_game_package' THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
  RAISE;
END $$;


--
-- Name: game_poll_close_check("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_poll_close_check"("p_game_id" "uuid") RETURNS "jsonb"
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
  elsif g.status not in ('poll_open', 'poll_stopped') then
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


--
-- Name: game_question_delete("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_question_delete"("p_question_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_game_id uuid;
begin
  delete from public.questions
   where id = p_question_id
  returning game_id into v_game_id;

  -- usunięte gdzie indziej albo cudze (RLS) -- strona traktuje jak ROW_GONE
  if v_game_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform public.game_questions_renumber(v_game_id);
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: game_questions_renumber("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_questions_renumber"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update public.questions q
     set ord = r.rn
    from (
      select id, row_number() over (order by ord, id)::int as rn
      from public.questions
      where game_id = p_game_id
    ) r
   where q.id = r.id
     and q.ord <> r.rn;
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: game_reset_poll_for_edit("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_reset_poll_for_edit"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_game record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, type, status into v_game
  from public.games
  where id = p_game_id and owner_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  -- otwartej ankiety nie resetujemy spod ręki głosujących
  if v_game.status = 'poll_open' then
    return jsonb_build_object('ok', false, 'error', 'poll_open');
  end if;
  if v_game.status = 'poll_stopped' then
    return jsonb_build_object('ok', false, 'error', 'poll_stopped');
  end if;

  if v_game.type not in ('poll_text', 'poll_points') then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update public.games
     set status = 'draft', poll_opened_at = null, poll_closed_at = null
   where id = p_game_id;

  update public.answers a
     set fixed_points = 0
    from public.questions q
   where q.id = a.question_id
     and q.game_id = p_game_id;

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;


--
-- Name: game_rules_compute("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_rules_compute"("p_game_id" "uuid", "p_type" "text", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_qmin constant int := 10;
  c_amin constant int := 3;
  c_amax constant int := 6;
  c_sum  constant int := 100;
  c_ok   constant jsonb := '{"ok": true}'::jsonb;

  g record;
  r record;
  v_qn int;
  v_minq jsonb;       -- za mało pytań
  v_struct jsonb;     -- pierwsze pytanie ze złą liczbą odpowiedzi
  v_points jsonb;     -- pierwsze pytanie złe dla gry preparowanej
  v_content_poll jsonb;
  v_edit jsonb;
  v_play jsonb;
  v_poll_entry jsonb;
  v_poll_open jsonb;
  v_export jsonb;
  v_poll_stop jsonb;
  v_poll_resume jsonb;
  v_is_poll boolean;
begin
  select p_type as type, p_status as status into g;

  v_is_poll := g.type in ('poll_text', 'poll_points');

  /* ---------- treść: pytania i odpowiedzi ---------- */
  select count(*)::int into v_qn from public.questions where game_id = p_game_id;

  if v_qn < c_qmin then
    v_minq := jsonb_build_object('ok', false, 'code', 'minQuestions',
      'params', jsonb_build_object('min', c_qmin, 'n', v_qn));
  end if;

  for r in
    select q.ord,
           count(a.id)::int as cnt,
           coalesce(min(a.fixed_points), 0)::int as minp,
           coalesce(max(a.fixed_points), 0)::int as maxp,
           coalesce(sum(a.fixed_points), 0)::int as sump
    from public.questions q
    left join public.answers a on a.question_id = q.id
    where q.game_id = p_game_id
    group by q.id, q.ord
    order by q.ord
  loop
    if v_struct is null and (r.cnt < c_amin or r.cnt > c_amax) then
      v_struct := jsonb_build_object('ok', false, 'code', 'answersRange',
        'params', jsonb_build_object('ord', r.ord, 'min', c_amin, 'max', c_amax, 'n', r.cnt));
    end if;

    if v_points is null then
      v_points := case
        when r.cnt < c_amin or r.cnt > c_amax then v_struct
        when r.minp < 0 then jsonb_build_object('ok', false, 'code', 'negativePoints',
          'params', jsonb_build_object('ord', r.ord))
        when r.maxp > 100 then jsonb_build_object('ok', false, 'code', 'answerOver100',
          'params', jsonb_build_object('ord', r.ord))
        when r.sump > c_sum then jsonb_build_object('ok', false, 'code', 'sumTooBig',
          'params', jsonb_build_object('ord', r.ord, 'max', c_sum, 'sum', r.sump))
        else null
      end;
    end if;

    exit when v_struct is not null and v_points is not null;
  end loop;

  -- czy treść wystarcza do uruchomienia ankiety
  v_content_poll := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when v_minq is not null then v_minq
    when g.type = 'poll_points' and v_struct is not null then v_struct
    else c_ok
  end;

  /* ---------- edit ---------- */
  v_edit := case
    when g.type = 'prepared' then jsonb_build_object('ok', true, 'needs_reset', false)
    when g.type = 'market' then jsonb_build_object('ok', false, 'code', 'marketNoEdit')
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollOpenNoEdit')
    when g.status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStoppedNoEdit')
    when g.status = 'ready' then jsonb_build_object('ok', true, 'needs_reset', true)
    else jsonb_build_object('ok', true, 'needs_reset', false)
  end;

  /* ---------- play ---------- */
  v_play := case
    when v_is_poll and g.status <> 'ready' then jsonb_build_object('ok', false, 'code', 'playAfterPoll')
    when v_is_poll then c_ok
    when g.type in ('prepared', 'market') then coalesce(v_minq, v_points, c_ok)
    else jsonb_build_object('ok', false, 'code', 'unknownType')
  end;

  /* ---------- ankieta ---------- */
  v_poll_entry := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status in ('poll_open', 'poll_stopped', 'ready') then c_ok
    else v_content_poll
  end;

  v_poll_open := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollAlreadyOpen')
    when g.status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStopped')
    else v_content_poll
  end;

  /* ---------- eksport ---------- */
  v_export := case
    when g.status = 'poll_open' then jsonb_build_object('ok', false, 'code', 'pollOpenNoExport')
    when g.status = 'poll_stopped' then jsonb_build_object('ok', false, 'code', 'pollStoppedNoExport')
    else c_ok
  end;

  /* ---------- zatrzymanie / wznowienie (315) ---------- */
  v_poll_stop := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status = 'poll_open' then c_ok
    else jsonb_build_object('ok', false, 'code', 'stopOnlyOpen')
  end;

  v_poll_resume := case
    when not v_is_poll then jsonb_build_object('ok', false, 'code', 'preparedNoPoll')
    when g.status = 'poll_stopped' then c_ok
    else jsonb_build_object('ok', false, 'code', 'resumeOnlyStopped')
  end;

  return jsonb_build_object(
    'rules', jsonb_build_object('qn_min', c_qmin, 'an_min', c_amin, 'an_max', c_amax, 'sum_max', c_sum),
    'edit', v_edit,
    'play', v_play,
    'poll_entry', v_poll_entry,
    'poll_open', v_poll_open,
    'export', v_export,
    'poll_stop', v_poll_stop,
    'poll_resume', v_poll_resume
  );
end;
$$;


--
-- Name: game_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_state" (
    "game_id" "uuid" NOT NULL,
    "rev" bigint DEFAULT 0 NOT NULL,
    "top_card" "public"."game_top_card" DEFAULT 'devices'::"public"."game_top_card" NOT NULL,
    "step" "public"."game_step" DEFAULT 'devices_display'::"public"."game_step" NOT NULL,
    "phase" "public"."game_round_phase",
    "control_team" "public"."game_team",
    "sound_cue_key" "text",
    "sound_cue_seq" bigint DEFAULT 0 NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_until" timestamp with time zone,
    "display_rendered_rev" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "game_state_display_rendered_rev_check" CHECK (("display_rendered_rev" >= 0))
);

ALTER TABLE ONLY "public"."game_state" REPLICA IDENTITY FULL;


--
-- Name: TABLE "game_state"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."game_state" IS 'Control v2: jedyne, autorytatywne źródło "co jest teraz prawdą o grze". Zapis wyłącznie przez game_state_write/game_state_buzzer_press/game_state_undo (SECURITY DEFINER) — brak polityk INSERT/UPDATE dla klienta wprost na tabeli.';


--
-- Name: COLUMN "game_state"."rev"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."game_state"."rev" IS 'Monotoniczny licznik — optymistyczna kontrola współbieżności (p_expected_rev) i tania de-duplikacja odczytu po stronie urządzeń.';


--
-- Name: COLUMN "game_state"."detail"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."game_state"."detail" IS 'Wszystko poza jawnymi kolumnami: drużyny, wyniki, bank, X-y, pytanie/odpowiedzi/odkryte, timery jako endsAt, mapowanie odpowiedzi finału, detail.settings (zdenormalizowane z games.settings raz na start gry), detail.display.{mode,qrTarget}, detail.host.covered.';


--
-- Name: COLUMN "game_state"."locked_until"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."game_state"."locked_until" IS 'Do kiedy trwa dźwięk/animacja bieżącego przejścia — game_state_write/game_state_buzzer_press odrzucają zapis, dopóki now() < locked_until. Ustawiane przez game_state_set_lock, PO potwierdzeniu głównego zapisu treści.';


--
-- Name: COLUMN "game_state"."display_rendered_rev"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."game_state"."display_rendered_rev" IS 'Highest game_state revision acknowledged as rendered by the primary Display; mirrored to game_state for device Realtime delivery.';


--
-- Name: game_state_buzzer_press("uuid", "text", "public"."game_team", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_buzzer_press"("p_game_id" "uuid", "p_key" "text", "p_team" "public"."game_team", "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_old public.game_state;
  v_new public.game_state;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'buzzer',p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_old FROM public.game_state WHERE game_id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;

  IF v_old.locked_until IS NOT NULL AND v_old.locked_until>now() THEN
    RAISE EXCEPTION 'locked';
  END IF;

  IF coalesce((v_old.detail #>> '{settings,physicalBuzzer}')::boolean,false) THEN
    RAISE EXCEPTION 'device_disabled';
  END IF;

  UPDATE public.game_state
  SET detail=jsonb_set(detail,'{rounds,duel,lastPressed}',to_jsonb(p_team::text)),
      rev=rev+1,updated_at=now()
  WHERE game_id=p_game_id AND step='r_duel'
    AND (detail #>> '{rounds,duel,lastPressed}') IS NULL
  RETURNING * INTO v_new;

  IF NOT FOUND THEN RAISE EXCEPTION 'already_pressed'; END IF;
  RETURN v_new;
END;
$$;


--
-- Name: game_state_display_complete("uuid", "text", bigint, "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_display_complete"("p_game_id" "uuid", "p_key" "text", "p_rev" bigint, "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE current_rev bigint;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT rev INTO current_rev FROM public.game_state WHERE game_id=p_game_id;
  IF current_rev IS NULL OR p_rev IS NULL OR p_rev<0 OR p_rev>current_rev THEN
    RAISE EXCEPTION 'invalid revision';
  END IF;

  INSERT INTO public.game_state_display_completion(game_id,rendered_rev)
    VALUES(p_game_id,p_rev)
    ON CONFLICT(game_id) DO UPDATE
      SET rendered_rev=greatest(game_state_display_completion.rendered_rev,excluded.rendered_rev);

  -- This update emits the acknowledgment through the same RLS protected
  -- game_state stream already consumed by every device.
  UPDATE public.game_state
    SET display_rendered_rev=greatest(display_rendered_rev,p_rev)
    WHERE game_id=p_game_id AND display_rendered_rev<p_rev;
END $$;


--
-- Name: FUNCTION "game_state_display_complete"("p_game_id" "uuid", "p_key" "text", "p_rev" bigint, "p_connection_id" "uuid", "p_epoch" bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."game_state_display_complete"("p_game_id" "uuid", "p_key" "text", "p_rev" bigint, "p_connection_id" "uuid", "p_epoch" bigint) IS 'Fenced Display acknowledgment. Persists the completion row and mirrors rendered_rev to game_state so all devices receive the acknowledgment on their scoped Realtime stream.';


--
-- Name: game_state_display_is_ready("uuid", "text", "text", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_display_is_ready"("p_game_id" "uuid", "p_key" "text", "p_device_type" "text" DEFAULT NULL::"text", "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_device_type IS NULL THEN
    IF NOT public._control_device_action_valid(p_game_id,'display',p_key,p_connection_id,p_epoch)
       AND NOT public._control_device_action_valid(p_game_id,'buzzer',p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF p_device_type NOT IN ('display','buzzer')
     OR NOT public._control_device_action_valid(p_game_id,p_device_type,p_key,p_connection_id,p_epoch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN coalesce((SELECT rendered_rev>=requested_rev FROM public.game_state_display_completion WHERE game_id=p_game_id),false);
END $$;


--
-- Name: game_state_get("uuid", "public"."device_type", "text", "uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_get"("p_game_id" "uuid", "p_device_type" "public"."device_type", "p_key" "text", "p_connection_id" "uuid" DEFAULT NULL::"uuid", "p_epoch" bigint DEFAULT NULL::bigint) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE out public.game_state;
BEGIN
  IF NOT public._control_device_action_valid(p_game_id,p_device_type::text,p_key,p_connection_id,p_epoch) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO out FROM public.game_state WHERE game_id=p_game_id;
  RETURN out;
END $$;


--
-- Name: game_state_set_lock("uuid", bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_set_lock"("p_game_id" "uuid", "p_expected_rev" bigint, "p_lock_ms" integer) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_row public.game_state;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.game_state where game_id = p_game_id for update;
  if not found then raise exception 'game_state not found'; end if;
  if p_expected_rev is not null and p_expected_rev <> v_row.rev then
    raise exception 'stale_write';
  end if;

  update public.game_state
  set locked_until = case when p_lock_ms > 0 then now() + (p_lock_ms::text || ' milliseconds')::interval else null end,
      updated_at = now()
  where game_id = p_game_id
  returning * into v_row;

  return v_row;
end;
$$;


--
-- Name: FUNCTION "game_state_set_lock"("p_game_id" "uuid", "p_expected_rev" bigint, "p_lock_ms" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."game_state_set_lock"("p_game_id" "uuid", "p_expected_rev" bigint, "p_lock_ms" integer) IS 'Ustawia locked_until PO potwierdzeniu głównego zapisu (control2/js/app.js''s dispatchGated/advance liczą realny czas dźwięku z potwierdzonego sound_cue_key). Nie bumpuje rev poza tym, co robi zwykły update -- treść stanu się nie zmienia, tylko blokada.';


--
-- Name: game_state_set_sound_muted("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_set_sound_muted"("p_game_id" "uuid", "p_muted" boolean) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_row public.game_state;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_state
  set detail = jsonb_set(detail, '{settings,soundMuted}', to_jsonb(p_muted)),
      rev = rev + 1,
      updated_at = now()
  where game_id = p_game_id
  returning * into v_row;

  if not found then raise exception 'game_state not found'; end if;

  return v_row;
end;
$$;


--
-- Name: FUNCTION "game_state_set_sound_muted"("p_game_id" "uuid", "p_muted" boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."game_state_set_sound_muted"("p_game_id" "uuid", "p_muted" boolean) IS 'Zmienia WYŁĄCZNIE detail.settings.soundMuted, przez jsonb_set (nie dotyka reszty detail) -- świadomie z pominięciem sprawdzania locked_until (migracja 264), bo wyciszenie dźwięku jest metadaną niezależną od trwającego dźwięku/animacji akcji gry, nie treścią wymagającą serializacji.';


--
-- Name: game_state_set_ui_lang("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_set_ui_lang"("p_game_id" "uuid", "p_ui_lang" "text") RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_row public.game_state;
begin
  if p_ui_lang not in ('pl', 'en', 'uk') then
    raise exception 'invalid_lang';
  end if;

  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_state
  set detail = jsonb_set(detail, '{settings,uiLang}', to_jsonb(p_ui_lang)),
      rev = rev + 1,
      updated_at = now()
  where game_id = p_game_id
  returning * into v_row;

  if not found then raise exception 'game_state not found'; end if;

  return v_row;
end;
$$;


--
-- Name: FUNCTION "game_state_set_ui_lang"("p_game_id" "uuid", "p_ui_lang" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."game_state_set_ui_lang"("p_game_id" "uuid", "p_ui_lang" "text") IS 'Zmienia WYŁĄCZNIE detail.settings.uiLang, przez jsonb_set (nie dotyka reszty detail) -- świadomie z pominięciem sprawdzania locked_until (migracja 264), bo język operatora jest metadaną niezależną od trwającego dźwięku/animacji akcji gry, nie treścią wymagającą serializacji.';


--
-- Name: game_state_undo("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_undo"("p_game_id" "uuid") RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_hist public.game_state_history;
  v_cur public.game_state;
  v_new public.game_state;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_cur from public.game_state where game_id = p_game_id for update;
  if not found then raise exception 'no_state'; end if;

  select * into v_hist from public.game_state_history
  where game_id = p_game_id
  order by rev desc
  limit 1;
  if not found then raise exception 'no_history'; end if;

  update public.game_state
  set rev = v_cur.rev + 1,
      top_card = (v_hist.snapshot->>'top_card')::public.game_top_card,
      step = (v_hist.snapshot->>'step')::public.game_step,
      phase = nullif(v_hist.snapshot->>'phase', '')::public.game_round_phase,
      control_team = nullif(v_hist.snapshot->>'control_team', '')::public.game_team,
      sound_cue_key = v_hist.snapshot->>'sound_cue_key',
      sound_cue_seq = coalesce((v_hist.snapshot->>'sound_cue_seq')::bigint, 0),
      detail = coalesce(v_hist.snapshot->'detail', '{}'::jsonb),
      updated_at = now()
  where game_id = p_game_id
  returning * into v_new;

  delete from public.game_state_history where id = v_hist.id;

  return v_new;
end;
$$;


--
-- Name: game_state_write("uuid", "public"."game_step", "public"."game_top_card", "public"."game_round_phase", "public"."game_team", "jsonb", "text", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_write"("p_game_id" "uuid", "p_step" "public"."game_step", "p_top_card" "public"."game_top_card", "p_phase" "public"."game_round_phase" DEFAULT NULL::"public"."game_round_phase", "p_control_team" "public"."game_team" DEFAULT NULL::"public"."game_team", "p_detail" "jsonb" DEFAULT NULL::"jsonb", "p_sound_cue_key" "text" DEFAULT NULL::"text", "p_expected_rev" bigint DEFAULT NULL::bigint) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_old public.game_state;
  v_new public.game_state;
  v_next_sound_key text;
  v_next_sound_seq bigint;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_old from public.game_state where game_id = p_game_id for update;

  if not found then
    -- pierwszy zapis dla tej gry — nie ma z czym porównać expected_rev
    if p_expected_rev is not null and p_expected_rev <> 0 then
      raise exception 'stale_write';
    end if;
  else
    if p_expected_rev is not null and p_expected_rev <> v_old.rev then
      raise exception 'stale_write';
    end if;

    insert into public.game_state_history(game_id, rev, snapshot)
    values (v_old.game_id, v_old.rev, to_jsonb(v_old));

    delete from public.game_state_history
    where game_id = p_game_id
      and id not in (
        select id from public.game_state_history
        where game_id = p_game_id
        order by rev desc
        limit 20
      );
  end if;

  if p_sound_cue_key is not null then
    v_next_sound_key := p_sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0) + 1;
  else
    v_next_sound_key := v_old.sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0);
  end if;

  insert into public.game_state as gs
    (game_id, rev, top_card, step, phase, control_team, sound_cue_key, sound_cue_seq, detail, updated_at)
  values (
    p_game_id,
    coalesce(v_old.rev, 0) + 1,
    p_top_card,
    p_step,
    p_phase,
    p_control_team,
    v_next_sound_key,
    v_next_sound_seq,
    coalesce(p_detail, v_old.detail, '{}'::jsonb),
    now()
  )
  on conflict (game_id) do update set
    rev = excluded.rev,
    top_card = excluded.top_card,
    step = excluded.step,
    phase = excluded.phase,
    control_team = excluded.control_team,
    sound_cue_key = excluded.sound_cue_key,
    sound_cue_seq = excluded.sound_cue_seq,
    detail = excluded.detail,
    updated_at = excluded.updated_at
  returning * into v_new;

  return v_new;
end;
$$;


--
-- Name: game_state_write("uuid", "public"."game_step", "public"."game_top_card", "public"."game_round_phase", "public"."game_team", "jsonb", "text", bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_state_write"("p_game_id" "uuid", "p_step" "public"."game_step", "p_top_card" "public"."game_top_card", "p_phase" "public"."game_round_phase" DEFAULT NULL::"public"."game_round_phase", "p_control_team" "public"."game_team" DEFAULT NULL::"public"."game_team", "p_detail" "jsonb" DEFAULT NULL::"jsonb", "p_sound_cue_key" "text" DEFAULT NULL::"text", "p_expected_rev" bigint DEFAULT NULL::bigint, "p_lock_ms" integer DEFAULT NULL::integer) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_old public.game_state;
  v_new public.game_state;
  v_next_sound_key text;
  v_next_sound_seq bigint;
  v_locked_until timestamptz;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into v_old from public.game_state where game_id = p_game_id for update;

  if found and v_old.locked_until is not null and v_old.locked_until > now() then
    raise exception 'locked';
  end if;

  if not found then
    -- pierwszy zapis dla tej gry — nie ma z czym porównać expected_rev
    if p_expected_rev is not null and p_expected_rev <> 0 then
      raise exception 'stale_write';
    end if;
  else
    if p_expected_rev is not null and p_expected_rev <> v_old.rev then
      raise exception 'stale_write';
    end if;

    insert into public.game_state_history(game_id, rev, snapshot)
    values (v_old.game_id, v_old.rev, to_jsonb(v_old));

    delete from public.game_state_history
    where game_id = p_game_id
      and id not in (
        select id from public.game_state_history
        where game_id = p_game_id
        order by rev desc
        limit 20
      );
  end if;

  if p_sound_cue_key is not null then
    v_next_sound_key := p_sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0) + 1;
  else
    v_next_sound_key := v_old.sound_cue_key;
    v_next_sound_seq := coalesce(v_old.sound_cue_seq, 0);
  end if;

  if p_lock_ms is not null and p_lock_ms > 0 then
    v_locked_until := now() + (p_lock_ms::text || ' milliseconds')::interval;
  else
    v_locked_until := null;
  end if;

  insert into public.game_state as gs
    (game_id, rev, top_card, step, phase, control_team, sound_cue_key, sound_cue_seq, detail, locked_until, updated_at)
  values (
    p_game_id,
    coalesce(v_old.rev, 0) + 1,
    p_top_card,
    p_step,
    p_phase,
    p_control_team,
    v_next_sound_key,
    v_next_sound_seq,
    coalesce(p_detail, v_old.detail, '{}'::jsonb),
    v_locked_until,
    now()
  )
  on conflict (game_id) do update set
    rev = excluded.rev,
    top_card = excluded.top_card,
    step = excluded.step,
    phase = excluded.phase,
    control_team = excluded.control_team,
    sound_cue_key = excluded.sound_cue_key,
    sound_cue_seq = excluded.sound_cue_seq,
    detail = excluded.detail,
    locked_until = excluded.locked_until,
    updated_at = excluded.updated_at
  returning * into v_new;

  return v_new;
end;
$$;


--
-- Name: game_validate("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."game_validate"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  g record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, type::text as type, status::text as status, updated_at
    into g
  from public.games
  where id = p_game_id and owner_id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return public.game_rules_compute(g.id, g.type, g.status)
    || jsonb_build_object(
         'ok', true,
         'game', jsonb_build_object('id', g.id, 'type', g.type, 'status', g.status, 'rev', g.updated_at),
         'poll_close', public.game_poll_close_check(g.id)
       );
end;
$$;


--
-- Name: games_fill_share_keys(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."games_fill_share_keys"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.share_key_poll    := coalesce(new.share_key_poll,    public.gen_share_key(18));
  new.share_key_control := coalesce(new.share_key_control, public.gen_share_key(24));
  new.share_key_display := coalesce(new.share_key_display, public.gen_share_key(18));
  new.share_key_host    := coalesce(new.share_key_host,    public.gen_share_key(18));
  new.share_key_buzzer  := coalesce(new.share_key_buzzer,  public.gen_share_key(18));
  return new;
end;
$$;


--
-- Name: games_market_orphan_to_prepared(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."games_market_orphan_to_prepared"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.type = 'market' and new.source_market_id is null and old.source_market_id is not null then
    new.type := 'prepared';
  end if;
  return new;
end;
$$;


--
-- Name: games_poll_state_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."games_poll_state_reset"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF new.status IS DISTINCT FROM old.status
     AND (new.status = 'draft'
          OR (new.status = 'poll_open' AND old.status IS DISTINCT FROM 'poll_stopped')) THEN
    new.poll_ended_key := NULL;
    DELETE FROM public.poll_tally_drafts WHERE game_id = new.id;
  END IF;
  RETURN new;
END $$;


--
-- Name: games_rules_state_refresh("uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."games_rules_state_refresh"("p_game_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- wartość liczy trg_games_rules_state (BEFORE UPDATE OF rules_state)
  update public.games g
     set rules_state = null
   where g.id = any(p_game_ids);
$$;


--
-- Name: games_rules_state_row(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."games_rules_state_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.rules_state := public.game_rules_compute(new.id, new.type::text, new.status::text);
  return new;
end;
$$;


--
-- Name: gen_connect_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."gen_connect_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_code   text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    SELECT EXISTS (
      SELECT 1 FROM public.device_connect_codes
      WHERE code = v_code
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;


--
-- Name: gen_contact_ticket_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."gen_contact_ticket_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_year text;
  v_seq  bigint;
begin
  v_year := to_char(now(), 'YYYY');
  v_seq  := nextval('public.contact_report_seq');
  return v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;


--
-- Name: gen_random_bytes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."gen_random_bytes"("n" integer) RETURNS "bytea"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT extensions.gen_random_bytes(n);
$$;


--
-- Name: gen_share_key(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."gen_share_key"("n_bytes" integer DEFAULT 24) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT encode(gen_random_bytes(n_bytes), 'hex');
$$;


--
-- Name: generate_device_connect_code("uuid", "text", "text", "text", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."generate_device_connect_code"("p_game_id" "uuid", "p_device_type" "text", "p_share_key" "text", "p_game_name" "text" DEFAULT NULL::"text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_owner    uuid := auth.uid();
  v_code     text;
BEGIN
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated');
  END IF;

  -- Usuń wygasłe kody (tylko te z ustawionym expires_at)
  DELETE FROM public.device_connect_codes
  WHERE owner_id = v_owner
    AND game_id = p_game_id
    AND device_type = p_device_type
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Wygeneruj nowy kod (użyty tylko jeśli brak istniejącego)
  v_code := gen_connect_code();

  -- Atomowy upsert: wstaw nowy kod lub zaktualizuj share_key przy konflikcie.
  -- RETURNING zwraca istniejący code jeśli był konflikt (code nie jest aktualizowany).
  INSERT INTO public.device_connect_codes
    (code, owner_id, game_id, game_name, device_type, share_key, expires_at)
  VALUES
    (v_code, v_owner, p_game_id, p_game_name, p_device_type, p_share_key, p_expires_at)
  ON CONFLICT (owner_id, game_id, device_type) DO UPDATE
    SET share_key = EXCLUDED.share_key,
        game_name = COALESCE(EXCLUDED.game_name, device_connect_codes.game_name)
  RETURNING code INTO v_code;

  RETURN jsonb_build_object('ok', true, 'code', v_code);
END;
$$;


--
-- Name: generate_ticket_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."generate_ticket_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_year  int;
  v_seq   int;
  v_num   text;
BEGIN
  v_year := EXTRACT(year FROM now())::int;
  SELECT COUNT(*) + 1
    INTO v_seq
    FROM public.reports
   WHERE EXTRACT(year FROM created_at)::int = v_year;
  v_num := 'TICKET-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');
  -- handle collision
  WHILE EXISTS (SELECT 1 FROM public.reports WHERE ticket_number = v_num) LOOP
    v_seq := v_seq + 1;
    v_num := 'TICKET-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');
  END LOOP;
  RETURN v_num;
END;
$$;


--
-- Name: get_admin_poll_details(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_admin_poll_details"("p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  excluded_ids uuid[];
  result jsonb;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_exclusions_effective) INTO excluded_ids;

  WITH eligible_games AS (
    SELECT g.id, g.name, g.type::text AS type, g.status::text AS status,
           g.owner_id, g.created_at, p.username AS owner
    FROM public.games g
    LEFT JOIN public.profiles p ON p.id = g.owner_id
    WHERE g.type IN ('poll_text', 'poll_points')
      AND g.is_demo = false
      AND g.source_market_id IS NULL
      AND NOT (g.owner_id = ANY(excluded_ids))
  ),
  answers AS (
    SELECT v.game_id, v.poll_session_id, v.voter_token
    FROM public.poll_votes v JOIN eligible_games g ON g.id = v.game_id
    UNION ALL
    SELECT e.game_id, e.poll_session_id, e.voter_token
    FROM public.poll_text_entries e JOIN eligible_games g ON g.id = e.game_id
  ),
  answer_counts AS (
    SELECT game_id, count(*) AS responses,
           count(DISTINCT voter_token) AS voters
    FROM answers GROUP BY game_id
  ),
  task_counts AS (
    SELECT game_id, count(*) AS shared_tasks,
           count(*) FILTER (WHERE status = 'done') AS completed_tasks
    FROM public.poll_tasks GROUP BY game_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT g.name, g.type, g.status, g.owner, g.created_at,
           COALESCE(a.responses, 0) AS responses,
           COALESCE(a.voters, 0) AS voters,
           COALESCE(t.shared_tasks, 0) AS shared_tasks,
           COALESCE(t.completed_tasks, 0) AS completed_tasks
    FROM eligible_games g
    LEFT JOIN answer_counts a ON a.game_id = g.id
    LEFT JOIN task_counts t ON t.game_id = g.id
    WHERE COALESCE(a.responses, 0) > 0
       OR COALESCE(t.shared_tasks, 0) > 0
    ORDER BY g.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
  ) AS row_data;

  RETURN result;
END;
$$;


--
-- Name: get_admin_poll_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_admin_poll_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  excluded_ids uuid[];
  result jsonb;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_exclusions_effective) INTO excluded_ids;

  WITH eligible_games AS (
    SELECT g.id, g.owner_id, g.type::text AS type, g.status::text AS status
    FROM public.games g
    WHERE g.type IN ('poll_text', 'poll_points')
      AND g.is_demo = false
      AND g.source_market_id IS NULL
      AND NOT (g.owner_id = ANY(excluded_ids))
  ),
  answer_rows AS (
    SELECT v.game_id, v.poll_session_id, v.voter_token, v.created_at
    FROM public.poll_votes v
    JOIN eligible_games g ON g.id = v.game_id
    UNION ALL
    SELECT e.game_id, e.poll_session_id, e.voter_token, e.created_at
    FROM public.poll_text_entries e
    JOIN eligible_games g ON g.id = e.game_id
  ),
  voters AS (
    SELECT DISTINCT game_id, voter_token FROM answer_rows
  ),
  task_rollup AS (
    SELECT t.game_id, count(*) AS tasks,
           count(*) FILTER (WHERE t.status = 'done') AS completed
    FROM public.poll_tasks t
    JOIN eligible_games g ON g.id = t.game_id
    GROUP BY t.game_id
  ),
  subs AS (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE s.status = 'active') AS active,
           count(*) FILTER (WHERE s.status = 'pending') AS pending,
           count(*) FILTER (WHERE s.status = 'declined') AS declined,
           count(*) FILTER (WHERE s.status = 'cancelled') AS cancelled
    FROM public.poll_subscriptions s
    WHERE NOT (s.owner_id = ANY(excluded_ids))
  )
  SELECT jsonb_build_object(
    'games', jsonb_build_object(
      'total', (SELECT count(*) FROM eligible_games),
      'text', (SELECT count(*) FROM eligible_games WHERE type = 'poll_text'),
      'points', (SELECT count(*) FROM eligible_games WHERE type = 'poll_points'),
      'open', (SELECT count(*) FROM eligible_games WHERE status = 'poll_open'),
      'stopped', (SELECT count(*) FROM eligible_games WHERE status = 'poll_stopped'),
      'active', (SELECT count(*) FROM eligible_games WHERE status IN ('poll_open', 'poll_stopped')),
      'active_with_votes', (
        SELECT count(*) FROM eligible_games g
        WHERE g.status IN ('poll_open', 'poll_stopped')
          AND EXISTS (
            SELECT 1
            FROM answer_rows a
            JOIN public.poll_sessions s ON s.id = a.poll_session_id
            WHERE a.game_id = g.id AND s.game_id = g.id AND s.is_open
          )
      )
    ),
    'responses', jsonb_build_object(
      'total', (SELECT count(*) FROM answer_rows),
      'last_7d', (SELECT count(*) FROM answer_rows WHERE created_at >= now() - interval '7 days'),
      'voters', (SELECT count(*) FROM voters)
    ),
    'sharing', jsonb_build_object(
      'polls', (SELECT count(DISTINCT game_id) FROM task_rollup),
      'tasks', COALESCE((SELECT sum(tasks) FROM task_rollup), 0),
      'completed_tasks', COALESCE((SELECT sum(completed) FROM task_rollup), 0)
    ),
    'subscriptions', jsonb_build_object(
      'total', (SELECT total FROM subs),
      'active', (SELECT active FROM subs),
      'pending', (SELECT pending FROM subs),
      'declined', (SELECT declined FROM subs),
      'cancelled', (SELECT cancelled FROM subs)
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_admin_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_admin_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];

  total_users      bigint;
  confirmed_users  bigint;
  guest_users      bigint;
  users_new_today  bigint;
  users_new_7d     bigint;
  users_new_30d    bigint;
  users_pl bigint; users_en bigint; users_uk bigint;

  total_games      bigint;
  games_ready      bigint;
  games_new_today  bigint;
  games_new_7d     bigint;
  games_new_30d    bigint;
  avg_questions    numeric;
  custom_settings_total bigint;

  played_today    bigint;
  played_7d       bigint;
  played_30d      bigint;
  finished_30d    bigint;
  abandoned_30d   bigint;
  in_progress     bigint;
  errors_30d      bigint;
  legacy_total    bigint;

  poll_sessions_7d  bigint;
  poll_votes_7d     bigint;
  poll_votes_total  bigint;

  bases_total    bigint;
  bases_new_today bigint;
  bases_new_7d   bigint;
  bases_new_30d  bigint;

  logos_total    bigint;
  logos_new_today bigint;
  logos_new_7d   bigint;
  logos_new_30d  bigint;

  mail_errors_24h  bigint;

  total_ratings    bigint;
  avg_rating       numeric;
  ratings_new_today bigint;
  ratings_new_7d   bigint;
  ratings_new_30d  bigint;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_exclusions_effective) INTO excluded_ids;

  -- Users
  SELECT COUNT(*) INTO total_users     FROM public.profiles WHERE NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO confirmed_users FROM public.profiles WHERE is_guest = false AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO guest_users     FROM public.profiles WHERE is_guest = true  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_today FROM public.profiles WHERE created_at >= CURRENT_DATE                AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_7d    FROM public.profiles WHERE created_at >= now() - interval '7 days'  AND NOT (id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_new_30d   FROM public.profiles WHERE created_at >= now() - interval '30 days' AND NOT (id = ANY(excluded_ids));

  SELECT COUNT(*) INTO users_pl FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'pl' AND NOT (u.id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_en FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'en' AND NOT (u.id = ANY(excluded_ids));
  SELECT COUNT(*) INTO users_uk FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.raw_user_meta_data->>'language') = 'uk' AND NOT (u.id = ANY(excluded_ids));

  -- Games
  SELECT COUNT(*) INTO total_games      FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_ready      FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND status = 'ready' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_today  FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= CURRENT_DATE AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_7d     FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO games_new_30d    FROM public.games WHERE is_demo = false AND source_market_id IS NULL AND created_at >= now() - interval '30 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COALESCE(ROUND(AVG(q_count), 1), 0) INTO avg_questions
    FROM (SELECT COUNT(*) AS q_count FROM public.questions q
          JOIN public.games g ON g.id = q.game_id
          WHERE g.is_demo = false AND g.source_market_id IS NULL AND NOT (g.owner_id = ANY(excluded_ids))
          GROUP BY q.game_id) AS sub;

  -- Niedomyślne ustawienia: advanced (mnożniki/finał) + wygląd ekranu +
  -- tryb wyboru pytań + niestandardowy dźwięk (realnie wgrany plik, nie
  -- sama zmiana głośności). WŁĄCZNIE z grami demo (jak w gameplay).
  SELECT COUNT(*) INTO custom_settings_total FROM public.games g
    WHERE NOT (g.owner_id = ANY(excluded_ids))
      AND (
        (g.settings->'game'->'advanced' IS NOT NULL
          AND g.settings->'game'->'advanced' <> '{}'::jsonb
          AND g.settings->'game'->'advanced' <> '{"roundMultipliers":[1,1,1,2,3],"finalMinPoints":300,"finalTarget":200,"endScreenMode":"logo","finalPrizeMultiplier":3,"mainPrizeAmount":25000}'::jsonb)
        OR (g.settings->'display'->'colors' IS NOT NULL
          AND g.settings->'display'->'colors' <> '{"A":"#c4002f","B":"#2a62ff","BACKGROUND":"#d21180","DOT":"#d7ff3d"}'::jsonb)
        OR (g.settings->'display'->>'theme' IS NOT NULL)
        OR (g.settings->'display'->>'logoId' IS NOT NULL)
        OR (g.settings->'game'->>'hasFinal' IS NOT NULL)
        OR (g.settings->'game'->>'finalQuestionsMode' IS NOT NULL AND g.settings->'game'->>'finalQuestionsMode' <> 'random')
        OR (g.settings->'game'->>'roundsQuestionsMode' IS NOT NULL AND g.settings->'game'->>'roundsQuestionsMode' <> 'random')
        OR EXISTS (
          SELECT 1 FROM jsonb_each_text(COALESCE(g.settings->'sound'->'variants', '{}'::jsonb)) v
          WHERE v.value = '__custom__'
        )
      );

  -- Gameplay (game_sessions_effective — realne rozgrywki, WŁĄCZNIE z sesjami
  -- na grach demo: rozegranie gry to działanie użytkownika, nawet jeśli sama
  -- gra została mu dostarczona automatycznie)
  SELECT COUNT(*) INTO played_today FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.started_at >= CURRENT_DATE AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO played_7d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.started_at >= now() - interval '7 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO played_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO finished_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.effective_status = 'final' AND s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO abandoned_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.effective_status = 'abandoned' AND s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO in_progress FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.effective_status IN ('started', 'playing') AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO errors_30d FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE COALESCE((s.client_meta->>'error_count')::int, 0) > 0 AND s.started_at >= now() - interval '30 days' AND NOT (g.owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO legacy_total FROM public.game_sessions_effective s
    JOIN public.games g ON g.id = s.game_id
    WHERE s.status = 'legacy' AND NOT (g.owner_id = ANY(excluded_ids));

  -- Polls
  SELECT COUNT(*) INTO poll_sessions_7d FROM public.poll_sessions WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO poll_votes_7d    FROM public.poll_votes    WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO poll_votes_total FROM public.poll_votes;

  -- Question bases
  SELECT COUNT(*) INTO bases_total     FROM public.question_bases WHERE is_demo = false AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_today FROM public.question_bases WHERE is_demo = false AND created_at >= CURRENT_DATE AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_7d    FROM public.question_bases WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (owner_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO bases_new_30d   FROM public.question_bases WHERE is_demo = false AND created_at >= now() - interval '30 days' AND NOT (owner_id = ANY(excluded_ids));

  -- User logos (user_id — no is_active since migration 208)
  SELECT COUNT(*) INTO logos_total     FROM public.user_logos WHERE is_demo = false AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_today FROM public.user_logos WHERE is_demo = false AND created_at >= CURRENT_DATE AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_7d    FROM public.user_logos WHERE is_demo = false AND created_at >= now() - interval '7 days' AND NOT (user_id = ANY(excluded_ids));
  SELECT COUNT(*) INTO logos_new_30d   FROM public.user_logos WHERE is_demo = false AND created_at >= now() - interval '30 days' AND NOT (user_id = ANY(excluded_ids));

  -- Mail errors
  BEGIN
    SELECT COUNT(*) INTO mail_errors_24h FROM public.mail_queue
      WHERE status = 'failed' AND updated_at >= now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN
    mail_errors_24h := 0;
  END;

  -- Ratings
  SELECT COUNT(*) INTO total_ratings FROM public.app_ratings;
  SELECT COALESCE(ROUND(AVG(stars), 1), 0) INTO avg_rating FROM public.app_ratings;
  SELECT COUNT(*) INTO ratings_new_today FROM public.app_ratings WHERE created_at >= CURRENT_DATE;
  SELECT COUNT(*) INTO ratings_new_7d    FROM public.app_ratings WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO ratings_new_30d   FROM public.app_ratings WHERE created_at >= now() - interval '30 days';

  result := jsonb_build_object(
    'timestamp', now(),
    'users', jsonb_build_object(
      'total', total_users,
      'confirmed', confirmed_users,
      'guest', guest_users,
      'new_today', users_new_today,
      'new_7d', users_new_7d,
      'new_30d', users_new_30d,
      'langs', jsonb_build_object('pl', users_pl, 'en', users_en, 'uk', users_uk)
    ),
    'games', jsonb_build_object(
      'total', total_games,
      'ready', games_ready,
      'new_today', games_new_today,
      'new_7d', games_new_7d,
      'new_30d', games_new_30d,
      'avg_q', avg_questions
    ),
    'custom_settings', jsonb_build_object(
      'total', custom_settings_total
    ),
    'gameplay', jsonb_build_object(
      'played_today', played_today,
      'played_7d', played_7d,
      'played_30d', played_30d,
      'finished_30d', finished_30d,
      'abandoned_30d', abandoned_30d,
      'in_progress', in_progress,
      'errors_30d', errors_30d,
      'legacy_total', legacy_total
    ),
    'polls', jsonb_build_object(
      'sessions_7d', poll_sessions_7d,
      'votes_7d', poll_votes_7d,
      'votes_total', poll_votes_total
    ),
    'bases', jsonb_build_object(
      'total', bases_total,
      'new_today', bases_new_today,
      'new_7d', bases_new_7d,
      'new_30d', bases_new_30d
    ),
    'logos', jsonb_build_object(
      'total', logos_total,
      'new_today', logos_new_today,
      'new_7d', logos_new_7d,
      'new_30d', logos_new_30d
    ),
    'health', jsonb_build_object(
      'mail_errors', mail_errors_24h
    ),
    'ratings', jsonb_build_object(
      'total', total_ratings,
      'average', avg_rating,
      'new_today', ratings_new_today,
      'new_7d', ratings_new_7d,
      'new_30d', ratings_new_30d
    )
  );

  RETURN result;
END;
$$;


--
-- Name: get_app_rating_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_app_rating_stats"() RETURNS TABLE("avg_stars" numeric, "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
    SELECT 
        COALESCE(ROUND(AVG(stars), 1), 0.0) as avg_stars,
        COUNT(*) as total_count
    FROM public.app_ratings;
$$;


--
-- Name: get_available_ai_providers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_available_ai_providers"() RETURNS TABLE("name" "text", "label" "text", "cooldown_remains" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    p.name, 
    p.label,
    EXTRACT(EPOCH FROM (p.cooldown_until - now()))::integer as cooldown_remains
  FROM "public"."marketing_ai_providers" p
  WHERE p.is_active = true 
    AND (p.cooldown_until IS NULL OR p.cooldown_until < now())
  ORDER BY p.priority ASC;
END;
$$;


--
-- Name: get_control2_display_events("uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_control2_display_events"("p_session_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(jsonb_object_agg(session_id::text,events),'{}'::jsonb)
  FROM (
    SELECT e.session_id,jsonb_agg(
      jsonb_build_object(
        'kind','diagnostic',
        'category',CASE WHEN e.event_type='lease_state' THEN 'device_lease' ELSE 'display_state' END,
        'at',e.created_at,
        'message',CASE
          WHEN e.event_type<>'lease_state' THEN 'Zdarzenie urządzenia Wyświetlacz.'
          WHEN e.details->>'to_state'='waiting' THEN 'Urządzenie oczekuje na zwolnienie blokady.'
          WHEN e.details->>'to_state'='primary' THEN 'Urządzenie zostało aktywowane jako główne.'
          WHEN e.details->>'to_state'='released' THEN 'Urządzenie zwolniło blokadę.'
          WHEN e.details->>'to_state'='expired' THEN 'Blokada urządzenia wygasła.'
          WHEN e.details->>'to_state'='revoked' THEN 'Połączenie urządzenia zostało cofnięte.'
          ELSE 'Zmienił się stan blokady urządzenia.' END,
        'devices',CASE WHEN e.event_type='lease_state'
          THEN jsonb_build_array(e.device_type) ELSE jsonb_build_array('display') END,
        'metrics',e.details||jsonb_build_object('reason',e.event_type)
      ) ORDER BY e.created_at,e.id
    ) AS events
    FROM public.control2_device_events e
    JOIN public.game_sessions s ON s.id=e.session_id AND s.control_version=2
    WHERE e.session_id=ANY(coalesce(p_session_ids,'{}'::uuid[]))
    GROUP BY e.session_id
  ) logs;
$$;


--
-- Name: get_email_intent_status("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_email_intent_status"("p_email" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT status FROM public.email_intents WHERE email = lower(p_email) LIMIT 1;
$$;


--
-- Name: get_game_by_key("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_game_by_key"("p_key" "text") RETURNS TABLE("id" "uuid", "name" "text", "type" "public"."game_type", "status" "public"."game_status")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select g.id, g.name, g.type, g.status
  from public.games g
  where g.share_key_poll = p_key
     or g.share_key_control = p_key
     or g.share_key_display = p_key
     or g.share_key_host = p_key
  limit 1;
$$;


--
-- Name: get_maintenance_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_maintenance_activity"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 WITH pages AS (
 SELECT a.*,coalesce(p.username,p.email,'Użytkownik') AS username FROM public.site_activity a
 JOIN public.profiles p ON p.id=a.user_id WHERE a.last_seen_at>now()-interval '90 seconds' AND NOT EXISTS(SELECT 1 FROM public.stats_exclusions_effective e WHERE e.user_id=a.user_id)
 ), locks AS (
 SELECT l.*,coalesce(p.username,p.email,'Użytkownik') AS username,
 CASE WHEN l.resource_type='game' THEN g.name ELSE NULL END AS resource_name
 FROM public.edit_locks l LEFT JOIN public.profiles p ON p.id=l.holder_user_id
 LEFT JOIN public.games g ON l.resource_type='game' AND g.id=l.resource_id
 WHERE l.heartbeat_at>now()-interval '25 seconds' AND NOT EXISTS(SELECT 1 FROM public.stats_exclusions_effective e WHERE e.user_id=l.holder_user_id)
 ), devices AS (
 SELECT game_id,max(last_seen_at) AS last_seen_at,jsonb_agg(DISTINCT device_type::text) AS devices
 FROM public.device_presence WHERE last_seen_at>now()-interval '25 seconds' GROUP BY game_id
 ), sessions AS (
 SELECT DISTINCT ON(game_id) * FROM public.game_sessions WHERE control_version=2 ORDER BY game_id,started_at DESC,id
 ), candidates AS (
 SELECT game_id FROM devices
 UNION SELECT game_id FROM pages WHERE game_id IS NOT NULL AND page IN ('control')
 UNION SELECT game_id FROM sessions WHERE ended_at IS NULL AND status IN ('started','playing','final') AND last_seen_at>now()-interval '15 minutes'
 UNION SELECT resource_id FROM locks WHERE resource_type='game' AND holder_context='control'
 ), games AS (
 SELECT g.id AS game_id,g.owner_id AS user_id,coalesce(p.username,p.email,'Użytkownik') AS username,g.name,
 2 AS control_version,
 s.status,s.ended_at,s.last_seen_at AS session_seen_at,
 st.step::text AS step,
 st.phase::text AS phase,
 coalesce(d.devices,'[]'::jsonb) AS devices,d.last_seen_at AS devices_seen_at,
 EXISTS(SELECT 1 FROM pages a WHERE a.game_id=g.id AND a.page IN ('control')) AS operator_online,
 EXISTS(SELECT 1 FROM locks l WHERE l.resource_type='game' AND l.resource_id=g.id AND l.holder_context='control') AS control_lock
 FROM candidates c JOIN public.games g ON g.id=c.game_id LEFT JOIN public.profiles p ON p.id=g.owner_id
 LEFT JOIN sessions s ON s.game_id=g.id LEFT JOIN devices d ON d.game_id=g.id LEFT JOIN public.game_state st ON st.game_id=g.id
 WHERE NOT EXISTS(SELECT 1 FROM public.stats_exclusions_effective e WHERE e.user_id=g.owner_id)
 ), history_rows AS (SELECT * FROM public.site_activity_hours h WHERE NOT EXISTS(SELECT 1 FROM public.stats_exclusions_effective e WHERE e.user_id=h.user_id))
 SELECT jsonb_build_object('generated_at',now(),
 'pages',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM pages ORDER BY last_seen_at DESC LIMIT 500) x),'[]'::jsonb),
 'locks',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM locks ORDER BY heartbeat_at DESC LIMIT 500) x),'[]'::jsonb),
 'games',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM games ORDER BY name,game_id LIMIT 500) x),'[]'::jsonb),
 'history',jsonb_build_object(
 'hour',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT b AS bucket,count(DISTINCT h.user_id) AS users FROM generate_series(greatest((SELECT min(bucket) FROM history_rows),date_trunc('hour',now())-interval '47 hours'),date_trunc('hour',now()),interval '1 hour') b LEFT JOIN history_rows h ON h.bucket=b WHERE EXISTS(SELECT 1 FROM history_rows) GROUP BY b ORDER BY b) x),'[]'::jsonb),
 'day',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT b AT TIME ZONE 'Europe/Warsaw' AS bucket,count(DISTINCT h.user_id) AS users FROM generate_series(greatest((SELECT date_trunc('day',min(bucket) AT TIME ZONE 'Europe/Warsaw') FROM history_rows),date_trunc('day',now() AT TIME ZONE 'Europe/Warsaw')-interval '29 days'),date_trunc('day',now() AT TIME ZONE 'Europe/Warsaw'),interval '1 day') b LEFT JOIN history_rows h ON date_trunc('day',h.bucket AT TIME ZONE 'Europe/Warsaw')=b WHERE EXISTS(SELECT 1 FROM history_rows) GROUP BY b ORDER BY b) x),'[]'::jsonb),
 'week',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT b AT TIME ZONE 'Europe/Warsaw' AS bucket,count(DISTINCT h.user_id) AS users FROM generate_series(greatest((SELECT date_trunc('week',min(bucket) AT TIME ZONE 'Europe/Warsaw') FROM history_rows),date_trunc('week',now() AT TIME ZONE 'Europe/Warsaw')-interval '12 weeks'),date_trunc('week',now() AT TIME ZONE 'Europe/Warsaw'),interval '1 week') b LEFT JOIN history_rows h ON date_trunc('week',h.bucket AT TIME ZONE 'Europe/Warsaw')=b WHERE EXISTS(SELECT 1 FROM history_rows) GROUP BY b ORDER BY b) x),'[]'::jsonb),
 'since',(SELECT min(bucket) FROM history_rows),'timezone','Europe/Warsaw'),
 'truncated',(SELECT count(*)>500 FROM pages) OR (SELECT count(*)>500 FROM locks) OR (SELECT count(*)>500 FROM games));
$$;


--
-- Name: get_message("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_message"("p_id" "uuid") RETURNS TABLE("id" "uuid", "source" "text", "direction" "text", "from_email" "text", "to_email" "text", "subject" "text", "body" "text", "body_html" "text", "report_id" "uuid", "ticket_number" "text", "report_status" "text", "report_subject" "text", "queue_id" "uuid", "is_marketing" boolean, "created_at" timestamp with time zone, "deleted_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
    SELECT
      m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
      m.body, m.body_html,
      m.report_id, r.ticket_number, r.status AS report_status, r.subject AS report_subject,
      m.queue_id, m.is_marketing,
      m.created_at, m.deleted_at
    FROM public.messages m
    LEFT JOIN public.reports r ON r.id = m.report_id
    WHERE m.id = p_id;
END;
$$;


--
-- Name: get_message_attachments("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_message_attachments"("p_message_id" "uuid") RETURNS TABLE("id" "uuid", "filename" "text", "mime_type" "text", "size" integer, "storage_path" "text", "content_id" "text", "inline" boolean, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.filename, a.mime_type, a.size, a.storage_path, a.content_id, a.inline, a.created_at
  FROM message_attachments a
  WHERE a.message_id = p_message_id
  ORDER BY a.inline DESC, a.created_at ASC;
END;
$$;


--
-- Name: get_my_email_notifications("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_my_email_notifications"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE mailbox text;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT public._norm_email(u.email) INTO mailbox FROM auth.users u
  WHERE u.id=p_user_id AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR SHARE;
 IF NOT FOUND OR mailbox IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM public._mail_center_identity_lock(mailbox);
 RETURN public._contact_mail_enabled(mailbox);
END $$;


--
-- Name: get_poll_bundle("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_poll_bundle"("p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  gid uuid;
  out jsonb;
begin
  select g.id into gid
  from public.games g
  where g.share_key_poll = p_key
  limit 1;

  if gid is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  select jsonb_build_object(
    'ok', true,
    'game', jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'type', g.type,
      'status', g.status
    ),
    'questions',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'ord', q.ord,
            'text', q.text,
            'answers', (
              select jsonb_agg(jsonb_build_object('ord', a.ord, 'text', a.text) order by a.ord)
              from public.answers a
              where a.question_id = q.id
            )
          ) order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
  )
  into out
  from public.games g
  where g.id = gid;

  return out;
end $$;


--
-- Name: get_poll_game("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_poll_game"("p_game_id" "uuid", "p_key" "text") RETURNS "jsonb"
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


--
-- Name: get_poll_preview("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_poll_preview"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_type   text;
  v_result jsonb;
BEGIN
  -- Sprawdź własność gry (SECURITY DEFINER wymaga ręcznego sprawdzenia)
  SELECT status, type INTO v_status, v_type
  FROM games
  WHERE id = p_game_id AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_unauthorized';
  END IF;

  -- CASE 1: Ankieta zamknięta (status = 'ready')
  -- Zwraca pytania + odpowiedzi z fixed_points
  IF v_status = 'ready' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',      q.id,
        'ord',     q.ord,
        'text',    q.text,
        'answers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id',           a.id,
              'text',         a.text,
              'fixed_points', COALESCE(a.fixed_points, 0)
            ) ORDER BY a.ord
          ), '[]'::jsonb)
          FROM answers a
          WHERE a.question_id = q.id
        )
      ) ORDER BY q.ord
    ) INTO v_result
    FROM questions q
    WHERE q.game_id = p_game_id;

  -- CASE 2: poll_points LIVE
  -- Zwraca pytania + odpowiedzi + liczba głosów z ostatniej sesji per pytanie
  ELSIF v_type = 'poll_points' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',      q.id,
        'ord',     q.ord,
        'text',    q.text,
        'answers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id',    a.id,
              'text',  a.text,
              'votes', COALESCE((
                SELECT COUNT(*)
                FROM poll_votes pv
                WHERE pv.answer_id = a.id
                  AND pv.poll_session_id = (
                    SELECT ps.id FROM poll_sessions ps
                    WHERE ps.game_id = p_game_id
                      AND ps.question_id = q.id
                    ORDER BY ps.created_at DESC
                    LIMIT 1
                  )
              ), 0)
            ) ORDER BY a.ord
          ), '[]'::jsonb)
          FROM answers a
          WHERE a.question_id = q.id
        )
      ) ORDER BY q.ord
    ) INTO v_result
    FROM questions q
    WHERE q.game_id = p_game_id;

  -- CASE 3: poll_text LIVE
  -- Zwraca pytania + pogrupowane wpisy tekstowe (top 12 per pytanie) z ostatniej sesji
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',        q.id,
        'ord',       q.ord,
        'text',      q.text,
        'text_rows', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object('text', sub.answer_norm, 'val', sub.cnt)
            ORDER BY sub.cnt DESC
          ), '[]'::jsonb)
          FROM (
            SELECT pte.answer_norm, COUNT(*) AS cnt
            FROM poll_text_entries pte
            WHERE pte.poll_session_id = (
                SELECT ps.id FROM poll_sessions ps
                WHERE ps.game_id = p_game_id
                  AND ps.question_id = q.id
                ORDER BY ps.created_at DESC
                LIMIT 1
              )
              AND pte.question_id = q.id
              AND pte.answer_norm IS NOT NULL
              AND trim(pte.answer_norm) != ''
            GROUP BY pte.answer_norm
            ORDER BY cnt DESC
            LIMIT 12
          ) sub
        )
      ) ORDER BY q.ord
    ) INTO v_result
    FROM questions q
    WHERE q.game_id = p_game_id;
  END IF;

  RETURN jsonb_build_object(
    'status',    v_status,
    'type',      v_type,
    'questions', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;


--
-- Name: get_ratings_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_ratings_admin"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "stars" smallint, "comment" "text", "created_at" timestamp with time zone, "username" "text", "email" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT
    r.id,
    r.user_id,
    r.stars,
    r.comment,
    r.created_at,
    p.username,
    p.email
  FROM public.app_ratings r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  ORDER BY r.created_at DESC;
$$;


--
-- Name: get_report_messages("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_report_messages"("p_report_id" "uuid") RETURNS TABLE("id" "uuid", "source" "text", "direction" "text", "from_email" "text", "to_email" "text", "subject" "text", "body" "text", "body_html" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
    SELECT
      m.id,
      m.source,
      m.direction,
      m.from_email,
      m.to_email,
      m.subject,
      m.body,
      m.body_html,
      m.created_at
    FROM public.messages m
    WHERE m.report_id = p_report_id
      AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC;
END;
$$;


--
-- Name: get_retention_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_retention_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];

  total_confirmed bigint;
  activated       bigint;
  real_activated  bigint;  -- uruchomili rozgrywkę (display connected, non-demo)
  never_active    bigint;

  seg_active_7d   bigint;
  seg_active_8_30 bigint;
  seg_dormant     bigint;
  seg_never       bigint;

  d7_cohort   bigint; d7_returned   bigint;
  d30_cohort  bigint; d30_returned  bigint;

  trend_users jsonb;
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_exclusions_effective) INTO excluded_ids;

  SELECT COUNT(*) INTO total_confirmed
    FROM public.profiles WHERE is_guest = false AND NOT (id = ANY(excluded_ids));

  -- Poziom 2: stworzyli własną grę
  SELECT COUNT(DISTINCT g.owner_id) INTO activated
    FROM public.games g JOIN public.profiles p ON p.id = g.owner_id
    WHERE g.is_demo = false AND p.is_guest = false AND NOT (p.id = ANY(excluded_ids));

  -- Poziom 3: uruchomili rozgrywkę (display połączony z ich grą)
  SELECT COUNT(DISTINCT g.owner_id) INTO real_activated
    FROM public.device_presence dp
    JOIN public.games g ON g.id = dp.game_id
    JOIN public.profiles p ON p.id = g.owner_id
    WHERE dp.device_type = 'display' AND g.is_demo = false
      AND p.is_guest = false AND NOT (p.id = ANY(excluded_ids));

  never_active := total_confirmed - activated;

  -- Segmenty (ostatnia aktywność = last game update)
  WITH last_activity AS (
    SELECT p.id, MAX(g.updated_at) AS last_updated
    FROM public.profiles p
    LEFT JOIN public.games g ON g.owner_id = p.id AND g.is_demo = false
    WHERE p.is_guest = false AND NOT (p.id = ANY(excluded_ids))
    GROUP BY p.id
  )
  SELECT
    COUNT(CASE WHEN last_updated >= now() - interval '7 days' THEN 1 END),
    COUNT(CASE WHEN last_updated <  now() - interval '7 days' AND last_updated >= now() - interval '30 days' THEN 1 END),
    COUNT(CASE WHEN last_updated <  now() - interval '30 days' THEN 1 END),
    COUNT(CASE WHEN last_updated IS NULL THEN 1 END)
  INTO seg_active_7d, seg_active_8_30, seg_dormant, seg_never
  FROM last_activity;

  -- D7 retention
  WITH cohort AS (
    SELECT id, created_at AS reg_at FROM public.profiles
    WHERE is_guest = false AND created_at < now() - interval '7 days' AND NOT (id = ANY(excluded_ids))
  )
  SELECT COUNT(*),
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM public.games g WHERE g.owner_id = c.id AND g.is_demo = false
        AND g.updated_at >= c.reg_at + interval '1 day' AND g.updated_at <= c.reg_at + interval '7 days'
    ) THEN 1 END)
  INTO d7_cohort, d7_returned FROM cohort c;

  -- D30 retention
  WITH cohort AS (
    SELECT id, created_at AS reg_at FROM public.profiles
    WHERE is_guest = false AND created_at < now() - interval '30 days' AND NOT (id = ANY(excluded_ids))
  )
  SELECT COUNT(*),
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM public.games g WHERE g.owner_id = c.id AND g.is_demo = false
        AND g.updated_at >= c.reg_at + interval '1 day' AND g.updated_at <= c.reg_at + interval '30 days'
    ) THEN 1 END)
  INTO d30_cohort, d30_returned FROM cohort c;

  -- Trend 14 dni
  SELECT jsonb_agg(jsonb_build_object('day', day::text, 'count', count) ORDER BY day)
  INTO trend_users
  FROM (
    SELECT DATE(created_at) AS day, COUNT(*) AS count
    FROM public.profiles
    WHERE is_guest = false AND created_at >= CURRENT_DATE - interval '13 days'
      AND NOT (id = ANY(excluded_ids))
    GROUP BY DATE(created_at)
  ) sub;

  result := jsonb_build_object(
    'funnel', jsonb_build_object(
      'registered',     total_confirmed,
      'game_created',   activated,
      'game_played',    real_activated,
      'never_active',   never_active
    ),
    'segments', jsonb_build_object(
      'active_7d', seg_active_7d, 'active_8_30d', seg_active_8_30,
      'dormant', seg_dormant, 'never', seg_never
    ),
    'retention', jsonb_build_object(
      'd7',  jsonb_build_object('cohort', d7_cohort,  'returned', d7_returned),
      'd30', jsonb_build_object('cohort', d30_cohort, 'returned', d30_returned)
    ),
    'trend_users', COALESCE(trend_users, '[]'::jsonb),
    'timestamp', now()
  );
  RETURN result;
END;
$$;


--
-- Name: get_stats_detail("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_stats_detail"("p_type" "text", "p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  result       jsonb;
  excluded_ids uuid[];
BEGIN
  SELECT ARRAY(SELECT user_id FROM public.stats_exclusions_effective) INTO excluded_ids;

  CASE p_type

  WHEN 'users' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        p.username,
        p.email,
        lower(u.raw_user_meta_data->>'language') AS language,
        p.is_guest,
        p.created_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE NOT (p.id = ANY(excluded_ids))
      ORDER BY p.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'games' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name,
        g.type,
        g.status,
        pr.username AS owner,
        g.created_at
      FROM public.games g
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE g.is_demo = false
        AND g.source_market_id IS NULL
        AND NOT (g.owner_id = ANY(excluded_ids))
      ORDER BY g.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'custom_settings' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        g.name AS game_name,
        pr.username AS owner,
        g.created_at,
        g.settings->'game'->'advanced' AS advanced,
        g.settings->'display' AS display,
        g.settings->'game'->>'hasFinal' AS has_final,
        g.settings->'game'->>'finalQuestionsMode' AS final_questions_mode,
        g.settings->'game'->>'roundsQuestionsMode' AS rounds_questions_mode,
        g.settings->'sound' AS sound
      FROM public.games g
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE NOT (g.owner_id = ANY(excluded_ids))
        AND (
          (g.settings->'game'->'advanced' IS NOT NULL
            AND g.settings->'game'->'advanced' <> '{}'::jsonb
            AND g.settings->'game'->'advanced' <> '{"roundMultipliers":[1,1,1,2,3],"finalMinPoints":300,"finalTarget":200,"endScreenMode":"logo","finalPrizeMultiplier":3,"mainPrizeAmount":25000}'::jsonb)
          OR (g.settings->'display'->'colors' IS NOT NULL
            AND g.settings->'display'->'colors' <> '{"A":"#c4002f","B":"#2a62ff","BACKGROUND":"#d21180","DOT":"#d7ff3d"}'::jsonb)
          OR (g.settings->'display'->>'theme' IS NOT NULL)
          OR (g.settings->'display'->>'logoId' IS NOT NULL)
          OR (g.settings->'game'->>'hasFinal' IS NOT NULL)
          OR (g.settings->'game'->>'finalQuestionsMode' IS NOT NULL AND g.settings->'game'->>'finalQuestionsMode' <> 'random')
          OR (g.settings->'game'->>'roundsQuestionsMode' IS NOT NULL AND g.settings->'game'->>'roundsQuestionsMode' <> 'random')
          OR EXISTS (
            SELECT 1 FROM jsonb_each_text(COALESCE(g.settings->'sound'->'variants', '{}'::jsonb)) v
            WHERE v.value = '__custom__'
          )
        )
      ORDER BY g.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'gameplay' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        s.id AS session_id,
        g.name AS game_name,
        pr.username AS owner,
        s.control_version,
        s.stats_detail,
        s.started_at,
        s.ended_at,
        s.status,
        s.effective_status,
        s.rounds_played,
        s.winner_team,
        s.team_a_score,
        s.team_b_score,
        s.rounds_score_a,
        s.rounds_score_b,
        s.final_points,
        s.client_meta->>'final_step' AS final_step,
        COALESCE((s.client_meta->>'error_count')::int, 0) AS error_count
      FROM public.game_sessions_effective s
      JOIN public.games g ON g.id = s.game_id
      LEFT JOIN public.profiles pr ON pr.id = g.owner_id
      WHERE NOT (g.owner_id = ANY(excluded_ids))
      ORDER BY s.started_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'bases' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        b.name,
        pr.username AS owner,
        b.created_at
      FROM public.question_bases b
      LEFT JOIN public.profiles pr ON pr.id = b.owner_id
      WHERE b.is_demo = false
        AND NOT (b.owner_id = ANY(excluded_ids))
      ORDER BY b.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'logos' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        l.name,
        l.type,
        pr.username AS owner,
        l.created_at
      FROM public.user_logos l
      LEFT JOIN public.profiles pr ON pr.id = l.user_id
      WHERE l.is_demo = false
        AND NOT (l.user_id = ANY(excluded_ids))
      ORDER BY l.created_at DESC
      LIMIT p_limit
    ) r;

  WHEN 'ratings' THEN
    SELECT jsonb_agg(r)
    INTO result
    FROM (
      SELECT
        pr.username,
        rt.stars,
        rt.comment,
        rt.created_at
      FROM public.app_ratings rt
      LEFT JOIN public.profiles pr ON pr.id = rt.user_id
      ORDER BY rt.created_at DESC
      LIMIT p_limit
    ) r;

  ELSE
    result := '[]'::jsonb;
  END CASE;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


--
-- Name: get_trash_attachments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_trash_attachments"() RETURNS TABLE("id" "uuid", "storage_path" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.storage_path
  FROM public.message_attachments a
  JOIN public.messages m ON m.id = a.message_id
  WHERE m.deleted_at IS NOT NULL
    AND m.deleted_at < now() - interval '30 days'
    AND a.storage_path <> '';
END;
$$;


--
-- Name: get_unsub_info_for_task_emails("uuid", "text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_unsub_info_for_task_emails"("p_owner_id" "uuid", "p_emails" "text"[]) RETURNS TABLE("email" "text", "sub_token" "uuid", "unsub_token" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    lower(coalesce(ps.subscriber_email, '')) AS email,
    ps.token AS sub_token,
    ut.token AS unsub_token
  FROM public.poll_subscriptions ps
  LEFT JOIN public.email_unsub_tokens ut
    ON lower(ut.email) = lower(ps.subscriber_email)
  WHERE ps.owner_id = p_owner_id
    AND ps.status = 'active'
    AND ps.subscriber_email IS NOT NULL
    AND lower(ps.subscriber_email) = ANY(
      SELECT lower(e) FROM unnest(p_emails) AS e
    );
END;
$$;


--
-- Name: guard_final_display_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guard_final_display_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NEW.step::text = 'r_duel' AND NEW.detail#>>'{rounds,duel,lastPressed}' IS DISTINCT FROM OLD.detail#>>'{rounds,duel,lastPressed}' AND
   EXISTS(SELECT FROM public.game_state_display_completion WHERE game_id = OLD.game_id AND rendered_rev < requested_rev) THEN
  RAISE EXCEPTION 'display still rendering';
 END IF;
 IF ((NEW.step::text = 'f_end' AND OLD.step::text LIKE 'f_p%_map_q%') OR
     (OLD.step::text IN ('r_duel', 'r_play') AND OLD.sound_cue_key = 'reveal' AND
      (NEW.step::text IN ('r_gameEnd', 'f_start', 'r_roundStart') OR NEW.phase::text = 'REVEAL'))) AND
   coalesce((SELECT rendered_rev < requested_rev FROM public.game_state_display_completion WHERE game_id = OLD.game_id), true) THEN
  RAISE EXCEPTION 'display still rendering';
 END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_game_content(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guard_game_content"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_game_id uuid;
  v_type text;
  v_status text;
begin
  -- tylko zapisy prosto z przeglądarki; SECURITY DEFINER i kaskady -> owner
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'questions' then
    v_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  else
    select q.game_id into v_game_id
    from public.questions q
    where q.id = case when tg_op = 'DELETE' then old.question_id else new.question_id end;
  end if;

  select g.type::text, g.status::text into v_type, v_status
  from public.games g
  where g.id = v_game_id;

  if not found then
    return coalesce(new, old);
  end if;

  if v_type = 'market' then
    raise exception 'game_content_locked:market' using errcode = 'P0001';
  end if;

  if v_type in ('poll_text', 'poll_points') and v_status in ('poll_open', 'poll_stopped') then
    raise exception 'game_content_locked:%', v_status using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;


--
-- Name: guard_game_poll_close(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guard_game_poll_close"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_chk jsonb;
begin
  if old.status = 'poll_open' and new.status = 'ready'
     and new.type in ('poll_text', 'poll_points') then
    v_chk := public.game_poll_close_check(new.id);
    if not coalesce((v_chk->>'ok')::boolean, false) then
      -- kod + numer pytania, żeby strona mogła pokazać pełny komunikat
      raise exception 'poll_close_blocked:%:%', coalesce(v_chk->>'code', 'unknownType'),
        coalesce(v_chk->'params'->>'ord', '')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: guest_cancel_migration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_cancel_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  has_col boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select email_confirmed_at into v_email_confirmed_at
  from auth.users
  where id = v_uid;

  if v_email_confirmed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_confirmed');
  end if;

  perform public.auth_clear_email_change(v_uid);

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password'
  ) into has_col;
  if has_col then
    update auth.users set encrypted_password = null where id = v_uid;
  end if;

  delete from public.guest_migration_staging where user_id = v_uid;

  update public.profiles
  set is_guest = true,
      email = null,
      guest_last_active_at = now(),
      guest_expires_at = now() + interval '5 days'
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: guest_cleanup_expired(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_cleanup_expired"("p_limit" integer DEFAULT 500) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_deleted int := 0;
  v_id uuid;
begin
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

  if v_deleted < v_limit then
    for v_id in
      select u.id
        from auth.users u
        left join public.profiles p on p.id = u.id
       where (p.username IS NULL OR p.id IS NULL)
         and u.last_sign_in_at IS NULL
         and u.created_at < (now() - interval '5 days')
         and coalesce(p.is_guest, false) = false
       limit (v_limit - v_deleted)
    loop
      perform public.delete_user_everything(v_id);
      v_deleted := v_deleted + 1;
    end loop;
  end if;

  return v_deleted;
end;
$$;


--
-- Name: guest_convert_account("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_convert_account"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_is_guest boolean := false;
  v_auth_email text;
  v_confirmed_at timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  -- Auth is the parent identity; lock it before touching profiles/tasks.
  select lower(trim(email)), email_confirmed_at
    into v_auth_email, v_confirmed_at
  from auth.users where id = v_uid for update;

  if v_confirmed_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_confirmed');
  end if;
  if v_auth_email is distinct from v_email then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select coalesce(is_guest, false)
    into v_is_guest
  from public.profiles
  where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  update public.profiles
     set is_guest = false,
         guest_last_active_at = null,
         guest_expires_at = null,
         email = v_email
   where id = v_uid;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('is_guest', false)
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: guest_discard_current(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_discard_current"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false)
    into v_is_guest
    from public.profiles
   where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  perform public.delete_user_everything(v_uid);
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: guest_finalize_migration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_finalize_migration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean;
  v_email text;
  v_email_confirmed_at timestamptz;
  v_pending_username text;
  v_pending_password_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false) into v_is_guest
  from public.profiles where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', true);
  end if;

  select email, email_confirmed_at into v_email, v_email_confirmed_at
  from auth.users where id = v_uid;

  if v_email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_confirmed');
  end if;

  select pending_username, pending_password_hash
    into v_pending_username, v_pending_password_hash
  from public.guest_migration_staging
  where user_id = v_uid;

  update public.profiles
  set is_guest = false,
      guest_last_active_at = null,
      guest_expires_at = null,
      email = v_email
  where id = v_uid;

  if v_pending_username is not null then
    -- Wyścig o nazwę (ktoś inny zajął ją między submitem a potwierdzeniem)
    -- to unique_violation na profiles_username_ci_uq — nie ma powodu wywalać
    -- całej finalizacji przez to; zostaw placeholder, istniejący fallback
    -- (login.js, ekran setup=username) i tak to obsłuży.
    begin
      update public.profiles
      set username = v_pending_username
      where id = v_uid
        and not exists (
          select 1 from public.profiles pp
          where lower(pp.username) = v_pending_username and pp.id <> v_uid
        );
    exception when unique_violation then
      null;
    end;
  end if;

  if v_pending_password_hash is not null then
    update auth.users set encrypted_password = v_pending_password_hash where id = v_uid;
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('is_guest', false)
  where id = v_uid;

  delete from public.guest_migration_staging where user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: guest_is_expired("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_is_expired"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(p.is_guest, false)
         and coalesce(p.guest_expires_at <= now(), false)
  from public.profiles p
  where p.id = p_user_id;
$$;


--
-- Name: guest_stage_migration("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_stage_migration"("p_username" "text" DEFAULT NULL::"text", "p_password" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean;
  v_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
  v_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false) into v_is_guest
  from public.profiles where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  if v_username is not null then
    if length(v_username) < 3 or length(v_username) > 20
       or v_username like 'guest\_%' escape '\'
       or v_username !~ '^[a-zA-Z0-9_.-]+$'
    then
      return jsonb_build_object('ok', false, 'error', 'invalid_username');
    end if;
  end if;

  if p_password is not null and p_password <> '' then
    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  end if;

  insert into public.guest_migration_staging (user_id, pending_username, pending_password_hash, created_at)
  values (v_uid, v_username, v_hash, now())
  on conflict (user_id) do update
    set pending_username = excluded.pending_username,
        pending_password_hash = excluded.pending_password_hash,
        created_at = now();

  return jsonb_build_object('ok', true);
end;
$_$;


--
-- Name: guest_touch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guest_touch"("p_ttl_days" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_days int := greatest(1, least(coalesce(p_ttl_days, 5), 30));
  v_count int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.profiles
     set guest_last_active_at = now(),
         guest_expires_at = now() + make_interval(days => v_days)
   where id = v_uid
     and is_guest = true;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  return jsonb_build_object('ok', true, 'ttl_days', v_days);
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_email text;
    v_username text;
    v_is_guest boolean;
    v_last_active timestamptz;
    v_expires_at timestamptz;
    v_lang text;
begin
  v_email    := new.email;
  v_is_guest := coalesce(new.raw_user_meta_data->>'is_guest','false')='true' OR
    (coalesce(new.is_anonymous,false) AND (new.email_confirmed_at IS NULL OR nullif(trim(new.email),'') IS NULL));

  -- Try to get username from metadata or email
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );

  -- If still missing (common for anonymous guests), generate a guest_XXX name
  IF v_username IS NULL OR v_username = '' THEN
    IF v_is_guest THEN
      v_username := 'guest_' || substr(replace(new.id::text, '-', ''), 1, 8);
    ELSE
      -- For non-guests we really expect a name, but as a fallback use a slice of UUID
      v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
    END IF;
  END IF;

  IF v_is_guest THEN
    v_last_active := now();
    v_expires_at  := now() + interval '5 days';
  ELSE
    v_last_active := null;
    v_expires_at  := null;
  END IF;

  INSERT INTO public.profiles (id, email, username, is_guest, guest_last_active_at, guest_expires_at)
  VALUES (new.id, v_email, v_username, v_is_guest, v_last_active, v_expires_at)
  ON CONFLICT (id) DO UPDATE
    SET email                = excluded.email,
        username             = coalesce(excluded.username, public.profiles.username),
        is_guest             = excluded.is_guest,
        guest_last_active_at = excluded.guest_last_active_at,
        guest_expires_at     = excluded.guest_expires_at;

  INSERT INTO public.user_flags (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  v_lang := lower(trim(coalesce(new.raw_user_meta_data->>'language', 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  BEGIN
    PERFORM public.seed_demo_for_user(new.id, v_lang);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: demo seed failed for % (lang=%): %',
      new.id, v_lang, sqlerrm;
  END;

  RETURN new;
END;
$$;


--
-- Name: host2_logo_get_public("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."host2_logo_get_public"("p_game_id" "uuid", "p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE g public.games; logo_id uuid; logo jsonb; busy boolean;
BEGIN
  IF NOT public.control_device_key_valid(p_game_id,'host',p_key) THEN RETURN NULL; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id;
  logo_id:=nullif(g.settings->'display'->>'logoId','')::uuid;
  IF logo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_logos l WHERE l.id=logo_id AND l.user_id=g.owner_id) THEN logo_id:=NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM public.edit_locks l WHERE l.resource_type='logo' AND l.resource_id=logo_id
    AND l.heartbeat_at>now()-public.edit_lock_ttl()) INTO busy;
  IF NOT busy AND logo_id IS NOT NULL THEN
    SELECT jsonb_build_object('type',l.type,'payload',l.payload,'name',l.name) INTO logo
      FROM public.user_logos l WHERE l.id=logo_id AND l.user_id=g.owner_id;
  END IF;
  RETURN jsonb_build_object('busy',busy,'logo',logo,'logoId',logo_id);
END $$;


--
-- Name: initiate_email_change_intent("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."initiate_email_change_intent"("p_new_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.email_intents (email, intent, status, cooldown_until, user_id)
  VALUES (
    lower(p_new_email),
    'guest_migrate',
    'pending',
    now() + interval '24 hours',
    auth.uid()
  )
  ON CONFLICT (email) DO UPDATE SET
    intent        = 'guest_migrate',
    status        = 'pending',
    cooldown_until = now() + interval '24 hours',
    user_id       = auth.uid(),
    updated_at    = now();
END;
$$;


--
-- Name: invoke_embed_missing_market_games("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."invoke_embed_missing_market_games"("p_lang" "text" DEFAULT 'all'::"text", "p_limit" integer DEFAULT 25) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_anon text := (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key');
  v_url  text := v_base || '/functions/v1/generate-game';
begin
  if coalesce(v_base, '') = '' or coalesce(v_anon, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon
    ),
    body := jsonb_build_object(
      'action', 'embed-missing',
      'lang', coalesce(nullif(p_lang, ''), 'all'),
      'limit', greatest(1, least(coalesce(p_limit, 25), 50))
    )
  );
end;
$$;


--
-- Name: invoke_mail_worker(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."invoke_mail_worker"("p_limit" integer DEFAULT 25) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_url text :=
    (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
    || '/functions/v1/mail-worker?limit=' || p_limit::text;

  v_anon text := (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'mail_worker_secret');
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- ✅ jeśli Edge Function ma Require JWT = ON
      'Authorization', 'Bearer ' || v_anon,
      -- ✅ Twój własny gate w mail-worker
      'x-mail-worker-secret', v_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;


--
-- Name: invoke_mail_worker_ids("uuid"[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."invoke_mail_worker_ids"("p_ids" "uuid"[], "p_limit" integer DEFAULT 25) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_url text :=
    (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
    || '/functions/v1/mail-worker?limit=' || greatest(1, least(coalesce(p_limit, 25), 200))::text;
  v_ids text := '';
  v_anon text := (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'mail_worker_secret');
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    perform public.invoke_mail_worker(p_limit);
    return;
  end if;

  select string_agg(id::text, ',') into v_ids
    from unnest(p_ids) as id;

  if coalesce(v_ids, '') = '' then
    perform public.invoke_mail_worker(p_limit);
    return;
  end if;

  v_url := v_url || '&ids=' || v_ids;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-mail-worker-secret', v_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;


--
-- Name: is_base_owner("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_base_owner"("p_base_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.question_bases b
    where b.id = p_base_id and b.owner_id = auth.uid()
  );
$$;


--
-- Name: leave_shared_base("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."leave_shared_base"("p_base_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); v_owner_id uuid; v_share_role public.base_share_role;
 t public.base_share_tasks%rowtype; email text;
BEGIN
 IF uid IS NULL THEN RETURN false; END IF;
 SELECT b.owner_id INTO v_owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR v_owner_id=uid THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,uid);
 PERFORM 1 FROM public.question_bases b WHERE b.id=p_base_id AND b.owner_id=v_owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT role INTO v_share_role FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO t FROM public.base_share_tasks WHERE base_id=p_base_id AND recipient_user_id=uid AND status='done'
 ORDER BY accepted_at DESC NULLS LAST,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR t.declined_at<=now()-interval '30 days' THEN
   IF FOUND THEN UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now() WHERE id=t.id; END IF;
   SELECT public._norm_email(p.email) INTO email FROM public.profiles p WHERE id=uid;
   INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,role,status,declined_at)
   VALUES(v_owner_id,p_base_id,uid,email,v_share_role,'declined',now());
   PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||v_owner_id||':'||uid||':base:'||p_base_id);
 ELSE
   UPDATE public.base_share_tasks SET status='declined',role=v_share_role,declined_at=coalesce(declined_at,now()) WHERE id=t.id;
   IF t.declined_at IS NULL THEN
     PERFORM public.mail_cooldown_reserve('base:share_after_reject','pair:'||v_owner_id||':'||uid||':base:'||p_base_id);
   END IF;
 END IF;
 DELETE FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=uid;
 RETURN true;
END; $$;


--
-- Name: list_base_share_tasks_outgoing("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_base_share_tasks_outgoing"("p_base_id" "uuid") RETURNS TABLE("task_id" "uuid", "recipient_user_id" "uuid", "recipient_email" "text", "recipient_username" "text", "role" "public"."base_share_role", "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_owner uuid;
begin
  perform public.base_share_tasks_cleanup();

  select qb.owner_id
    into v_owner
  from public.question_bases qb
  where qb.id = p_base_id;

  if auth.uid() is null or v_owner is null or v_owner <> auth.uid() then
    return;
  end if;

  return query
  select
    t.id as task_id,
    t.recipient_user_id,
    t.recipient_email,
    pr.username as recipient_username,
    t.role,
    t.status,
    t.created_at
  from public.base_share_tasks t
  left join public.profiles pr on pr.id = t.recipient_user_id
  where t.base_id = p_base_id
    and t.owner_id = auth.uid()
    and (t.status in ('pending','opened') OR (t.status='declined' AND t.declined_at>now()-interval '5 days'))
  order by t.created_at desc;
end;
$$;


--
-- Name: list_base_shares("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_base_shares"("p_base_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "role" "public"."base_share_role")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select s.user_id, p.email, s.role
  from public.question_base_shares s
  join public.profiles p on p.id = s.user_id
  where s.base_id = p_base_id
    and public.is_base_owner(p_base_id);
$$;


--
-- Name: list_messages("text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_messages"("p_filter" "text" DEFAULT 'inbox'::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "source" "text", "direction" "text", "from_email" "text", "to_email" "text", "subject" "text", "body" "text", "body_html" "text", "body_preview" "text", "report_id" "uuid", "ticket_number" "text", "report_status" "text", "queue_id" "uuid", "is_read" boolean, "is_marketing" boolean, "created_at" timestamp with time zone, "deleted_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Inbox: przychodzące, nie w koszu
  IF p_filter = 'inbox' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'inbound' AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Sent: wychodzące (w tym marketingowe), nie w koszu
  ELSIF p_filter = 'sent' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'outbound' AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Marketing: wszystkie oznaczone jako marketing (przychodzące i wychodzące)
  ELSIF p_filter = 'marketing' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.is_marketing = true AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Trash: usunięte
  ELSIF p_filter = 'trash' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NOT NULL
      ORDER BY m.deleted_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Reports: zgłoszenia z formularza
  ELSIF p_filter = 'reports' THEN
    RETURN QUERY
      SELECT
        r.id, 'form'::text AS source, 'inbound'::text AS direction,
        r.email AS from_email, NULL::text AS to_email, r.subject,
        NULL::text AS body, NULL::text AS body_html,
        left(r.message, 120) AS body_preview,
        r.id AS report_id, r.ticket_number, r.status AS report_status,
        NULL::uuid AS queue_id, false AS is_read, false AS is_marketing, r.created_at, NULL::timestamp AS deleted_at
      FROM public.contact_reports r
      ORDER BY r.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- All: wszystko (dla wątków)
  ELSE
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;


--
-- Name: list_my_device_shares(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_my_device_shares"() RETURNS TABLE("share_id" "uuid", "device_type" "text", "recipient_id" "uuid", "recipient_username" "text", "recipient_email" "text", "game_id" "uuid", "game_name" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT sd.id, sd.device_type, sd.recipient_id, p.username, p.email, sd.game_id, sd.game_name, sd.expires_at
  FROM public.shared_devices sd
  JOIN public.profiles p ON p.id = sd.recipient_id
  WHERE sd.owner_id = auth.uid();
END;
$$;


--
-- Name: list_reports("text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_reports"("p_status" "text" DEFAULT 'all'::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "ticket_number" "text", "status" "text", "subject" "text", "lang" "text", "created_at" timestamp with time zone, "message_count" bigint, "last_message_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
    SELECT
      r.id,
      r.ticket_number,
      r.status,
      r.subject,
      r.lang,
      r.created_at,
      COUNT(m.id)        AS message_count,
      MAX(m.created_at)  AS last_message_at
    FROM public.reports r
    LEFT JOIN public.messages m ON m.report_id = r.id AND m.deleted_at IS NULL
    WHERE p_status = 'all' OR r.status = p_status
    GROUP BY r.id
    ORDER BY COALESCE(MAX(m.created_at), r.created_at) DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


--
-- Name: list_shared_bases(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_shared_bases"() RETURNS TABLE("id" "uuid", "name" "text", "owner_id" "uuid", "owner_email" "text", "owner_username" "text", "shared_role" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    b.id,
    b.name,
    b.owner_id,
    op.email as owner_email,
    op.username as owner_username,
    s.role as shared_role,
    b.created_at,
    b.updated_at
  from public.question_base_shares s
  join public.question_bases b
    on b.id = s.base_id
  left join public.profiles op
    on op.id = b.owner_id
  where s.user_id = auth.uid()
  order by b.updated_at desc nulls last, b.created_at desc;
$$;


--
-- Name: list_shared_bases_ext(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_shared_bases_ext"() RETURNS TABLE("id" "uuid", "name" "text", "owner_id" "uuid", "owner_username" "text", "owner_email" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "shared_role" "public"."base_share_role", "proposed" boolean, "task_id" "uuid", "task_status" "text", "proposed_role" "public"."base_share_role")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  perform public.base_share_tasks_cleanup();

  return query
  select
    b.id,
    b.name,
    b.owner_id,
    p.username as owner_username,
    p.email as owner_email,
    b.created_at,
    b.updated_at,
    s.role as shared_role,

    false as proposed,
    null::uuid as task_id,
    null::text as task_status,
    null::public.base_share_role as proposed_role
  from public.question_base_shares s
  join public.question_bases b on b.id = s.base_id
  join public.profiles p on p.id = b.owner_id
  where s.user_id = auth.uid();

  return query
  select
    b.id,
    b.name,
    b.owner_id,
    p.username as owner_username,
    p.email as owner_email,
    b.created_at,
    b.updated_at,
    null::public.base_share_role as shared_role,

    true as proposed,
    t.id as task_id,
    t.status as task_status,
    t.role as proposed_role
  from public.base_share_tasks t
  join public.question_bases b on b.id = t.base_id
  join public.profiles p on p.id = t.owner_id
  where t.recipient_user_id = auth.uid()
    and t.status in ('pending','opened');
end;
$$;


--
-- Name: list_shared_devices_for_me(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_shared_devices_for_me"() RETURNS TABLE("share_id" "uuid", "device_type" "text", "owner_id" "uuid", "owner_username" "text", "owner_email" "text", "game_id" "uuid", "game_name" "text", "expires_at" timestamp with time zone, "share_key" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT sh.id,sh.device_type,sh.owner_id,p.username,u.email,
    sh.game_id,g.name,s.expires_at,sh.token::text
  FROM public.control_device_shares sh
  JOIN public.control_runtime_sessions s ON s.id=sh.session_id
  JOIN public.games g ON g.id=sh.game_id
  LEFT JOIN public.profiles p ON p.id=sh.owner_id
  LEFT JOIN auth.users u ON u.id=sh.owner_id
  WHERE sh.recipient_id=auth.uid() AND sh.revoked_at IS NULL
    AND s.ended_at IS NULL AND s.expires_at>now()
  ORDER BY sh.created_at DESC
$$;


--
-- Name: mail_anon_resign("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_anon_resign"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE mailbox text; root_token uuid; item record; closed integer:=0; tasks integer; devices integer;
BEGIN
 SELECT public._norm_email(email) INTO mailbox FROM public.email_unsub_tokens WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 IF public._poll_registered_uid(mailbox) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 SELECT token INTO root_token FROM public.email_unsub_tokens WHERE token=p_token AND public._norm_email(email)=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=coalesce(suppressed_at,now()) WHERE token=root_token;
 FOR item IN SELECT token FROM public.poll_subscriptions WHERE public._norm_email(subscriber_email)=mailbox
   AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND status IN('pending','active') ORDER BY owner_id,id LOOP
  IF public._subscriber_close(item.token,true) THEN closed:=closed+1; END IF;
 END LOOP;
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=coalesce(cancelled_at,now())
  WHERE recipient_user_id IS NULL AND public._norm_email(recipient_email)=mailbox AND status IN('pending','opened');
 GET DIAGNOSTICS tasks=ROW_COUNT;
 UPDATE public.control_device_shares SET revoked_at=coalesce(revoked_at,now())
  WHERE recipient_id IS NULL AND public._norm_email(recipient_email)=mailbox AND revoked_at IS NULL;
 GET DIAGNOSTICS devices=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'subscriptions_closed',closed,'tasks_closed',tasks,'devices_revoked',devices);
END $$;


--
-- Name: mail_center_action("text", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_action"("p_secret" "text", "p_kind" "text", "p_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE mailbox text; scope jsonb; tok uuid; result jsonb; poll_result text;
BEGIN
 IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' OR p_id IS NULL
  OR p_kind IS NULL OR p_kind NOT IN('subscription','poll') OR p_action IS NULL
  OR (p_kind='subscription' AND p_action NOT IN('accept','decline'))
  OR (p_kind='poll' AND p_action<>'decline') THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 SELECT l.email INTO mailbox FROM public.mail_center_sessions s JOIN public.mail_center_links l ON l.id=s.link_id
 WHERE s.secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') AND s.revoked_at IS NULL AND l.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 scope:=public._mail_center_scope(p_secret);
 IF scope->>'ok' IS DISTINCT FROM 'true' THEN RETURN scope; END IF;
 IF scope->>'email' IS DISTINCT FROM mailbox THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF scope->>'notifications_enabled' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
 IF p_kind='subscription' THEN
  SELECT s.token INTO tok FROM public.poll_subscriptions s WHERE s.id=p_id
   AND public._norm_email(s.subscriber_email)=mailbox AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL
   AND s.cancelled_at IS NULL AND s.declined_at IS NULL AND s.status IN('pending','active');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','source_unavailable'); END IF;
  IF p_action='accept' THEN RETURN public.poll_sub_accept_email(tok,mailbox); END IF;
  IF public._subscriber_close(tok,true) THEN RETURN jsonb_build_object('ok',true); END IF;
 ELSE
  SELECT t.token INTO tok FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id WHERE t.id=p_id
   AND t.recipient_user_id IS NULL AND public._norm_email(t.recipient_email)=mailbox AND t.status IN('pending','opened')
   AND t.cancelled_at IS NULL AND t.declined_at IS NULL AND t.done_at IS NULL AND public._poll_task_source_active(t)
   AND g.status::text='poll_open' AND g.owner_id=t.owner_id AND g.type::text=t.poll_type AND g.share_key_poll=t.share_key_poll;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','source_unavailable'); END IF;
  poll_result:=public.poll_task_decline(tok);
  IF poll_result='ok' THEN RETURN jsonb_build_object('ok',true); END IF;
 END IF;
 RETURN jsonb_build_object('ok',false,'error','source_unavailable');
END $_$;


--
-- Name: mail_center_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_cleanup"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE candidate record; link public.mail_center_links; dropped_sessions integer:=0; dropped_links integer:=0; dropped_events integer:=0; affected integer;
BEGIN
 FOR candidate IN SELECT id FROM public.mail_center_links l
  WHERE revoked_at IS NOT NULL OR expires_at<=clock_timestamp()
    OR EXISTS(SELECT 1 FROM public.mail_center_sessions s WHERE s.link_id=l.id
      AND (s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.last_seen_at<=clock_timestamp()-interval '1 hour'))
  ORDER BY id LIMIT 500 LOOP
  BEGIN
   SELECT * INTO link FROM public.mail_center_links WHERE id=candidate.id FOR UPDATE NOWAIT;
   IF NOT FOUND THEN CONTINUE; END IF;
   -- Preflight children without waiting; concurrent parent-first access and
   -- legacy child-first queue operations cannot create a lock cycle.
   PERFORM 1 FROM public.mail_center_sessions WHERE link_id=link.id ORDER BY secret_hash FOR UPDATE NOWAIT;
   PERFORM 1 FROM public.mail_queue WHERE mail_center_link_id=link.id ORDER BY id FOR UPDATE NOWAIT;
   DELETE FROM public.mail_center_sessions WHERE link_id=link.id
    AND (link.revoked_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at<=clock_timestamp() OR last_seen_at<=clock_timestamp()-interval '1 hour');
   GET DIAGNOSTICS affected=ROW_COUNT; dropped_sessions:=dropped_sessions+affected;
   IF link.revoked_at IS NOT NULL OR (link.expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.mail_center_sessions WHERE link_id=link.id)) THEN
    DELETE FROM public.mail_center_links WHERE id=link.id;
    dropped_links:=dropped_links+1;
   END IF;
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
 END LOOP;
 DELETE FROM public.mail_center_request_events WHERE created_at<=clock_timestamp()-interval '48 hours';
 GET DIAGNOSTICS dropped_events=ROW_COUNT;
 RETURN jsonb_build_object('sessions_removed',dropped_sessions,'links_removed',dropped_links,'events_removed',dropped_events);
END $$;


--
-- Name: mail_center_exchange_link("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_exchange_link"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE link public.mail_center_links; hashed text; secret text; deadline timestamptz;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 hashed:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 SELECT * INTO link FROM public.mail_center_links WHERE token_hash=hashed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_center_identity_lock(link.email);
 SELECT * INTO link FROM public.mail_center_links WHERE token_hash=hashed FOR UPDATE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL OR link.expires_at<=clock_timestamp()
   OR (link.purpose='verification' AND link.consumed_at IS NOT NULL) THEN
  RETURN jsonb_build_object('ok',false,'error','expired_token');
 END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 IF link.purpose='verification' THEN UPDATE public.mail_center_links SET consumed_at=clock_timestamp() WHERE id=link.id; END IF;
 secret:=encode(public.gen_random_bytes(32),'hex');
 deadline:=least(clock_timestamp()+interval '24 hours',link.expires_at);
 -- Verification link expiry only limits exchange, not the verified session.
 IF link.purpose='verification' THEN deadline:=clock_timestamp()+interval '24 hours'; END IF;
 INSERT INTO public.mail_center_sessions(secret_hash,link_id,expires_at)
 VALUES(encode(sha256(convert_to(secret,'UTF8')),'hex'),link.id,deadline);
 RETURN jsonb_build_object('ok',true,'session_secret',secret,'expires_at',deadline);
END $_$;


--
-- Name: mail_center_issue_link("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_issue_link"("p_email" "text", "p_purpose" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE mailbox text:=public._norm_email(p_email); secret text; root_id uuid; link_id uuid; deadline timestamptz;
BEGIN
 IF mailbox IS NULL OR length(mailbox)>320 OR mailbox !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_purpose IS NULL OR p_purpose NOT IN('footer','verification') THEN
  RETURN jsonb_build_object('ok',false,'error','invalid_request');
 END IF;
 PERFORM public._mail_center_identity_lock(mailbox);
 IF p_purpose='verification' AND public._poll_registered_uid(mailbox) IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'error','requires_login');
 END IF;
 root_id:=public._ensure_unsub_token(mailbox);
 secret:=encode(public.gen_random_bytes(32),'hex');
 deadline:=clock_timestamp()+CASE WHEN p_purpose='footer' THEN interval '30 days' ELSE interval '15 minutes' END;
 INSERT INTO public.mail_center_links(token_hash,email,root_token,purpose,expires_at)
 VALUES(encode(sha256(convert_to(secret,'UTF8')),'hex'),mailbox,root_id,p_purpose,deadline) RETURNING id INTO link_id;
 RETURN jsonb_build_object('ok',true,'token',secret,'expires_at',deadline,'link_id',link_id);
END $_$;


--
-- Name: mail_center_list("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_list"("p_secret" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE scope jsonb; mailbox text; subs jsonb; tasks jsonb; devices jsonb;
BEGIN
 scope:=public._mail_center_scope(p_secret);
 IF scope->>'ok' IS DISTINCT FROM 'true' THEN RETURN scope; END IF;
 mailbox:=scope->>'email';
 IF scope->>'notifications_enabled' IS DISTINCT FROM 'true' THEN
  RETURN scope||jsonb_build_object('subscriptions','[]'::jsonb,'items','[]'::jsonb);
 END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) INTO subs FROM (
  SELECT s.id,s.created_at,jsonb_build_object('id',s.id,'kind','subscription','status',s.status,
   'owner_label',p.username,'created_at',s.created_at,'link','/go/?s='||s.token) item
  FROM public.poll_subscriptions s JOIN auth.users u ON u.id=s.owner_id
  LEFT JOIN public.profiles p ON p.id=s.owner_id
  WHERE public._norm_email(s.subscriber_email)=mailbox AND s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL
   AND s.status IN('pending','active') AND s.cancelled_at IS NULL AND s.declined_at IS NULL
   AND public._poll_identity_regular(u.id,to_jsonb(u))
 ) rows;
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) INTO tasks FROM (
  SELECT t.id,t.created_at,jsonb_build_object('id',t.id,'kind','poll','status',t.status,
   'name',g.name,'owner_label',p.username,'created_at',t.created_at,'link','/go/?t='||t.token) item
  FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id JOIN auth.users u ON u.id=t.owner_id
  LEFT JOIN public.profiles p ON p.id=t.owner_id
  WHERE public._norm_email(t.recipient_email)=mailbox AND t.recipient_user_id IS NULL
   AND t.status IN('pending','opened') AND t.cancelled_at IS NULL AND t.declined_at IS NULL AND t.done_at IS NULL
   AND g.status::text='poll_open' AND g.owner_id=t.owner_id AND g.type::text=t.poll_type AND g.share_key_poll=t.share_key_poll
   AND public._poll_task_source_active(t) AND public._poll_identity_regular(u.id,to_jsonb(u))
 ) rows;
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) INTO devices FROM (
  SELECT d.id,d.created_at,jsonb_build_object('id',d.id,'kind','device','status','available',
   'name',g.name,'device_type',d.device_type,'owner_label',p.username,'created_at',d.created_at,'link','/go/?d='||d.device_type||'&id='||d.game_id||'&key='||d.token) item
  FROM public.control_device_shares d JOIN public.control_runtime_sessions r ON r.id=d.session_id
  JOIN public.games g ON g.id=d.game_id JOIN auth.users u ON u.id=d.owner_id
  LEFT JOIN public.profiles p ON p.id=d.owner_id
  WHERE public._norm_email(d.recipient_email)=mailbox AND d.recipient_id IS NULL AND d.revoked_at IS NULL
   AND r.ended_at IS NULL AND r.expires_at>clock_timestamp() AND r.game_id=d.game_id AND r.owner_id=d.owner_id AND g.owner_id=d.owner_id
   AND public._poll_identity_regular(u.id,to_jsonb(u))
 ) rows;
 RETURN scope||jsonb_build_object('subscriptions',subs,'items',tasks||devices);
END $$;


--
-- Name: mail_center_peek_link("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_peek_link"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE link public.mail_center_links;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 SELECT * INTO link FROM public.mail_center_links WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_center_identity_lock(link.email);
 SELECT * INTO link FROM public.mail_center_links WHERE id=link.id FOR SHARE;
 IF NOT FOUND OR link.revoked_at IS NOT NULL OR link.expires_at<=clock_timestamp() OR (link.purpose='verification' AND link.consumed_at IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'error','expired_token'); END IF;
 IF public._poll_registered_uid(link.email) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 RETURN jsonb_build_object('ok',true,'purpose',link.purpose);
END $_$;


--
-- Name: mail_center_request_link("text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_request_link"("p_email" "text", "p_ip_hash" "text", "p_subject" "text", "p_html" "text", "p_lang" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE mailbox text:=public._norm_email(p_email); address_hash text; issued jsonb; queue_id uuid; seconds integer; deadline timestamptz;
BEGIN
 IF mailbox IS NULL OR length(mailbox)>320 OR mailbox !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$'
  OR p_ip_hash IS NULL OR p_ip_hash !~ '^[a-f0-9]{64}$' OR p_html IS NULL OR length(p_html)>100000
  OR p_html NOT LIKE '%MAIL_CENTER_ACCESS_TOKEN%' OR p_subject IS NULL OR length(p_subject)>500
  OR p_lang IS NULL OR p_lang NOT IN('pl','en','uk') THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 PERFORM public._mail_center_identity_lock(mailbox);
 PERFORM pg_advisory_xact_lock(hashtextextended('mail:center-ip:'||p_ip_hash,360));
 address_hash:=encode(sha256(convert_to(mailbox,'UTF8')),'hex');
 IF (SELECT count(*) FROM public.mail_center_request_events WHERE ip_hash=p_ip_hash AND created_at>clock_timestamp()-interval '15 minutes')>=10 THEN
  RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',900);
 END IF;
 IF public._poll_registered_uid(mailbox) IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','requires_login'); END IF;
 seconds:=greatest(60,coalesce((SELECT cooldown_seconds FROM public.mail_cooldown_policies WHERE action_key='baseline:recipient'),60));
 SELECT max(created_at)+make_interval(secs=>seconds) INTO deadline FROM public.mail_center_request_events WHERE email_hash=address_hash;
 IF deadline>clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',ceil(extract(epoch FROM deadline-clock_timestamp()))::integer); END IF;
 IF (SELECT count(*) FROM public.mail_center_request_events WHERE email_hash=address_hash AND created_at>clock_timestamp()-interval '24 hours')>=10 THEN
  RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_seconds',86400);
 END IF;
 issued:=public.mail_center_issue_link(mailbox,'verification');
 IF issued->>'ok' IS DISTINCT FROM 'true' THEN RETURN issued; END IF;
 INSERT INTO public.mail_queue(created_by,to_email,subject,html,text,cooldown_action_key,cooldown_target_key,mail_center_link_id,meta)
 VALUES(NULL,mailbox,p_subject,replace(p_html,'MAIL_CENTER_ACCESS_TOKEN',issued->>'token'),
  p_subject||' https://www.familiada.online/go/?m='||(issued->>'token'),
  'mail:center_verify','email:'||md5(mailbox),(issued->>'link_id')::uuid,jsonb_build_object('lang',p_lang)) RETURNING id INTO queue_id;
 IF queue_id IS NULL THEN RAISE EXCEPTION 'verification_queue_insert_failed'; END IF;
 INSERT INTO public.mail_center_request_events(email_hash,ip_hash) VALUES(address_hash,p_ip_hash);
 -- The caller sees no capability, HTML, or source id. Only actual delivery reveals it.
 RETURN jsonb_build_object('ok',true,'cooldown_seconds',seconds);
END $_$;


--
-- Name: mail_center_set_notifications("text", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_center_set_notifications"("p_secret" "text", "p_enabled" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $_$
DECLARE mailbox text; scope jsonb; result jsonb; root uuid;
BEGIN
 IF p_enabled IS NULL OR p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_request'); END IF;
 -- Resolve parents without row locks, acquire source roots before link/session locks.
 SELECT l.email INTO mailbox FROM public.mail_center_sessions s
 JOIN public.mail_center_links l ON l.id=s.link_id
 WHERE s.secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')
   AND s.revoked_at IS NULL AND l.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 scope:=public._mail_center_scope(p_secret);
 IF scope->>'ok' IS DISTINCT FROM 'true' THEN RETURN scope; END IF;
 IF scope->>'email' IS DISTINCT FROM mailbox THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 SELECT token INTO root FROM public.email_unsub_tokens WHERE email=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF p_enabled THEN
  UPDATE public.email_unsub_tokens SET suppressed_at=NULL WHERE token=root;
  RETURN jsonb_build_object('ok',true,'notifications_enabled',true);
 END IF;
 result:=public.mail_anon_resign(root);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RETURN result; END IF;
 RETURN result||jsonb_build_object('notifications_enabled',false);
END $_$;


--
-- Name: mail_contact_reply_source("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_contact_reply_source"("p_report" "uuid", "p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT m.id FROM public.messages m WHERE m.report_id=p_report
  AND public._mail_contact_source_live(m.id,p_email,'admin:compose')
  ORDER BY m.created_at DESC,m.id LIMIT 1;
$$;


--
-- Name: mail_cooldown_check("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_cooldown_check"("p_action_key" "text", "p_target_key" "text") RETURNS TABLE("ok" boolean, "next_allowed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT (mc.next_allowed_at IS NULL OR mc.next_allowed_at <= now()), mc.next_allowed_at
  FROM (SELECT 1) AS _dummy
  LEFT JOIN public.mail_cooldowns mc
    ON mc.action_key = p_action_key AND mc.target_key = p_target_key;
$$;


--
-- Name: mail_cooldown_email_check("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_cooldown_email_check"("p_action_key" "text", "p_email" "text") RETURNS TABLE("ok" boolean, "next_allowed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT * FROM public.mail_cooldown_check(p_action_key, 'email:' || md5(lower(trim(p_email))));
$$;


--
-- Name: mail_cooldown_email_release("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_cooldown_email_release"("p_email" "text", "p_action_key" "text", "p_max_age_seconds" integer DEFAULT 60) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_target text;
BEGIN
  v_target := 'email:' || md5(lower(trim(p_email)));

  UPDATE public.mail_cooldowns
     SET next_allowed_at = now(),
         updated_at = now()
   WHERE target_key = v_target
     AND action_key = p_action_key
     AND updated_at >= (now() - make_interval(secs => p_max_age_seconds));

  RETURN true;
END;
$$;


--
-- Name: mail_cooldown_email_reserve("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_cooldown_email_reserve"("p_action_key" "text", "p_email" "text") RETURNS TABLE("ok" boolean, "next_allowed_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT * FROM public.mail_cooldown_reserve(p_action_key, 'email:' || md5(lower(trim(p_email))));
$$;


--
-- Name: mail_cooldown_reserve("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_cooldown_reserve"("p_action_key" "text", "p_target_key" "text") RETURNS TABLE("ok" boolean, "next_allowed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_seconds integer;
  v_cur_next timestamptz;
  v_new_next timestamptz;
BEGIN
  SELECT cooldown_seconds INTO v_seconds
  FROM public.mail_cooldown_policies
  WHERE action_key = p_action_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mail_cooldown_reserve: unknown action_key %', p_action_key;
  END IF;

  SELECT mc.next_allowed_at INTO v_cur_next
  FROM public.mail_cooldowns mc
  WHERE mc.action_key = p_action_key AND mc.target_key = p_target_key
  FOR UPDATE;

  IF NOT FOUND THEN
    v_new_next := now() + make_interval(secs => v_seconds);
    INSERT INTO public.mail_cooldowns(action_key, target_key, next_allowed_at, updated_at)
    VALUES (p_action_key, p_target_key, v_new_next, now());
    RETURN QUERY SELECT true, v_new_next;
    RETURN;
  END IF;

  IF v_cur_next <= now() THEN
    v_new_next := now() + make_interval(secs => v_seconds);
    UPDATE public.mail_cooldowns
      SET next_allowed_at = v_new_next, updated_at = now()
      WHERE action_key = p_action_key AND target_key = p_target_key;
    RETURN QUERY SELECT true, v_new_next;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, v_cur_next;
END;
$$;


--
-- Name: mail_cron_set("text", boolean, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_cron_set"("p_schedule" "text", "p_active" boolean DEFAULT true, "p_limit" integer DEFAULT 25, "p_job_name" "text" DEFAULT 'familiada_mail_worker'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_has_cron boolean := false;
  v_schedule text := trim(coalesce(p_schedule, ''));
  v_job_name text := trim(coalesce(p_job_name, ''));
  v_job_id bigint;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 200));
  v_command text;
begin
  if v_schedule = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_schedule');
  end if;

  if v_job_name = '' then
    v_job_name := 'familiada_mail_worker';
  end if;

  select exists(select 1 from pg_namespace where nspname = 'cron') into v_has_cron;
  if not v_has_cron then
    return jsonb_build_object('ok', false, 'error', 'cron_not_available');
  end if;

  v_command := format('select public.invoke_mail_worker(%s);', v_limit);

  begin
    execute format(
      'select jobid from cron.job where jobname = %L or command ilike %L order by active desc, jobid desc limit 1',
      v_job_name,
      '%invoke_mail_worker%'
    )
    into v_job_id;
  exception when undefined_column then
    execute format(
      'select jobid from cron.job where command ilike %L order by active desc, jobid desc limit 1',
      '%invoke_mail_worker%'
    )
    into v_job_id;
  end;

  if v_job_id is null then
    begin
      execute 'select cron.schedule($1,$2,$3)' into v_job_id using v_job_name, v_schedule, v_command;
    exception when undefined_function then
      execute 'select cron.schedule($1,$2)' into v_job_id using v_schedule, v_command;
      begin
        execute format('update cron.job set jobname = %L where jobid = %s', v_job_name, v_job_id);
      exception when undefined_column then
        null;
      end;
    end;
  else
    begin
      execute format(
        'update cron.job set schedule = %L, active = %s, command = %L, jobname = %L where jobid = %s',
        v_schedule,
        case when p_active then 'true' else 'false' end,
        v_command,
        v_job_name,
        v_job_id
      );
    exception when undefined_column then
      execute format(
        'update cron.job set schedule = %L, active = %s, command = %L where jobid = %s',
        v_schedule,
        case when p_active then 'true' else 'false' end,
        v_command,
        v_job_id
      );
    end;
  end if;

  if not p_active then
    execute format('update cron.job set active = false where jobid = %s', v_job_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'cron', public.mail_cron_status()
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'error', coalesce(sqlerrm, 'mail_cron_set_failed')
  );
end;
$_$;


--
-- Name: mail_cron_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_cron_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_has_cron boolean := false;
  v_job_id bigint;
  v_job_name text;
  v_schedule text;
  v_active boolean;
  v_command text;
  v_limit integer := 25;
begin
  select exists(select 1 from pg_namespace where nspname = 'cron') into v_has_cron;
  if not v_has_cron then
    return jsonb_build_object(
      'supported', false,
      'configured', false,
      'error', 'cron_not_available'
    );
  end if;

  begin
    execute $sql$
      select jobid, coalesce(jobname, ''), schedule, active, command
        from cron.job
       where command ilike '%invoke_mail_worker%'
       order by active desc, jobid desc
       limit 1
    $sql$
    into v_job_id, v_job_name, v_schedule, v_active, v_command;
  exception when undefined_column then
    execute $sql$
      select jobid, ''::text, schedule, active, command
        from cron.job
       where command ilike '%invoke_mail_worker%'
       order by active desc, jobid desc
       limit 1
    $sql$
    into v_job_id, v_job_name, v_schedule, v_active, v_command;
  end;

  if v_job_id is null then
    return jsonb_build_object(
      'supported', true,
      'configured', false
    );
  end if;

  begin
    v_limit := coalesce(
      nullif(substring(v_command from 'invoke_mail_worker\(([0-9]+)\)'), '')::integer,
      25
    );
  exception when others then
    v_limit := 25;
  end;

  return jsonb_build_object(
    'supported', true,
    'configured', true,
    'job_id', v_job_id,
    'job_name', nullif(v_job_name, ''),
    'schedule', v_schedule,
    'active', v_active,
    'limit', v_limit,
    'command', v_command
  );
end;
$_$;


--
-- Name: mail_notification_cancel_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_notification_cancel_pending"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
  -- Keep the consumed allocation ledger: deleting the pending queue entry
  -- never creates a new right to send. Active provider attempts retain their lease.
  DELETE FROM public.mail_queue WHERE notification_allocation_id=NEW.id AND status='pending';
 END IF;
 RETURN NEW;
END $$;


--
-- Name: mail_notification_parent_epoch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_notification_parent_epoch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE old_row jsonb:=to_jsonb(OLD); new_row jsonb:=to_jsonb(NEW);
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'games' THEN
  IF public._mail_notification_fields(old_row,ARRAY['owner_id','type','status','share_key_poll'])
   IS DISTINCT FROM public._mail_notification_fields(new_row,ARRAY['owner_id','type','status','share_key_poll']) THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.game_id=OLD.id);
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.control_device_shares s WHERE s.id=a.device_share_id AND s.game_id=OLD.id);
  END IF;
 WHEN 'question_bases' THEN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.id=a.base_task_id AND t.base_id=OLD.id);
  END IF;
 WHEN 'control_runtime_sessions' THEN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.ended_at IS NOT NULL
    OR NEW.expires_at<=clock_timestamp() OR NEW.last_activity_at<=clock_timestamp()-interval '1 hour' THEN
   UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.control_device_shares s WHERE s.id=a.device_share_id AND s.session_id=OLD.id);
  END IF;
 WHEN 'profiles' THEN
  IF NEW.is_guest IS DISTINCT FROM OLD.is_guest THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL
    AND (owner_id=NEW.id OR recipient_id=NEW.id OR identity_id=NEW.id);
  END IF;
 WHEN 'user_flags' THEN
  IF NEW.email_notifications IS FALSE THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL
    AND (recipient_id=NEW.user_id OR identity_id=NEW.user_id OR to_email=(SELECT public._norm_email(u.email) FROM auth.users u WHERE u.id=NEW.user_id));
  END IF;
 WHEN 'email_unsub_tokens' THEN
  IF TG_OP='UPDATE' AND public._norm_email(NEW.email) IS DISTINCT FROM public._norm_email(OLD.email) THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp()
    WHERE revoked_at IS NULL AND to_email=public._norm_email(OLD.email);
  END IF;
  IF NEW.suppressed_at IS NOT NULL THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp()
    WHERE revoked_at IS NULL AND to_email=public._norm_email(NEW.email);
  END IF;
 WHEN 'users' THEN
  IF public._norm_email(NEW.email) IS DISTINCT FROM public._norm_email(OLD.email)
    OR public._poll_identity_regular(NEW.id,to_jsonb(NEW)) IS DISTINCT FROM public._poll_identity_regular(OLD.id,to_jsonb(OLD)) THEN
   UPDATE public.mail_notification_allocations SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL AND (
    recipient_id=OLD.id OR identity_id=OLD.id OR to_email IN(public._norm_email(OLD.email),public._norm_email(NEW.email))
    OR (owner_id=OLD.id AND NOT public._poll_identity_regular(NEW.id,to_jsonb(NEW))));
  END IF;
 END CASE;
 RETURN NEW;
END $$;


--
-- Name: mail_notification_source_epoch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_notification_source_epoch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE old_row jsonb:=to_jsonb(OLD); new_row jsonb:=to_jsonb(NEW); fields text[];
 kind text; revoke_own boolean; revoke_children boolean:=false; old_status text; new_status text;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'friendships' THEN
  kind:='friend'; fields:=ARRAY['requester_id','addressee_id','decision_user_id','token','source_subscription_id','cancelled_at','declined_at'];
  revoke_children:=NEW.status<>'active' OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL
   OR public._mail_notification_fields(old_row,fields) IS DISTINCT FROM public._mail_notification_fields(new_row,fields);
 WHEN 'poll_subscriptions' THEN
  kind:='subscription';fields:=ARRAY['owner_id','subscriber_email','subscriber_user_id','registered_user_id','token','cancelled_at','declined_at'];
  revoke_children:=NEW.status NOT IN('pending','active') OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL
   OR public._mail_notification_fields(old_row,fields) IS DISTINCT FROM public._mail_notification_fields(new_row,fields);
 WHEN 'poll_tasks' THEN
  kind:='poll';fields:=ARRAY['owner_id','recipient_user_id','recipient_email','token','game_id','share_key_poll','poll_type','source_kind','source_friendship_id','source_subscription_id','cancelled_at','declined_at'];
 WHEN 'base_share_tasks' THEN
  kind:='base';fields:=ARRAY['owner_id','recipient_user_id','token','base_id','role','source_kind','source_friendship_id','cancelled_at','declined_at'];
 WHEN 'control_device_shares' THEN
  kind:='device';fields:=ARRAY['owner_id','recipient_id','recipient_email','token','game_id','session_id','device_type','revoked_at'];
 END CASE;
 old_status:=old_row->>'status';new_status:=new_row->>'status';
 -- Opening an invitation does not consume or invalidate a notification.
 IF kind IN('poll','base') THEN
  IF old_status IN('pending','opened') THEN old_status:='live'; END IF;
  IF new_status IN('pending','opened') THEN new_status:='live'; END IF;
 END IF;
 revoke_own:=old_status IS DISTINCT FROM new_status
  OR public._mail_notification_fields(old_row,fields) IS DISTINCT FROM public._mail_notification_fields(new_row,fields);
 IF revoke_own THEN
  UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp()
   WHERE a.source_kind=kind AND a.source_token=(old_row->>'token')::uuid AND a.revoked_at IS NULL;
 END IF;
 IF revoke_children AND kind='friend' THEN
  UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL AND (
   EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.source_friendship_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.base_share_tasks t WHERE t.id=a.base_task_id AND t.source_friendship_id=OLD.id));
 ELSIF revoke_children AND kind='subscription' THEN
  UPDATE public.mail_notification_allocations a SET revoked_at=clock_timestamp() WHERE a.revoked_at IS NULL AND (
   EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.id=a.poll_task_id AND t.source_subscription_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.friendships f WHERE f.id=a.friendship_id AND f.source_subscription_id=OLD.id));
 END IF;
 RETURN NEW;
END $$;


--
-- Name: mail_queue_cooldown_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_cooldown_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_enforce boolean;
  v_ok boolean;
  v_until timestamptz;
  v_baseline_target text;
  v_sender_email text;
  v_both_e2e boolean;
BEGIN
  SELECT enforce INTO v_enforce
  FROM public.mail_cooldown_policies
  WHERE action_key = NEW.cooldown_action_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mail_queue: unknown cooldown_action_key %', NEW.cooldown_action_key;
  END IF;

  IF v_enforce THEN
    IF NEW.created_by IS NOT NULL THEN
      SELECT lower(email) INTO v_sender_email FROM auth.users WHERE id = NEW.created_by;
    END IF;

    v_both_e2e := v_sender_email ~ '^test([1-9]|1[0-3])@familiada[.]online$'
      AND lower(trim(NEW.to_email)) ~ '^test([1-9]|1[0-3])@familiada[.]online$';

    IF NOT v_both_e2e THEN
      -- Nieprzekraczalna podłoga, niezależna od action_key — to jest to, co
      -- faktycznie zamyka dziurę (wymyślenie nowego, ale wciąż rozpoznanego
      -- action_key nie pomaga obejść TEJ rezerwacji). target_key per
      -- (nadawca, odbiorca) — 'svc:'+action_key jako fallback dla wierszy bez
      -- created_by (service-role), żeby różne serwisowe funkcje nie wpadały
      -- w jeden, wspólny koszyk.
      v_baseline_target := 'pair:' || coalesce(NEW.created_by::text, 'svc:' || NEW.cooldown_action_key)
        || ':' || md5(lower(trim(NEW.to_email)));

      SELECT ok, next_allowed_at INTO v_ok, v_until
      FROM public.mail_cooldown_reserve('baseline:recipient', v_baseline_target);

      IF NOT v_ok THEN
        RAISE EXCEPTION 'cooldown_active: baseline for % until %', NEW.to_email, v_until;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$_$;


--
-- Name: mail_queue_delivery_context("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_delivery_context"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE q public.mail_queue; initial public.mail_queue; link public.mail_center_links;
 root_id uuid; issued jsonb; current_uid uuid;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT * INTO initial FROM public.mail_queue WHERE id=p_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF initial.notification_source_kind IS NOT NULL THEN
    IF public._mail_notification_source_info(initial) IS NULL THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
    END IF;
    PERFORM public._mail_notification_source_lock(initial);
   END IF;
   PERFORM public._mail_center_identity_lock(public._norm_email(initial.to_email));
   current_uid:=public._poll_registered_uid(initial.to_email);
   PERFORM 1 FROM public.user_flags WHERE user_id=current_uid FOR SHARE NOWAIT;
   IF initial.cooldown_action_key='mail:center_verify' THEN
    SELECT * INTO link FROM public.mail_center_links WHERE id=initial.mail_center_link_id FOR SHARE NOWAIT;
   ELSE
    IF initial.contact_message_id IS NOT NULL THEN
     PERFORM 1 FROM public.reports WHERE id=(SELECT report_id FROM public.messages WHERE id=initial.contact_message_id) FOR SHARE NOWAIT;
     PERFORM 1 FROM public.messages WHERE id=initial.contact_message_id FOR SHARE NOWAIT;
    END IF;
    root_id:=public._ensure_unsub_token(initial.to_email);
    PERFORM 1 FROM public.email_unsub_tokens WHERE token=root_id FOR SHARE NOWAIT;
   END IF;
   PERFORM 1 FROM public.mail_notification_allocations WHERE id=initial.notification_allocation_id FOR SHARE NOWAIT;
   SELECT * INTO q FROM public.mail_queue WHERE id=p_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_missing'); END IF;
   IF public._mail_notification_fields(to_jsonb(q),ARRAY['notification_source_kind','notification_source_token','notification_friendship_id','notification_subscription_id','notification_poll_task_id','notification_base_task_id','notification_device_share_id','notification_snapshot','notification_allocation_id','created_by'])
     IS DISTINCT FROM public._mail_notification_fields(to_jsonb(initial),ARRAY['notification_source_kind','notification_source_token','notification_friendship_id','notification_subscription_id','notification_poll_task_id','notification_base_task_id','notification_device_share_id','notification_snapshot','notification_allocation_id','created_by'])
    OR public._norm_email(q.to_email) IS DISTINCT FROM public._norm_email(initial.to_email)
    OR q.cooldown_action_key IS DISTINCT FROM initial.cooldown_action_key
    OR q.mail_center_link_id IS DISTINCT FROM initial.mail_center_link_id
    OR q.contact_message_id IS DISTINCT FROM initial.contact_message_id
    OR q.contact_source_expected IS DISTINCT FROM initial.contact_source_expected THEN
     RAISE EXCEPTION 'delivery source changed' USING ERRCODE='55P03';
   END IF;
   IF q.status<>'sending' THEN RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_not_claimed'); END IF;
   IF q.cooldown_action_key ~ '^(friend|poll|base|device):' AND NOT public._mail_notification_queue_live(q) THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
   END IF;
   IF q.cooldown_action_key='mail:center_verify' THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_center_verification_live(q.mail_center_link_id,q.to_email) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_verification_closed');
    END IF;
    -- Global mail-off is intentionally bypassed only for this private proof.
    RETURN jsonb_build_object('ok',true,'allowed',true,'verification',true,'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
   END IF;
   IF q.contact_source_expected OR q.cooldown_action_key='contact:confirmation' OR q.contact_message_id IS NOT NULL THEN
    IF q.created_by IS NOT NULL OR NOT public._mail_contact_source_live(q.contact_message_id,q.to_email,q.cooldown_action_key) THEN
     RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_contact_closed');
    END IF;
   ELSIF NOT public._contact_mail_enabled(q.to_email) THEN
    RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_preference');
   END IF;
   issued:=public.mail_center_issue_link(q.to_email,'footer');
   IF issued->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'delivery footer unavailable'; END IF;
   -- The full capability is returned only to delivery; never write it to q.html.
   RETURN jsonb_build_object('ok',true,'allowed',true,'verification',false,'footer_token',issued->>'token',
     'to_email',q.to_email,'subject',q.subject,'html',q.html,'text',q.text);
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  WHEN raise_exception THEN
   IF SQLERRM<>'invalid_notification_source' THEN RAISE; END IF;
   RETURN jsonb_build_object('ok',true,'allowed',false,'reason','skipped_notification_source');
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: mail_queue_mark("uuid", boolean, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_mark"("p_id" "uuid", "p_ok" boolean, "p_provider" "text", "p_error" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_ok then
    -- sukcesy nie muszą zalegać w kolejce
    delete from public.mail_queue
    where id = p_id;
  else
    update public.mail_queue
    set status = 'failed',
        provider_used = p_provider,
        last_error = left(coalesce(p_error,''), 2000)
    where id = p_id;
  end if;
end;
$$;


--
-- Name: mail_queue_notification_preference_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_notification_preference_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
BEGIN
 IF NEW.cooldown_action_key='mail:center_verify' THEN
  IF NEW.created_by IS NOT NULL OR NEW.mail_center_link_id IS NULL
    OR NOT public._mail_center_verification_live(NEW.mail_center_link_id,NEW.to_email) THEN RAISE EXCEPTION 'invalid_verification_source'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.cooldown_action_key='contact:confirmation' OR NEW.contact_message_id IS NOT NULL THEN
  IF NEW.created_by IS NOT NULL OR NOT public._mail_contact_source_live(NEW.contact_message_id,NEW.to_email,NEW.cooldown_action_key) THEN RAISE EXCEPTION 'invalid_contact_source'; END IF;
  NEW.contact_source_expected:=true;
  RETURN NEW;
 END IF;
 NEW.contact_source_expected:=false;
 IF NOT public._contact_mail_enabled(NEW.to_email) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;


--
-- Name: FUNCTION "mail_queue_notification_preference_guard"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."mail_queue_notification_preference_guard"() IS 'Omija powiadomienia mailowe dla kont z email_notifications=false przed insercją do kolejki; adresy bez konta nie są blokowane.';


--
-- Name: mail_queue_notification_source_bind(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_notification_source_bind"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE info jsonb;allocation public.mail_notification_allocations;
BEGIN
 IF NEW.cooldown_action_key !~ '^(friend|poll|base|device|copy):' THEN
  IF NEW.created_by IS NOT NULL OR NEW.notification_source_kind IS NOT NULL OR NEW.notification_source_token IS NOT NULL OR NEW.notification_allocation_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.created_by IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM NEW.created_by)
  OR NEW.notification_source_token IS NULL OR NOT public._mail_notification_action_matches(NEW.notification_source_kind,NEW.cooldown_action_key) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 NEW.notification_friendship_id:=NULL;NEW.notification_subscription_id:=NULL;NEW.notification_poll_task_id:=NULL;
 NEW.notification_base_task_id:=NULL;NEW.notification_device_share_id:=NULL;NEW.notification_copy_offer_id:=NULL;
 CASE NEW.notification_source_kind
  WHEN 'friend' THEN SELECT id INTO NEW.notification_friendship_id FROM public.friendships WHERE token=NEW.notification_source_token;
  WHEN 'subscription' THEN SELECT id INTO NEW.notification_subscription_id FROM public.poll_subscriptions WHERE token=NEW.notification_source_token;
  WHEN 'poll' THEN SELECT id INTO NEW.notification_poll_task_id FROM public.poll_tasks WHERE token=NEW.notification_source_token;
  WHEN 'base' THEN SELECT id INTO NEW.notification_base_task_id FROM public.base_share_tasks WHERE token=NEW.notification_source_token;
  WHEN 'device' THEN SELECT id INTO NEW.notification_device_share_id FROM public.control_device_shares WHERE token=NEW.notification_source_token;
  WHEN 'copy' THEN SELECT id INTO NEW.notification_copy_offer_id FROM public.resource_copy_offers WHERE token=NEW.notification_source_token;
 END CASE;
 info:=public._mail_notification_source_info(NEW);
 IF info IS NULL OR (info->>'owner_id')::uuid IS DISTINCT FROM NEW.created_by OR info->>'email' IS DISTINCT FROM public._norm_email(NEW.to_email) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 PERFORM public._mail_notification_source_lock(NEW);
 info:=public._mail_notification_source_info(NEW);
 NEW.notification_snapshot:=jsonb_build_object('resource',info->'snapshot','recipient_id',info->'recipient_id','identity_id',public._poll_registered_uid(NEW.to_email));
 IF NEW.notification_source_kind='device' AND (NEW.meta#>>'{notification_reference,device_type}' IS DISTINCT FROM info#>>'{snapshot,device_type}'
  OR NEW.meta#>>'{notification_reference,game_id}' IS DISTINCT FROM info#>>'{snapshot,game_id}') THEN RAISE EXCEPTION 'invalid_notification_reference'; END IF;
 IF NOT public._mail_notification_source_live(NEW) THEN RAISE EXCEPTION 'invalid_notification_source'; END IF;
 SELECT * INTO allocation FROM public.mail_notification_allocations a WHERE a.owner_id=NEW.created_by AND a.to_email=public._norm_email(NEW.to_email)
  AND a.source_kind=NEW.notification_source_kind AND a.source_token=NEW.notification_source_token
  AND a.friendship_id IS NOT DISTINCT FROM NEW.notification_friendship_id AND a.subscription_id IS NOT DISTINCT FROM NEW.notification_subscription_id
  AND a.poll_task_id IS NOT DISTINCT FROM NEW.notification_poll_task_id AND a.base_task_id IS NOT DISTINCT FROM NEW.notification_base_task_id
  AND a.device_share_id IS NOT DISTINCT FROM NEW.notification_device_share_id AND a.copy_offer_id IS NOT DISTINCT FROM NEW.notification_copy_offer_id
  AND a.snapshot=NEW.notification_snapshot AND a.consumed_at IS NULL AND a.revoked_at IS NULL AND a.enqueue_before>clock_timestamp()
  ORDER BY a.created_at DESC,a.id LIMIT 1 FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_notification_attempt'; END IF;
 UPDATE public.mail_notification_allocations SET consumed_at=clock_timestamp(),consumed_queue_id=NEW.id WHERE id=allocation.id;
 NEW.notification_allocation_id:=allocation.id;RETURN NEW;
END $$;


--
-- Name: mail_queue_pick(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_pick"("p_limit" integer) RETURNS SETOF "public"."mail_queue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE q.status='pending' AND q.not_before<=now()
   AND public._mail_notification_queue_live(q)
  ORDER BY q.created_at,q.id LIMIT greatest(1,least(coalesce(p_limit,25),200)) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='sending',attempts=q.attempts+1,picked_at=now(),last_attempt_at=now()
 FROM candidates c WHERE q.id=c.id RETURNING q.*;
END $$;


--
-- Name: mail_queue_pick_selected("uuid"[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_pick_selected"("p_ids" "uuid"[], "p_limit" integer DEFAULT 25) RETURNS SETOF "public"."mail_queue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE q.id=ANY(p_ids) AND q.status='pending' AND q.not_before<=now()
   AND public._mail_notification_queue_live(q)
  ORDER BY array_position(p_ids,q.id),q.created_at LIMIT greatest(1,least(coalesce(p_limit,25),200)) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='sending',attempts=q.attempts+1,picked_at=now(),last_attempt_at=now()
 FROM candidates c WHERE q.id=c.id RETURNING q.*;
END $$;


--
-- Name: mail_queue_requeue("uuid"[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mail_queue_requeue"("p_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_only_failed" boolean DEFAULT true) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE affected integer;
BEGIN
 -- Active sending leases are never reset by a bulk retry. Retain future delay.
 WITH candidates AS (
  SELECT q.id FROM public.mail_queue q WHERE (p_ids IS NULL OR q.id=ANY(p_ids))
   AND (q.status='failed' OR (NOT p_only_failed AND q.status='pending'))
   AND public._mail_notification_queue_live(q) FOR UPDATE OF q SKIP LOCKED
 ) UPDATE public.mail_queue q SET status='pending',not_before=greatest(q.not_before,now()),picked_at=NULL,last_error=NULL,provider_used=NULL
 FROM candidates c WHERE q.id=c.id;
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END $$;


--
-- Name: mark_message_read("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mark_message_read"("p_message_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.messages
  SET is_read = true, read_at = now()
  WHERE id = p_message_id;
  RETURN FOUND;
END;
$$;


--
-- Name: market_add_to_library("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_add_to_library"("p_market_game_id" "uuid") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_uid   uuid := auth.uid();
    v_mg    public.market_games%rowtype;
    v_new   uuid;
    v_rows  int;
    v_q     jsonb;
    v_a     jsonb;
    v_q_id  uuid;
    v_ord   int;
    v_a_ord int;
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    select * into v_mg
      from public.market_games
     where id = p_market_game_id
       and status in ('published', 'withdrawn');

    if not found then
        return query select false, 'game_not_available';
        return;
    end if;

    -- stwórz lokalną kopię (type = 'market', per-user UUID, owner = v_uid)
    v_new := gen_random_uuid();

    insert into public.games
        (id, owner_id, name, type, status, source_market_id)
    values (
        v_new,
        v_uid,
        left(v_mg.title, 80),
        'market',
        'ready',
        p_market_game_id
    )
    on conflict (owner_id, source_market_id)
    where source_market_id is not null
    do nothing;

    get diagnostics v_rows = row_count;

    if v_rows > 0 then
        -- skopiuj pytania i odpowiedzi z payload
        v_ord := 1;
        for v_q in
            select value from jsonb_array_elements(v_mg.payload -> 'questions')
        loop
            v_q_id := gen_random_uuid();

            insert into public.questions (id, game_id, ord, text)
            values (v_q_id, v_new, v_ord, left(v_q ->> 'text', 200));

            v_a_ord := 1;
            for v_a in
                select value from jsonb_array_elements(v_q -> 'answers')
            loop
                insert into public.answers
                    (question_id, ord, text, fixed_points)
                values (
                    v_q_id,
                    v_a_ord,
                    left(v_a ->> 'text', 17),
                    coalesce((v_a ->> 'fixed_points')::int, 0)
                );
                v_a_ord := v_a_ord + 1;
            end loop;

            v_ord := v_ord + 1;
        end loop;
    else
        -- wiersz już istniał — pobierz jego UUID
        select id into v_new
          from public.games
         where owner_id = v_uid
           and source_market_id = p_market_game_id;
    end if;

    -- dodaj/zaktualizuj wpis biblioteczny z game_id
    insert into public.user_market_library (user_id, market_game_id, game_id)
    values (v_uid, p_market_game_id, v_new)
    on conflict (user_id, market_game_id) do update
        set game_id = excluded.game_id;

    return query select true, '';
end;
$$;


--
-- Name: market_admin_delete("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_delete"("p_id" "uuid") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_rows int;
begin
    -- gry z GitHub mogą być zarządzane tylko przez synchronizację
    if exists (
        select 1 from public.market_games
         where id = p_id and gh_slug is not null
    ) then
        return query select false, 'gh_game_cannot_be_deleted';
        return;
    end if;

    delete from public.market_games where id = p_id;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        return query select false, 'not_found';
        return;
    end if;

    return query select true, '';
end;
$$;


--
-- Name: market_admin_delete("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_delete"("p_id" "uuid", "p_force" boolean DEFAULT false) RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_rows int;
begin
    if not p_force and exists (
        select 1 from public.market_games where id = p_id and origin = 'producer'
    ) then
        return query select false, 'admin_game_cannot_be_deleted_without_force';
        return;
    end if;

    delete from public.market_games where id = p_id;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        return query select false, 'not_found';
        return;
    end if;

    return query select true, '';
end;
$$;


--
-- Name: market_admin_detail("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_detail"("p_id" "uuid") RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "lang" "text", "status" "public"."market_game_status", "moderation_note" "text", "library_count" integer, "author_username" "text", "author_email" "text", "payload" "jsonb", "created_at" timestamp with time zone, "source_game_id" "uuid", "origin" "text", "slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.status,
    mg.moderation_note, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    COALESCE(pr.email, '') AS author_email,
    mg.payload, mg.created_at, mg.source_game_id,
    mg.origin::text AS origin, mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.id = p_id;
$$;


--
-- Name: market_admin_list("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_list"("p_status" "text" DEFAULT 'pending'::"text") RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "lang" "text", "status" "public"."market_game_status", "moderation_note" "text", "library_count" integer, "author_username" "text", "author_email" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "source_game_id" "uuid", "origin" "text", "slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.status, mg.moderation_note, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    COALESCE(pr.email, '')    AS author_email,
    mg.created_at, mg.updated_at, mg.source_game_id,
    mg.origin::text AS origin, mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.status = p_status::public.market_game_status
  ORDER BY mg.created_at ASC;
$$;


--
-- Name: market_admin_producer_games(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_producer_games"() RETURNS TABLE("id" "uuid", "title" "text", "lang" "text", "status" "text", "avg_rating" numeric, "rating_count" integer, "library_count" integer, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT mg.id, mg.title, mg.lang, mg.status::text, mg.avg_rating, mg.rating_count, mg.library_count, mg.created_at
  FROM public.market_games mg
  WHERE mg.origin = 'producer'
  ORDER BY mg.avg_rating DESC NULLS LAST, mg.rating_count DESC, mg.created_at DESC;
$$;


--
-- Name: market_admin_review("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_review"("p_id" "uuid", "p_action" "text", "p_note" "text" DEFAULT ''::"text") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new_status public.market_game_status;
  v_title      text;
  v_slug       text;
begin
  if p_action = 'approve' then
    v_new_status := 'published';
  elsif p_action = 'reject' then
    v_new_status := 'rejected';
  else
    return query select false, 'invalid_action';
    return;
  end if;

  select title, slug into v_title, v_slug
    from public.market_games
   where id = p_id and status = 'pending';

  if not found then
    return query select false, 'not_found_or_not_pending';
    return;
  end if;

  if p_action = 'approve' and (v_slug is null or v_slug = '') then
    v_slug := public.unique_market_slug(v_title, p_id);
  end if;

  update public.market_games
     set status          = v_new_status,
         origin          = case when p_action = 'approve' then 'community' else origin end,
         moderation_note = case when p_action = 'reject' then btrim(coalesce(p_note, '')) else null end,
         slug            = case when p_action = 'approve' then v_slug else slug end
   where id = p_id;

  return query select true, '';
end;
$$;


--
-- Name: market_admin_upsert("text", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_upsert"("p_title" "text", "p_description" "text", "p_lang" "text", "p_payload" "jsonb") RETURNS TABLE("ok" boolean, "err" "text", "market_id" "uuid", "existing" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id       uuid;
  v_existing uuid;
  v_slug     text;
begin
  if p_payload is null then
    return query select false, 'payload_required'::text, null::uuid, false;
    return;
  end if;

  -- generuj slug kandydacyjny, sprawdź czy taka gra już istnieje
  v_slug := slugify(p_title);

  select id into v_existing
    from public.market_games
   where slug = v_slug;

  if v_existing is not null then
    update public.market_games
       set title       = p_title,
           description = p_description,
           lang        = p_lang,
           payload     = p_payload,
           origin      = 'producer',
           updated_at  = now()
     where id = v_existing;

    return query select true, ''::text, v_existing, true;
    return;
  end if;

  -- nowa gra
  v_slug := public.unique_market_slug(p_title);

  insert into public.market_games (
    title, description, lang, payload, status, author_user_id, origin, slug
  ) values (
    p_title, p_description, p_lang, p_payload,
    'published', auth.uid(), 'producer', v_slug
  )
  returning id into v_id;

  return query select true, ''::text, v_id, false;
end;
$$;


--
-- Name: market_admin_withdraw("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_admin_withdraw"("p_id" "uuid") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    update public.market_games
       set status = 'withdrawn',
           updated_at = now()
     where id = p_id
       and status = 'published';

    if not found then
        return query select false, 'not_found_or_not_published';
        return;
    end if;

    return query select true, '';
end;
$$;


--
-- Name: market_browse("text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_browse"("p_lang" "text" DEFAULT 'pl'::"text", "p_search" "text" DEFAULT ''::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "lang" "text", "library_count" integer, "avg_rating" numeric, "rating_count" integer, "user_stars" smallint, "author_username" "text", "created_at" timestamp with time zone, "in_library" boolean, "origin" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    mg.avg_rating, mg.rating_count,
    (SELECT r.stars FROM public.market_game_ratings r
      WHERE r.market_game_id = mg.id AND r.user_id = auth.uid()) AS user_stars,
    COALESCE(pr.username, '') AS author_username,
    mg.created_at,
    CASE WHEN auth.uid() IS NULL THEN false
         ELSE EXISTS (SELECT 1 FROM public.user_market_library uml
                       WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid())
    END AS in_library,
    mg.origin::text AS origin
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.status = 'published'
    AND (p_search = '' OR mg.title ILIKE '%' || p_search || '%' OR mg.description ILIKE '%' || p_search || '%')
  ORDER BY
    (mg.lang = p_lang) DESC,
    CASE WHEN mg.rating_count >= 3 THEN mg.avg_rating ELSE 0 END DESC,
    mg.library_count DESC,
    mg.created_at DESC
  LIMIT LEAST(p_limit, 100) OFFSET p_offset;
$$;


--
-- Name: market_cleanup_rejected(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_cleanup_rejected"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_deleted integer;
begin
    delete from public.market_games
     where status = 'rejected'
       and updated_at < now() - interval '5 days';

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;


--
-- Name: market_find_similar_embeddings("text", "public"."vector", double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_find_similar_embeddings"("p_lang" "text", "p_embedding" "public"."vector", "p_threshold" double precision DEFAULT 0.78, "p_limit" integer DEFAULT 8) RETURNS TABLE("id" "uuid", "title" "text", "origin" "text", "status" "public"."market_game_status", "author_username" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id,
    mg.title,
    mg.origin::text AS origin,
    mg.status,
    COALESCE(pr.username, '') AS author_username,
    (1 - (mg.embedding <=> p_embedding))::double precision AS similarity
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.lang = p_lang
    AND mg.status IN ('published', 'pending')
    AND mg.embedding IS NOT NULL
    AND (1 - (mg.embedding <=> p_embedding)) >= p_threshold
  ORDER BY similarity DESC, mg.created_at DESC
  LIMIT LEAST(p_limit, 50);
$$;


--
-- Name: market_find_similar_questions("text", "text", real, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_find_similar_questions"("p_lang" "text", "p_questions_text" "text", "p_threshold" real DEFAULT 0.45, "p_limit" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "title" "text", "origin" "text", "status" "public"."market_game_status", "author_username" "text", "similarity" real)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id,
    mg.title,
    mg.origin::text AS origin,
    mg.status,
    COALESCE(pr.username, '') AS author_username,
    similarity(mg.questions_text, p_questions_text)::real AS similarity
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.lang = p_lang
    AND mg.status IN ('published', 'pending')
    AND similarity(mg.questions_text, p_questions_text) >= p_threshold
  ORDER BY similarity DESC, mg.created_at DESC
  LIMIT LEAST(p_limit, 50);
$$;


--
-- Name: market_game_by_slug("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_game_by_slug"("p_slug" "text") RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "lang" "text", "library_count" integer, "author_username" "text", "status" "public"."market_game_status", "payload" "jsonb", "in_library" boolean, "origin" "text", "slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    COALESCE(pr.username, '') AS author_username,
    mg.status, mg.payload,
    CASE
      WHEN auth.uid() IS NULL THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.user_market_library uml
         WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid()
      )
    END AS in_library,
    mg.origin::text AS origin,
    mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.slug = p_slug AND mg.status = 'published';
$$;


--
-- Name: market_game_detail("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_game_detail"("p_id" "uuid") RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "lang" "text", "library_count" integer, "avg_rating" numeric, "rating_count" integer, "user_stars" smallint, "author_username" "text", "status" "public"."market_game_status", "payload" "jsonb", "in_library" boolean, "origin" "text", "slug" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    mg.id, mg.title, mg.description, mg.lang, mg.library_count,
    mg.avg_rating, mg.rating_count,
    (SELECT r.stars FROM public.market_game_ratings r
      WHERE r.market_game_id = mg.id AND r.user_id = auth.uid()) AS user_stars,
    COALESCE(pr.username, '') AS author_username,
    mg.status, mg.payload,
    CASE WHEN auth.uid() IS NULL THEN false
         ELSE EXISTS (SELECT 1 FROM public.user_market_library uml
                       WHERE uml.market_game_id = mg.id AND uml.user_id = auth.uid())
    END AS in_library,
    mg.origin::text AS origin,
    mg.slug
  FROM public.market_games mg
  LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
  WHERE mg.id = p_id;
$$;


--
-- Name: market_game_raters("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_game_raters"("p_market_game_id" "uuid") RETURNS TABLE("username" "text", "stars" smallint, "rated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.market_games
    where id = p_market_game_id
      and author_user_id = auth.uid()
  ) then
    return;
  end if;

  return query
    select coalesce(pr.username, '?')::text, r.stars, r.created_at
    from public.market_game_ratings r
    left join public.profiles pr on pr.id = r.user_id
    where r.market_game_id = p_market_game_id
    order by r.created_at desc;
end;
$$;


--
-- Name: market_games_build_questions_text("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_games_build_questions_text"("p_payload" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE((
    SELECT string_agg(btrim(q.value->>'text'), E'\n' ORDER BY q.ordinality)
    FROM jsonb_array_elements(COALESCE(p_payload->'questions', '[]'::jsonb)) WITH ORDINALITY AS q(value, ordinality)
  ), '');
$$;


--
-- Name: market_games_compute_fingerprint("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_games_compute_fingerprint"("p_questions_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT md5(
    regexp_replace(
      lower(coalesce(p_questions_text, '')),
      '\s+',
      ' ',
      'g'
    )
  );
$$;


--
-- Name: market_games_set_questions_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_games_set_questions_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_qtext text;
BEGIN
  v_qtext := public.market_games_build_questions_text(NEW.payload);
  NEW.questions_text := v_qtext;
  NEW.questions_fingerprint := public.market_games_compute_fingerprint(v_qtext);
  RETURN NEW;
END;
$$;


--
-- Name: market_my_library(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_my_library"() RETURNS TABLE("market_game_id" "uuid", "game_id" "uuid", "title" "text", "lang" "text", "author_username" "text", "status" "public"."market_game_status", "added_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT
        mg.id             AS market_game_id,
        uml.game_id       AS game_id,
        mg.title,
        mg.lang,
        COALESCE(pr.username, '') AS author_username,
        mg.status,
        uml.created_at    AS added_at
    FROM public.user_market_library uml
    JOIN public.market_games mg  ON mg.id = uml.market_game_id
    LEFT JOIN public.profiles pr ON pr.id = mg.author_user_id
    WHERE uml.user_id = auth.uid()
    ORDER BY uml.created_at DESC;
$$;


--
-- Name: market_my_submissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_my_submissions"() RETURNS TABLE("id" "uuid", "source_game_id" "uuid", "title" "text", "description" "text", "lang" "text", "status" "public"."market_game_status", "moderation_note" "text", "library_count" integer, "avg_rating" numeric, "rating_count" integer, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT mg.id, mg.source_game_id, mg.title, mg.description, mg.lang,
         mg.status, mg.moderation_note, mg.library_count, mg.avg_rating, mg.rating_count, mg.created_at
  FROM public.market_games mg
  WHERE mg.author_user_id = auth.uid() AND mg.status <> 'withdrawn'
  ORDER BY mg.created_at DESC;
$$;


--
-- Name: market_rate_game("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_rate_game"("p_market_game_id" "uuid", "p_stars" integer) RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return query select false, 'not_authenticated'; return; end if;
  if p_stars < 1 or p_stars > 5 then return query select false, 'invalid_stars'; return; end if;
  if not exists (select 1 from public.market_games where id = p_market_game_id and status = 'published') then
    return query select false, 'game_not_found'; return;
  end if;
  if exists (select 1 from public.market_games where id = p_market_game_id and author_user_id = v_uid) then
    return query select false, 'cannot_rate_own_game'; return;
  end if;

  insert into public.market_game_ratings (market_game_id, user_id, stars)
  values (p_market_game_id, v_uid, p_stars)
  on conflict (market_game_id, user_id) do update
    set stars = excluded.stars,
        created_at = now();

  return query select true, ''::text;
end;
$$;


--
-- Name: market_remove_from_library("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_remove_from_library"("p_market_game_id" "uuid") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_uid uuid := auth.uid();
    v_game record;
    v_res jsonb;
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    -- 312: usunięcie kopii idzie tą samą drogą co lista gier
    -- (delete_resource_checked: blokada gry, maile, urządzenia).
    for v_game in
        select id from public.games
         where owner_id = v_uid
           and source_market_id = p_market_game_id
    loop
        v_res := public.delete_resource_checked('game', v_game.id);
        if coalesce((v_res->>'ok')::boolean, false) = false
           and coalesce(v_res->>'error', '') <> 'not_found_or_forbidden' then
            -- cała operacja wraca (RETURN przed usunięciem wpisu bibliotecznego;
            -- kopie usunięte wcześniej w tej pętli zostają usunięte)
            return query select false, 'locked';
            return;
        end if;
    end loop;

    -- usuń wpis biblioteczny
    delete from public.user_market_library
     where user_id        = v_uid
       and market_game_id = p_market_game_id;

    return query select true, '';
end;
$$;


--
-- Name: market_submit_game("uuid", "text", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_submit_game"("p_game_id" "uuid", "p_title" "text", "p_description" "text", "p_lang" "text", "p_payload" "jsonb") RETURNS TABLE("ok" boolean, "err" "text", "market_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_game public.games%rowtype;
  v_can_play boolean;
  v_payload jsonb;
  v_new uuid;
  v_ntfy_topic text;
begin
  if v_uid is null then return query select false, 'not_authenticated', null::uuid; return; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game
  from public.games
  where id = p_game_id
    and owner_id = v_uid
    and source_market_id is null
    and is_demo = false;

  if not found then return query select false, 'game_not_found', null::uuid; return; end if;

  if exists (
    select 1 from public.market_games
    where author_user_id = v_uid
      and source_game_id = p_game_id
      and status in ('pending', 'published')
  ) then
    return query select false, 'already_submitted', null::uuid; return;
  end if;

  select can_play into v_can_play from public.game_action_state(p_game_id);
  if not coalesce(v_can_play, false) then
    return query select false, 'game_not_playable', null::uuid; return;
  end if;

  if p_lang not in ('pl', 'en', 'uk') then return query select false, 'invalid_lang', null::uuid; return; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    return query select false, 'invalid_title', null::uuid; return;
  end if;
  if char_length(btrim(coalesce(p_description, ''))) > 500 then
    return query select false, 'invalid_description', null::uuid; return;
  end if;

  select jsonb_build_object(
    'game', jsonb_build_object(
      'name', v_game.name,
      'type', case
        when v_game.status = 'ready' and v_game.type in ('poll_text', 'poll_points') then 'prepared'
        else v_game.type::text
      end
    ),
    'questions', coalesce(jsonb_agg(
      jsonb_build_object(
        'text', q.text,
        'answers', coalesce((
          select jsonb_agg(
            jsonb_build_object('text', a.text, 'fixed_points', a.fixed_points)
            order by a.ord
          )
          from public.answers a where a.question_id = q.id
        ), '[]'::jsonb)
      ) order by q.ord
    ), '[]'::jsonb)
  ) into v_payload
  from public.questions q
  where q.game_id = p_game_id;

  if jsonb_array_length(v_payload -> 'questions') < 10 then
    return query select false, 'too_few_questions', null::uuid; return;
  end if;

  insert into public.market_games
    (author_user_id, source_game_id, title, description, lang, status, payload)
  values
    (v_uid, p_game_id, btrim(p_title), btrim(coalesce(p_description, '')), p_lang, 'pending', v_payload)
  returning id into v_new;

  begin
    select value into v_ntfy_topic from public.app_config where key = 'ntfy_topic';
    if v_ntfy_topic is not null and v_ntfy_topic <> '' then
      perform net.http_post(
        url := 'https://ntfy.sh/' || v_ntfy_topic,
        body := jsonb_build_object(
          'title', 'Nowe zgłoszenie (' || p_lang || ')',
          'message', btrim(p_title),
          'priority', 3
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    null;
  end;

  return query select true, null::text, v_new;
end;
$$;


--
-- Name: market_withdraw("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."market_withdraw"("p_market_game_id" "uuid") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_uid uuid := auth.uid();
    v_rows int;
begin
    if v_uid is null then
        return query select false, 'not_authenticated';
        return;
    end if;

    update public.market_games
       set status = 'withdrawn'
     where id = p_market_game_id
       and author_user_id = v_uid
       and status = 'published';

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        return query select false, 'not_found_or_not_published';
        return;
    end if;

    return query select true, '';
end;
$$;


--
-- Name: marketing_get_verified_contacts("uuid", integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."marketing_get_verified_contacts"("p_run_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0, "p_only_unused" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "title" "text", "short_description" "text", "email" "text", "url" "text", "is_used" boolean, "added_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        vc.id,
        vc.title,
        vc.short_description,
        vc.email,
        vc.url,
        vc.is_used,
        vc.added_at
    FROM marketing_verified_contacts vc
    WHERE (p_run_id IS NULL OR vc.run_id = p_run_id)
      AND (p_only_unused = false OR vc.is_used = false)
    ORDER BY vc.added_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


--
-- Name: on_profile_created_check_suppression(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."on_profile_created_check_suppression"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE mailbox text;
BEGIN
 SELECT public._norm_email(u.email) INTO mailbox FROM auth.users u
  WHERE u.id=NEW.id AND public._poll_identity_regular(u.id,to_jsonb(u));
 IF mailbox IS NOT NULL AND EXISTS(SELECT 1 FROM public.email_unsub_tokens WHERE email=mailbox AND suppressed_at IS NOT NULL) THEN
  INSERT INTO public.user_flags(user_id,email_notifications) VALUES(NEW.id,false)
   ON CONFLICT(user_id) DO UPDATE SET email_notifications=false;
 END IF;
 -- Root stays: account creation is not an instruction to enable notifications.
 RETURN NEW;
END $$;


--
-- Name: poll_abort("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_abort"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  IF v_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
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


--
-- Name: poll_action("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_action"("p_kind" "text", "p_token" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_kind text := coalesce(p_kind, '');
  v_action text := coalesce(p_action, '');
begin
  -- Minimalna, bezpieczna odpowiedź, jeśli token null
  if p_token is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_token',
      'kind', v_kind,
      'action', v_action
    );
  end if;

  -- UWAGA:
  -- TU NIE ZGADUJEMY logiki go ani frontu.
  -- poll_action ma tylko spójny kontrakt i nie może wpadać w rekurencję.
  -- Docelowa logika dla sub/task już masz w osobnych funkcjach
  -- (poll_task_opened/poll_task_done/poll_sub_accept/poll_sub_decline itd.)
  --
  -- Na razie robimy routing STRICT po kind:
  if v_kind = 'task' then
    -- allowed actions: opened/done/decline
    if v_action = 'opened' or v_action = 'open' then
      perform public.poll_task_opened(p_token);
      return jsonb_build_object('ok', true, 'kind', 'task', 'action', 'opened');
    elsif v_action = 'done' then
      perform public.poll_task_done(p_token);
      return jsonb_build_object('ok', true, 'kind', 'task', 'action', 'done');
    elsif v_action = 'decline' then
      perform public.poll_task_decline(p_token);
      return jsonb_build_object('ok', true, 'kind', 'task', 'action', 'decline');
    else
      return jsonb_build_object('ok', false, 'kind', 'task', 'error', 'invalid_action', 'action', v_action);
    end if;

  elsif v_kind = 'sub' then
    -- allowed actions: accept/decline
    if v_action = 'accept' then
      perform public.poll_sub_accept(p_token);
      return jsonb_build_object('ok', true, 'kind', 'sub', 'action', 'accept');
    elsif v_action = 'decline' then
      perform public.poll_sub_decline(p_token);
      return jsonb_build_object('ok', true, 'kind', 'sub', 'action', 'decline');
    else
      return jsonb_build_object('ok', false, 'kind', 'sub', 'error', 'invalid_action', 'action', v_action);
    end if;

  else
    return jsonb_build_object('ok', false, 'error', 'invalid_kind', 'kind', v_kind, 'action', v_action);
  end if;
end;
$$;


--
-- Name: poll_admin_can_close("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_admin_can_close"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g record;
  q record;
  uniq_cnt int;
  ok boolean := true;
  reason text := '';
begin
  -- tylko właściciel
  select id, owner_id, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Gra nie istnieje.');
  end if;

  if auth.uid() is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'Brak uprawnień.');
  end if;

  if g.status <> 'poll_open'::game_status then
    return jsonb_build_object('ok', false, 'reason', 'Sondaż nie jest otwarty.');
  end if;

  if g.type = 'poll_text'::game_type then
    for q in
      select id, ord from public.questions where game_id = p_game_id order by ord
    loop
      select count(*) into uniq_cnt
      from (
        select distinct trim(coalesce(answer_norm,'')) as k
        from public.poll_text_entries
        where game_id = p_game_id
          and question_id = q.id
          and trim(coalesce(answer_norm,'')) <> ''
      ) s;

      if coalesce(uniq_cnt,0) < 3 then
        ok := false;
        reason := format('Pytanie %s: potrzebujesz ≥ 3 różnych odpowiedzi.', q.ord);
        exit;
      end if;
    end loop;

    return jsonb_build_object('ok', ok, 'reason', reason);
  end if;

  if g.type = 'poll_points'::game_type then
    for q in
      select id, ord from public.questions where game_id = p_game_id order by ord
    loop
      -- co najmniej 2 odpowiedzi z >=1 głosem
      select count(*) into uniq_cnt
      from (
        select answer_id
        from public.poll_votes
        where game_id = p_game_id
          and question_id = q.id
          and answer_id is not null
        group by answer_id
        having count(*) > 0
      ) s;

      if coalesce(uniq_cnt,0) < 2 then
        ok := false;
        reason := format('Pytanie %s: potrzebujesz ≥ 2 odpowiedzi z głosami > 0.', q.ord);
        exit;
      end if;
    end loop;

    return jsonb_build_object('ok', ok, 'reason', reason);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'Nieznany typ gry.');
end;
$$;


--
-- Name: poll_admin_delete_vote("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_admin_delete_vote"("p_game_id" "uuid", "p_voter_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  u uuid;
  deleted_points int := 0;
  deleted_text int := 0;
  task_id uuid;
  current_key text;
BEGIN
  u := auth.uid();
  IF u IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT share_key_poll INTO current_key FROM public.games WHERE id=p_game_id AND owner_id=u FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_owner'); END IF;

  DELETE FROM public.poll_votes
   WHERE game_id = p_game_id
     AND voter_token = p_voter_token;
  GET DIAGNOSTICS deleted_points = ROW_COUNT;

  DELETE FROM public.poll_text_entries
   WHERE game_id = p_game_id
     AND voter_token = p_voter_token;
  GET DIAGNOSTICS deleted_text = ROW_COUNT;

  IF p_voter_token LIKE 'task:%' THEN
    BEGIN
      task_id := nullif(split_part(p_voter_token, ':', 2), '')::uuid;
    EXCEPTION WHEN others THEN
      task_id := null;
    END;

    IF task_id IS NOT NULL THEN
      UPDATE public.poll_tasks
        SET status = 'pending',
            done_at = null,
            opened_at = null,
            declined_at = null,
            cancelled_at = null
      WHERE id = task_id AND owner_id = u AND game_id=p_game_id
        AND share_key_poll=current_key AND status='done' AND declined_at IS NULL AND cancelled_at IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_poll_votes', deleted_points,
    'deleted_poll_text_entries', deleted_text
  );
END;
$$;


--
-- Name: poll_admin_preview("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_admin_preview"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g record;
  out jsonb;
begin
  select id, owner_id, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Gra nie istnieje.');
  end if;

  if auth.uid() is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'Brak uprawnień.');
  end if;

  if g.type = 'poll_points'::game_type then
    select jsonb_build_object(
      'ok', true,
      'type', g.type,
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'ord', q.ord,
            'text', q.text,
            'answers', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', a.id,
                  'ord', a.ord,
                  'text', a.text,
                  'votes', coalesce(v.cnt,0)
                )
                order by a.ord
              )
              from public.answers a
              left join (
                select answer_id, count(*) cnt
                from public.poll_votes
                where game_id = p_game_id and question_id = q.id
                group by answer_id
              ) v on v.answer_id = a.id
              where a.question_id = q.id
            ), '[]'::jsonb)
          )
          order by q.ord
        )
        from public.questions q
        where q.game_id = p_game_id
      ), '[]'::jsonb)
    ) into out;

    return out;
  end if;

  if g.type = 'poll_text'::game_type then
    select jsonb_build_object(
      'ok', true,
      'type', g.type,
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'ord', q.ord,
            'text', q.text,
            'top', coalesce((
              select jsonb_agg(
                jsonb_build_object('text', t.answer_norm, 'count', t.cnt)
                order by t.cnt desc
              )
              from (
                select trim(answer_norm) as answer_norm, count(*) cnt
                from public.poll_text_entries
                where game_id = p_game_id and question_id = q.id
                  and trim(coalesce(answer_norm,'')) <> ''
                group by trim(answer_norm)
                order by count(*) desc
                limit 12
              ) t
            ), '[]'::jsonb)
          )
          order by q.ord
        )
        from public.questions q
        where q.game_id = p_game_id
      ), '[]'::jsonb)
    ) into out;

    return out;
  end if;

  return jsonb_build_object('ok', false, 'reason', 'Gra preparowana nie ma podglądu.');
end;
$$;


--
-- Name: poll_anonymous_submit("uuid", "text", "uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_anonymous_submit"("p_game_id" "uuid", "p_key" "text", "p_browser_token" "uuid", "p_voter_token" "uuid", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE before_owner uuid; g public.games; bucket public.poll_anonymous_limits;
 kh text; bh text; vh text; ph text; q_count integer; item_count integer; unique_count integer; remaining integer;
BEGIN
 IF p_browser_token IS NULL OR p_voter_token IS NULL OR p_key IS NULL OR p_items IS NULL
  OR jsonb_typeof(p_items)<>'array' THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
 IF jsonb_array_length(p_items)>1000 OR octet_length(p_items::text)>256000 THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT owner_id INTO before_owner FROM public.games WHERE id=p_game_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
   PERFORM 1 FROM auth.users WHERE id=ANY(ARRAY[before_owner,auth.uid()]) ORDER BY id FOR SHARE NOWAIT;
   SELECT * INTO g FROM public.games WHERE id=p_game_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','gone'); END IF;
   IF g.owner_id IS DISTINCT FROM before_owner THEN RAISE EXCEPTION 'parent changed' USING ERRCODE='55P03'; END IF;
   IF g.share_key_poll IS DISTINCT FROM p_key THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
   IF g.status::text<>'poll_open' THEN RETURN jsonb_build_object('ok',false,'error','closed'); END IF;
   IF g.type::text NOT IN('poll_text','poll_points') THEN RETURN jsonb_build_object('ok',false,'error','invalid_type'); END IF;
   SELECT count(*) INTO q_count FROM public.questions WHERE game_id=p_game_id;
   SELECT count(*),count(DISTINCT (item->>'question_id')::uuid) INTO item_count,unique_count FROM jsonb_array_elements(p_items) item;
   IF q_count=0 OR item_count<>q_count OR unique_count<>q_count OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_items) item LEFT JOIN public.questions q ON q.id=(item->>'question_id')::uuid AND q.game_id=p_game_id WHERE q.id IS NULL)
   THEN RETURN jsonb_build_object('ok',false,'error','incomplete_form'); END IF;
   IF g.type::text='poll_text' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) item WHERE jsonb_typeof(item->'answer_raw') IS DISTINCT FROM 'string'
      OR btrim(item->>'answer_raw')='' OR char_length(btrim(item->>'answer_raw'))>17)
    THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
    SELECT jsonb_agg(jsonb_build_object('question_id',(item->>'question_id')::uuid,'answer_raw',btrim(item->>'answer_raw'),
      'answer_norm',lower(regexp_replace(btrim(item->>'answer_raw'),'\s+',' ','g'))) ORDER BY item->>'question_id') INTO p_items FROM jsonb_array_elements(p_items) item;
   ELSE
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) item LEFT JOIN public.answers a
      ON a.id=(item->>'answer_id')::uuid AND a.question_id=(item->>'question_id')::uuid WHERE a.id IS NULL)
    THEN RETURN jsonb_build_object('ok',false,'error','invalid_payload'); END IF;
    SELECT jsonb_agg(jsonb_build_object('question_id',(item->>'question_id')::uuid,'answer_id',(item->>'answer_id')::uuid) ORDER BY item->>'question_id') INTO p_items FROM jsonb_array_elements(p_items) item;
   END IF;
   kh:=public._poll_anon_hash(p_game_id,p_key,'key');
   bh:=public._poll_anon_hash(p_game_id,p_key,p_browser_token::text);
   vh:=public._poll_anon_hash(p_game_id,p_key,p_voter_token::text);
   SELECT encode(sha256(convert_to(jsonb_agg(item ORDER BY item->>'question_id')::text,'UTF8')),'hex') INTO ph FROM jsonb_array_elements(p_items) item;
   IF (EXISTS(SELECT 1 FROM public.poll_text_entries WHERE game_id=p_game_id AND voter_token=p_voter_token::text)
    OR EXISTS(SELECT 1 FROM public.poll_votes WHERE game_id=p_game_id AND voter_token=p_voter_token::text))
    AND NOT EXISTS(SELECT 1 FROM public.poll_anonymous_limits WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh AND voter_hash=vh)
   THEN RETURN jsonb_build_object('ok',false,'error','attempt_reused'); END IF;
   INSERT INTO public.poll_anonymous_limits(game_id,key_hash,browser_hash) VALUES(p_game_id,kh,bh) ON CONFLICT DO NOTHING;
   SELECT * INTO bucket FROM public.poll_anonymous_limits WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh FOR UPDATE NOWAIT;
   IF bucket.voter_hash=vh THEN
    IF bucket.payload_hash IS DISTINCT FROM ph THEN RETURN jsonb_build_object('ok',false,'error','attempt_reused'); END IF;
    RETURN jsonb_build_object('ok',true,'already_submitted',true);
   END IF;
   remaining:=CASE WHEN bucket.next_allowed_at>clock_timestamp() THEN ceil(extract(epoch FROM bucket.next_allowed_at-clock_timestamp())) ELSE 0 END;
   IF remaining>0 THEN RETURN jsonb_build_object('ok',false,'error','cooldown','retry_after',remaining); END IF;
   IF EXISTS(SELECT 1 FROM public.poll_text_entries WHERE game_id=p_game_id AND voter_token=p_voter_token::text)
    OR EXISTS(SELECT 1 FROM public.poll_votes WHERE game_id=p_game_id AND voter_token=p_voter_token::text)
   THEN RETURN jsonb_build_object('ok',false,'error','attempt_reused'); END IF;
   UPDATE public.poll_anonymous_limits SET voter_hash=vh,payload_hash=ph,in_progress=true WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh;
   IF g.type::text='poll_text' THEN PERFORM public.poll_text_submit_batch(p_game_id,p_key,p_voter_token::text,p_items);
   ELSE PERFORM public.poll_points_vote_batch(p_game_id,p_key,p_voter_token::text,p_items); END IF;
   UPDATE public.poll_anonymous_limits SET in_progress=false,next_allowed_at=clock_timestamp()+interval '30 seconds' WHERE game_id=p_game_id AND key_hash=kh AND browser_hash=bh;
   RETURN jsonb_build_object('ok',true,'already_submitted',false);
  EXCEPTION WHEN lock_not_available THEN IF attempt=1000 THEN RAISE; END IF; END;
  PERFORM pg_sleep(.01);
 END LOOP;
EXCEPTION WHEN unique_violation THEN
 RETURN jsonb_build_object('ok',false,'error','attempt_reused');
WHEN invalid_text_representation OR not_null_violation OR foreign_key_violation THEN
 RETURN jsonb_build_object('ok',false,'error','invalid_payload');
END $$;


--
-- Name: poll_claim_email_records(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_claim_email_records"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: poll_close_and_normalize("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_close_and_normalize"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g public.games;
begin
  select * into g
  from public.games
  where id = p_game_id
    and share_key_poll = p_key
  limit 1;

  if not found then
    raise exception 'bad key or game';
  end if;

  if g.type <> 'poll_points'::public.game_type then
    raise exception 'poll_close_and_normalize works only for poll_points';
  end if;

  if g.status <> 'poll_open'::public.game_status then
    raise exception 'poll is not open';
  end if;

  if (select count(*) from public.questions where game_id = p_game_id) < 10 then
    raise exception 'Za mało pytań (min 10)';
  end if;

  /*
    Mapujemy ord->question_id i ord->answer_id, a głosy liczymy z poll_votes (ord-owo).
    Uwaga: działamy tylko na pytaniach 1..10.
  */

  with q10 as (
    select id as question_id, ord as qord
    from public.questions
    where game_id = p_game_id
      and ord between 1 and 10
  ),
  a as (
    select
      q10.question_id,
      q10.qord,
      an.id as answer_id,
      an.ord as aord
    from q10
    join public.answers an
      on an.question_id = q10.question_id
    where an.ord between 1 and 6
  ),
  c as (
    select
      a.question_id,
      a.answer_id,
      a.qord,
      a.aord,
      coalesce(count(v.id), 0)::int as cnt
    from a
    left join public.poll_votes v
      on v.game_id = p_game_id
     and v.question_ord = a.qord
     and v.answer_ord  = a.aord
    group by a.question_id, a.answer_id, a.qord, a.aord
  ),
  c_fixed as (
    select
      question_id,
      answer_id,
      qord,
      aord,
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
    select
      question_id,
      answer_id,
      aord,
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
    select
      b.question_id,
      b.answer_id,
      b.aord,
      b.p0,
      b.frac,
      (100 - sb.s0)::int as diff
    from base b
    join sum_base sb on sb.question_id = b.question_id
  ),
  ranked_plus as (
    select
      n.*,
      row_number() over (partition by question_id order by frac desc, aord asc) as rn_plus
    from need n
  ),
  ranked_minus as (
    select
      n.*,
      row_number() over (partition by question_id order by p0 desc, frac asc, aord desc) as rn_minus
    from need n
    where p0 > 1
  ),
  final as (
    select
      n.answer_id,
      case
        when n.diff > 0 then
          n.p0 + case when rp.rn_plus <= n.diff then 1 else 0 end
        when n.diff < 0 then
          n.p0 - case
            when rm.rn_minus is not null and rm.rn_minus <= abs(n.diff) then 1
            else 0
          end
        else
          n.p0
      end as p_final
    from need n
    left join ranked_plus rp
      on rp.question_id = n.question_id and rp.answer_id = n.answer_id
    left join ranked_minus rm
      on rm.question_id = n.question_id and rm.answer_id = n.answer_id
  )
  update public.answers aup
  set fixed_points = f.p_final
  from final f
  where aup.id = f.answer_id;

  -- zamknij sesje
  update public.poll_sessions
  set is_open = false,
      closed_at = now()
  where game_id = p_game_id
    and is_open = true;

  -- zamknij grę
  update public.games
  set status = 'ready'::public.game_status,
      poll_closed_at = now()
  where id = p_game_id;

end;
$$;


--
-- Name: poll_get_payload("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_get_payload"("p_game_id" "uuid", "p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g record;
  out jsonb;
begin
  select id, name, type, status
    into g
  from public.games
  where id = p_game_id
    and share_key_poll = p_key;

  if not found then
    raise exception 'poll_get_payload: bad key or game not found';
  end if;

  if g.type = 'prepared'::game_type then
    raise exception 'poll_get_payload: prepared has no poll';
  end if;

  if g.status <> 'poll_open'::game_status then
    -- uczestnik ma widzieć tylko aktywny sondaż
    raise exception 'poll_get_payload: poll is not open';
  end if;

  -- pytania
  -- dla poll_points zwracamy też odpowiedzi
  if g.type = 'poll_points'::game_type then
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status),
      'questions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', q.id,
              'ord', q.ord,
              'text', q.text,
              'answers', coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object('id', a.id, 'ord', a.ord, 'text', a.text)
                    order by a.ord
                  )
                  from public.answers a
                  where a.question_id = q.id
                ),
                '[]'::jsonb
              )
            )
            order by q.ord
          )
          from public.questions q
          where q.game_id = g.id
        ),
        '[]'::jsonb
      )
    ) into out;
  else
    -- poll_text: wystarczą pytania
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status),
      'questions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('id', q.id, 'ord', q.ord, 'text', q.text)
            order by q.ord
          )
          from public.questions q
          where q.game_id = g.id
        ),
        '[]'::jsonb
      )
    ) into out;
  end if;

  return out;
end;
$$;


--
-- Name: poll_go_global_unsubscribe("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_go_global_unsubscribe"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE mailbox text; result jsonb;
BEGIN
 SELECT email INTO mailbox FROM public.email_unsub_tokens WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 PERFORM public._mail_anon_source_locks(mailbox);
 IF public._poll_registered_uid(mailbox) IS NULL THEN
  result:=public.mail_anon_resign(p_token);
  -- Preserve old unsubscribe authority without exposing private lists/counts.
  RETURN jsonb_build_object('ok',result->>'ok'='true');
 END IF;
 PERFORM 1 FROM public.email_unsub_tokens WHERE token=p_token AND email=mailbox FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 UPDATE public.email_unsub_tokens SET suppressed_at=coalesce(suppressed_at,clock_timestamp()) WHERE token=p_token;
 -- Account mail-off affects mail only; accesses retain their own decisions.
 RETURN jsonb_build_object('ok',true);
END $$;


--
-- Name: poll_go_resolve("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_go_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s record;
  t record;
  task public.poll_tasks%rowtype;
  u record;
  f record;
  b record;
BEGIN
  -- Znajomość przed subskrypcją: stare tokeny z maili kont skopiowano w 320.
  SELECT fs.id,fs.status,fs.requester_id,fs.decision_user_id AS addressee_id,p.username AS owner_label
  INTO f FROM public.friendships fs JOIN public.profiles p ON p.id=CASE WHEN fs.decision_user_id=fs.requester_id THEN fs.addressee_id ELSE fs.requester_id END
  WHERE fs.token=p_token AND fs.cancelled_at IS NULL AND (fs.status<>'declined' OR fs.declined_at>now()-interval '30 days') LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'kind','friend','id',f.id,'status',f.status,
      'owner_label',f.owner_label,'recipient_matches_me',auth.uid()=f.addressee_id);
  END IF;
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at,ps.registered_user_id,ps.cancelled_at,ps.declined_at
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token AND (ps.declined_at IS NULL OR ps.declined_at>now()-interval '30 days') LIMIT 1;

  IF found THEN
    IF s.subscriber_user_id IS NULL AND s.registered_user_id IS NULL AND NOT public._contact_mail_enabled(s.subscriber_email) THEN RETURN jsonb_build_object('ok',false,'error','revoked'); END IF;
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'registered_user_id', s.registered_user_id,
      'cancelled_at', s.cancelled_at, 'declined_at', s.declined_at,
      'subscriber_email', s.subscriber_email,
      'friend_conversion_required', s.registered_user_id IS NOT NULL OR s.subscriber_user_id IS NOT NULL OR public._poll_registered_uid(s.subscriber_email) IS NOT NULL
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.owner_id AS game_owner, g.type::text AS game_type,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    IF t.recipient_user_id IS NULL AND NOT public._contact_mail_enabled(t.recipient_email) THEN RETURN jsonb_build_object('ok',false,'error','revoked'); END IF;
    IF t.game_key IS NULL OR t.game_key IS DISTINCT FROM t.share_key_poll
      OR t.owner_id IS DISTINCT FROM t.game_owner OR t.poll_type IS DISTINCT FROM t.game_type THEN
      RETURN jsonb_build_object('ok',false,'error','expired');
    END IF;
    SELECT * INTO task FROM public.poll_tasks WHERE id=t.id;
    IF NOT FOUND OR NOT public._poll_task_source_active(task) THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
    IF t.recipient_user_id IS NULL THEN
      t.recipient_user_id:=public._poll_registered_uid(t.recipient_email);
    END IF;
    -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
    IF t.status IN ('pending', 'opened') THEN
      IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
         OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'expired');
      ELSIF t.game_status = 'poll_stopped' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
      ELSIF t.game_status = 'ready' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
      END IF;
    END IF;
    -- E11b: tylko znacznik czasu, bez stanu pośredniego 'opened'
    IF t.opened_at IS NULL THEN
      PERFORM public._poll_task_change(p_token,'open');
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

  -- Base shares: token is only a pointer to the logged-in recipient's task.
  SELECT bt.id, bt.status, bt.base_id, bt.recipient_user_id, bt.recipient_email,
         bt.owner_id, p.username AS owner_label
  INTO b
  FROM public.base_share_tasks bt
  LEFT JOIN public.profiles p ON p.id = bt.owner_id
  WHERE bt.token = p_token
    AND (bt.status NOT IN ('pending','opened','declined') OR coalesce(bt.declined_at+interval '30 days',bt.created_at+interval '5 days')>now())
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'base', 'task_id', b.id, 'status', b.status,
      'base_id', b.base_id, 'recipient_user_id', b.recipient_user_id,
      'recipient_email', b.recipient_email, 'owner_id', b.owner_id,
      'owner_label', b.owner_label,
      'recipient_matches_me', auth.uid() = b.recipient_user_id
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


--
-- Name: poll_go_sub_decline("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_go_sub_decline"("p_token" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT public._subscriber_close(p_token,false);
$$;


--
-- Name: poll_go_subscribe_email("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_go_subscribe_email"("p_token" "uuid", "p_email" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce((public.poll_sub_accept_email(p_token,p_email)->>'ok')::boolean,false);
$$;


--
-- Name: poll_go_task_action("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_go_task_action"("p_token" "uuid", "p_action" "text", "p_email" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT CASE WHEN lower(trim(p_action)) IN ('open','decline')
 THEN public._poll_task_change(p_token,lower(trim(p_action)))='ok' ELSE false END
$$;


--
-- Name: poll_mail_budget_expire_due(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_mail_budget_expire_due"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE n integer;
BEGIN
 DELETE FROM public.poll_mail_budget_events WHERE created_at<=now()-interval '24 hours';
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END; $$;


--
-- Name: poll_mail_budget_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_mail_budget_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE deadline timestamptz; recipient text;
BEGIN
 IF NEW.cooldown_action_key<>'poll:share' OR NEW.created_by IS NULL THEN RETURN NEW; END IF;
 recipient:=public._norm_email(NEW.to_email);
 IF recipient IS NULL THEN RAISE EXCEPTION 'invalid poll recipient'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('poll-mail-budget:'||NEW.created_by||':'||recipient,342));
 DELETE FROM public.poll_mail_budget_events WHERE owner_id=NEW.created_by AND recipient_key=md5(recipient)
  AND created_at<=now()-interval '24 hours';
 deadline:=public._poll_daily_cap_until(NEW.created_by,recipient);
 IF deadline IS NOT NULL THEN RAISE EXCEPTION 'cooldown_active: poll daily_cap until %',deadline; END IF;
 INSERT INTO public.poll_mail_budget_events(queue_id,owner_id,recipient_key,created_at)
 VALUES(NEW.id,NEW.created_by,md5(recipient),now());
 RETURN NEW;
END; $$;


--
-- Name: poll_mail_preference_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_mail_preference_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NEW.cooldown_action_key='poll:share' AND NOT public._contact_mail_enabled(NEW.to_email) THEN RETURN NULL; END IF;
 RETURN NEW;
END; $$;


--
-- Name: poll_my_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_my_email"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT public._norm_email(u.email) FROM auth.users u WHERE u.id=auth.uid() AND public._poll_identity_regular(u.id,to_jsonb(u));
$$;


--
-- Name: poll_on_login(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_on_login"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- claim email-only records to user on login
  perform public.poll_claim_email_records();

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: poll_open("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_open"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  PERFORM public._poll_open_unchecked(p_game_id, p_key);
END $$;


--
-- Name: poll_points_close_and_normalize("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_points_close_and_normalize"("p_game_id" "uuid", "p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  PERFORM public._poll_points_close_unchecked(p_game_id, p_key);
END $$;


--
-- Name: poll_points_tally("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_points_tally"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
  v_chk jsonb;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type <> 'poll_points' THEN
    RAISE EXCEPTION 'wrong_type';
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;

  v_chk := public.game_poll_close_check(p_game_id);
  IF NOT coalesce((v_chk->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'poll_close_blocked:%:%', coalesce(v_chk->>'code', 'unknownType'),
      coalesce(v_chk->'params'->>'ord', '')
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._poll_points_normalize(p_game_id);
  PERFORM public._poll_finish_tally(p_game_id);

  RETURN jsonb_build_object('ok', true, 'status', 'ready');
END $$;


--
-- Name: poll_points_vote("uuid", "text", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_points_vote"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g public.games%rowtype;
  s_id uuid;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select * into g
  from public.games
  where id = p_game_id;

  if not found then
    raise exception 'Game not found';
  end if;

  if g.share_key_poll <> p_key then
    raise exception 'Invalid poll key';
  end if;

  if g.type <> 'poll_points'::game_type then
    raise exception 'Wrong game type';
  end if;

  if g.status <> 'poll_open'::game_status then
    raise exception 'Poll is not open';
  end if;

  select ps.id into s_id
  from public.poll_sessions ps
  where ps.game_id = p_game_id
    and ps.question_id = p_question_id
    and ps.is_open = true
  order by ps.created_at desc
  limit 1;

  if s_id is null then
    raise exception 'No open session';
  end if;

  insert into public.poll_votes (game_id, poll_session_id, question_id, answer_id, voter_token, question_ord, answer_ord)
  select
    p_game_id,
    s_id,
    q.id,
    a.id,
    p_voter_token,
    q.ord,
    a.ord
  from public.questions q
  join public.answers a on a.question_id = q.id
  where q.id = p_question_id
    and q.game_id = p_game_id
    and a.id = p_answer_id;

  if not found then
    raise exception 'Invalid question/answer';
  end if;
end;
$$;


--
-- Name: poll_points_vote_batch("uuid", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_points_vote_batch"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  it jsonb;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for it in
    select * from jsonb_array_elements(p_items)
  loop
    perform public.poll_points_vote(
      p_game_id      => p_game_id,
      p_key          => p_key,
      p_question_id  => (it->>'question_id')::uuid,
      p_answer_id    => (it->>'answer_id')::uuid,
      p_voter_token  => p_voter_token
    );
  end loop;
  perform public._poll_task_finish_batch(p_game_id,p_key,p_voter_token);

end;
$$;


--
-- Name: poll_points_vote_batch_owner("uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_points_vote_batch_owner"("p_game_id" "uuid", "p_items" "jsonb", "p_voter_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  -- 315: tylko otwarta ankieta (zatrzymana nie przyjmuje głosów)
  if (select status from games where id=p_game_id) <> 'poll_open' then
    raise exception 'Game not open';
  end if;

  perform public._poll_assert_voter(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);

  insert into poll_votes (
    game_id,
    poll_session_id,
    question_id,
    answer_id,
    voter_token,
    question_ord,
    answer_ord
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    (x->>'answer_id')::uuid,
    p_voter_token,
    coalesce((x->>'question_ord')::int, 1),
    coalesce((x->>'answer_ord')::int, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  perform public._poll_task_finish_batch(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);
  return true;
end;
$$;


--
-- Name: poll_results("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_results"("p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  gid uuid;
  out jsonb;
begin
  select g.id into gid
  from public.games g
  where g.share_key_control = p_key
     or g.share_key_host = p_key
  limit 1;

  if gid is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  select jsonb_build_object(
    'ok', true,
    'game_id', gid,
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'question_ord', pv.question_ord,
          'answers', (
            select jsonb_agg(
              jsonb_build_object(
                'answer_ord', x.answer_ord,
                'count', x.cnt
              ) order by x.cnt desc, x.answer_ord asc
            )
            from (
              select answer_ord, count(*) cnt
              from public.poll_votes
              where game_id = gid and question_ord = pv.question_ord
              group by answer_ord
            ) x
          )
        ) order by pv.question_ord
      )
      from (select distinct question_ord from public.poll_votes where game_id = gid) pv
    ), '[]'::jsonb)
  ) into out;

  return out;
end $$;


--
-- Name: poll_resume("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_resume"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status = 'poll_open' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', 'poll_open');
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;

  UPDATE public.games SET status = 'poll_open', updated_at = now() WHERE id = p_game_id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', 'poll_open');
END $$;


--
-- Name: poll_share_panel("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_share_panel"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid:=auth.uid(); g public.games%rowtype; fs jsonb; ss jsonb; ts jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id AND owner_id=uid;
 IF uid IS NULL OR NOT FOUND OR g.type::text NOT IN ('poll_text','poll_points') THEN
  RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,
  'email_enabled',public._contact_mail_enabled(f.email),
  'cooldown_until',public._poll_mail_cooldown_until(uid,f.user_id,f.email,p_game_id)) ORDER BY f.label),'[]'::jsonb)
 INTO fs FROM public.friends_list() f WHERE f.status='active' AND f.direction='friend';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'email',s.subscriber_email,
  'email_enabled',public._contact_mail_enabled(s.subscriber_email),
  'cooldown_until',public._poll_mail_cooldown_until(uid,NULL,s.subscriber_email,p_game_id)) ORDER BY s.subscriber_email),'[]'::jsonb)
 INTO ss FROM public.poll_subscriptions s WHERE s.owner_id=uid AND s.status='active' AND s.subscriber_user_id IS NULL
  AND s.registered_user_id IS NULL AND public._poll_registered_uid(s.subscriber_email) IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'recipient_user_id',t.recipient_user_id,'recipient_email',t.recipient_email,
  'label',coalesce(nullif(p.username,''),public._norm_email(u.email),t.recipient_email),'status',t.status,'share_key_poll',t.share_key_poll,
  'reminder_count',t.reminder_count,'declined_at',t.declined_at,'cancelled_at',t.cancelled_at,
  'hidden',t.status='cancelled' OR (t.status='declined' AND t.declined_at<=now()-interval '5 days'),
  'email_enabled',public._contact_mail_enabled(coalesce(public._norm_email(u.email),t.recipient_email)),
  'cooldown_until',public._poll_mail_cooldown_until(uid,t.recipient_user_id,coalesce(public._norm_email(u.email),t.recipient_email),p_game_id))
 ORDER BY t.created_at DESC),'[]'::jsonb) INTO ts
 FROM public.poll_tasks t LEFT JOIN public.profiles p ON p.id=t.recipient_user_id LEFT JOIN auth.users u ON u.id=t.recipient_user_id
 WHERE t.game_id=p_game_id AND t.owner_id=uid AND t.share_key_poll=g.share_key_poll
  AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL);
 RETURN jsonb_build_object('ok',true,'friends',fs,'subscribers',ss,'tasks',ts);
END; $$;


--
-- Name: poll_share_remind("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_share_remind"("p_game_id" "uuid", "p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE result jsonb; item jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_poll_share_remind(p_game_id,p_task_id);
 IF result->>'ok'='true' THEN FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP PERFORM public._mail_allocate_notification('poll',(item->>'task_id')::uuid,'poll:share'); END LOOP; END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: poll_share_remove("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_share_remove"("p_game_id" "uuid", "p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE t public.poll_tasks%rowtype; g public.games%rowtype; uid uuid:=auth.uid(); voter text;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id AND owner_id=uid FOR UPDATE;
 IF uid IS NULL OR NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE id=p_task_id AND game_id=p_game_id AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','task_not_found'); END IF;
 voter:=public.poll_task_voter_token(t.id);
 DELETE FROM public.poll_votes WHERE game_id=p_game_id AND voter_token=voter;
 DELETE FROM public.poll_text_entries WHERE game_id=p_game_id AND voter_token=voter;
 -- Keep refusal history for this run, even after sender removes its visible row.
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=coalesce(cancelled_at,now()) WHERE id=t.id;
 RETURN jsonb_build_object('ok',true);
END; $$;


--
-- Name: poll_share_send("uuid", "uuid"[], "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_share_send"("p_game_id" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE result jsonb; item jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_poll_share_send(p_game_id,p_friend_ids,p_subscriber_ids);
 IF result->>'ok'='true' THEN FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'mail','[]'::jsonb)) LOOP PERFORM public._mail_allocate_notification('poll',(item->>'task_id')::uuid,'poll:share'); END LOOP; END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: poll_state("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_state"("p_game_id" "uuid", "p_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  g record;
  v_state text;
BEGIN
  SELECT id, type::text AS type, status::text AS status, share_key_poll, poll_ended_key
    INTO g
  FROM public.games WHERE id = p_game_id;

  IF NOT FOUND OR g.type NOT IN ('poll_text', 'poll_points') THEN
    RETURN jsonb_build_object('ok', true, 'state', 'not_found');
  END IF;

  IF p_key IS NOT NULL AND g.share_key_poll = p_key THEN
    v_state := CASE g.status
      WHEN 'poll_open' THEN 'open'
      WHEN 'poll_stopped' THEN 'stopped'
      WHEN 'ready' THEN 'ended'
      ELSE 'draft'
    END;
  ELSIF p_key IS NOT NULL AND g.poll_ended_key IS NOT NULL AND g.poll_ended_key = p_key AND g.status = 'ready' THEN
    v_state := 'ended';
  ELSE
    v_state := 'expired';
  END IF;

  RETURN jsonb_build_object('ok', true, 'state', v_state, 'type', g.type);
END $$;


--
-- Name: poll_stop("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_stop"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type NOT IN ('poll_text', 'poll_points') THEN
    RAISE EXCEPTION 'not_a_poll';
  END IF;
  IF v_status = 'poll_stopped' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', 'poll_stopped');
  END IF;
  IF v_status <> 'poll_open' THEN
    RAISE EXCEPTION 'poll_not_open';
  END IF;

  UPDATE public.games SET status = 'poll_stopped', updated_at = now() WHERE id = p_game_id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', 'poll_stopped');
END $$;


--
-- Name: poll_sub_accept_email("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_sub_accept_email"("p_token" "uuid", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  e text := public._norm_email(p_email);
  s public.poll_subscriptions%rowtype;
  deadline timestamptz;
BEGIN
  IF e IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','missing_email');
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
  IF FOUND THEN
    PERFORM public._poll_identity_email_refs(ARRAY[s.subscriber_email],ARRAY[s.owner_id,s.subscriber_user_id,s.registered_user_id,auth.uid()]);
    PERFORM public._subscriber_pair_lock(s.owner_id,s.subscriber_email);
  END IF;
  SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_token');
  END IF;
  IF s.subscriber_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','registered_invite_requires_login');
  END IF;
  IF s.cancelled_at IS NOT NULL OR s.declined_at IS NOT NULL OR s.status NOT IN ('pending','active') THEN
    RETURN jsonb_build_object('ok',false,'error','already_closed');
  END IF;
  -- Match the address also on idempotent acceptance of an active invitation.
  IF public._norm_email(s.subscriber_email) IS DISTINCT FROM e THEN
    RETURN jsonb_build_object('ok',false,'error','email_mismatch');
  END IF;
  IF s.registered_user_id IS NOT NULL OR public._poll_registered_uid(e) IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','has_account');
  END IF;
  IF NOT public._contact_mail_enabled(e) THEN RETURN jsonb_build_object('ok',false,'error','notifications_disabled'); END IF;
  deadline:=public._subscriber_refusal_until(s.owner_id,e);
  IF deadline IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','cooldown','cooldown_until',deadline); END IF;
  IF s.status='active' THEN
    RETURN jsonb_build_object('ok',true,'kind','sub','action','accept','note','already_active');
  END IF;
  UPDATE public.poll_subscriptions SET status='active',
    accepted_at=coalesce(accepted_at,now()), opened_at=coalesce(opened_at,now())
    WHERE id=s.id;
  RETURN jsonb_build_object('ok',true,'kind','sub','action','accept');
END;
$$;


--
-- Name: poll_sub_decline("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_sub_decline"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ok boolean;
begin
  -- istniejąca funkcja (z Twojego schematu) zwraca boolean
  ok := public.poll_go_sub_decline(p_token);

  if ok then
    return jsonb_build_object('ok', true, 'kind', 'sub', 'action', 'decline');
  end if;

  return jsonb_build_object('ok', false, 'error', 'invalid_or_unavailable_token', 'kind', 'sub', 'action', 'decline');
end;
$$;


--
-- Name: poll_sub_unsubscribe("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_sub_unsubscribe"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE s public.poll_subscriptions%rowtype; label text;
BEGIN
 SELECT * INTO s FROM public.poll_subscriptions WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 IF NOT public._subscriber_close(p_token,true) THEN RETURN jsonb_build_object('ok',false,'error','already_inactive'); END IF;
 SELECT username INTO label FROM public.profiles WHERE id=s.owner_id;
 RETURN jsonb_build_object('ok',true,'owner_label',coalesce(label,''));
END; $$;


--
-- Name: poll_task_decline("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_task_decline"("p_token" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT public._poll_task_change(p_token,'decline') $$;


--
-- Name: poll_task_done("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_task_done"("p_token" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT public._poll_task_change(p_token,'done') $$;


--
-- Name: poll_task_opened("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_task_opened"("p_token" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT public._poll_task_change(p_token,'open') $$;


--
-- Name: poll_task_resolve("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_task_resolve"("p_token" "uuid", "p_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
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


--
-- Name: poll_task_send("uuid", "text", "text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_task_send"("p_game_id" "uuid", "p_poll_type" "text", "p_recipients" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_key text;
  v_skipped int := 0;

  r text;
  v_rec text;
  v_user_id uuid;
  v_email text;
  v_username text;
  v_token uuid;

  j_email jsonb := '[]'::jsonb;
  j_onsite jsonb := '[]'::jsonb;
begin
  -- key z gry
  select g.share_key_poll into v_key
  from public.games g
  where g.id = p_game_id
  limit 1;

  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'game not found');
  end if;

  if p_poll_type not in ('poll_text','poll_points') then
    return jsonb_build_object('ok', false, 'error', 'bad poll_type');
  end if;

  foreach r in array coalesce(p_recipients, array[]::text[]) loop
    v_rec := lower(trim(coalesce(r,'')));
    if v_rec = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_user_id := null;
    v_email := null;
    v_username := null;

    -- username
    select id, email, username into v_user_id, v_email, v_username
    from public.profiles
    where lower(username) = v_rec
    limit 1;

    -- email
    if v_user_id is null then
      select id, email, username into v_user_id, v_email, v_username
      from public.profiles
      where lower(email) = v_rec
      limit 1;
    end if;

    if v_email is null then
      v_email := v_rec;
    end if;

    -- dedupe: już istnieje task do tej gry/poll_type dla user/email w statusach aktywnych
    if exists (
      select 1
      from public.poll_tasks t
      where t.game_id = p_game_id
        and t.poll_type = p_poll_type
        and t.owner_id = auth.uid()
        and (
          (v_user_id is not null and t.recipient_user_id = v_user_id)
          or (t.recipient_email is not null and lower(t.recipient_email) = v_email)
        )
        and t.status in ('pending','opened','done')
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.poll_tasks(
      owner_id, recipient_user_id, recipient_email,
      game_id, poll_type, share_key_poll, status
    )
    values(
      auth.uid(), v_user_id, v_email,
      p_game_id, p_poll_type, v_key, 'pending'
    )
    returning token into v_token;

    if v_user_id is not null then
      j_onsite := j_onsite || jsonb_build_array(
        jsonb_build_object(
          'user_id', v_user_id,
          'email', v_email,
          'username', v_username,
          'token', v_token
        )
      );
    else
      j_email := j_email || jsonb_build_array(
        jsonb_build_object(
          'email', v_email,
          'token', v_token
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'email', j_email,
    'onsite', j_onsite,
    'skipped', v_skipped
  );
end;
$$;


--
-- Name: poll_task_voter_token("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_task_voter_token"("p_task_id" "uuid") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT 'task:' || p_task_id::text
$$;


--
-- Name: poll_tasks_touch_status_ts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_tasks_touch_status_ts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'opened' and new.opened_at is null then
      new.opened_at := now();
    end if;

    if new.status = 'done' and new.done_at is null then
      new.done_at := now();
    end if;

    if new.status = 'declined' and new.declined_at is null then
      new.declined_at := now();
    end if;

    if new.status = 'cancelled' and new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: poll_text_close_apply("uuid", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_close_apply"("p_game_id" "uuid", "p_key" "text", "p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);
  PERFORM public._poll_text_close_unchecked(p_game_id, p_key, p_payload);
END $$;


--
-- Name: poll_text_submit("uuid", "text", "uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_submit"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_voter_token" "text", "p_answer_raw" "text", "p_answer_norm" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g public.games%rowtype;
  s_id uuid;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select * into g
  from public.games
  where id = p_game_id;

  if not found then
    raise exception 'Game not found';
  end if;

  if g.share_key_poll <> p_key then
    raise exception 'Invalid poll key';
  end if;

  if g.type <> 'poll_text'::game_type then
    raise exception 'Wrong game type';
  end if;

  if g.status <> 'poll_open'::game_status then
    raise exception 'Poll is not open';
  end if;

  select ps.id into s_id
  from public.poll_sessions ps
  where ps.game_id = p_game_id
    and ps.question_id = p_question_id
    and ps.is_open = true
  order by ps.created_at desc
  limit 1;

  if s_id is null then
    raise exception 'No open session';
  end if;

  insert into public.poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
  values (p_game_id, s_id, p_question_id, p_voter_token, p_answer_raw, p_answer_norm);
end;
$$;


--
-- Name: poll_text_submit_batch("uuid", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_submit_batch"("p_game_id" "uuid", "p_key" "text", "p_voter_token" "text", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  it jsonb;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for it in
    select * from jsonb_array_elements(p_items)
  loop
    perform public.poll_text_submit(
      p_game_id      => p_game_id,
      p_key          => p_key,
      p_question_id  => (it->>'question_id')::uuid,
      p_voter_token  => p_voter_token,
      p_answer_raw   => it->>'answer_raw',
      p_answer_norm  => it->>'answer_norm'
    );
  end loop;
  perform public._poll_task_finish_batch(p_game_id,p_key,p_voter_token);

end;
$$;


--
-- Name: poll_text_submit_batch_owner("uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_submit_batch_owner"("p_game_id" "uuid", "p_items" "jsonb", "p_voter_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  -- 315: tylko otwarta ankieta (zatrzymana nie przyjmuje wpisów)
  if (select status from games where id=p_game_id) <> 'poll_open' then
    raise exception 'Game not open';
  end if;

  perform public._poll_assert_voter(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);

  insert into poll_text_entries (
    game_id,
    poll_session_id,
    question_id,
    voter_token,
    answer_raw,
    answer_norm
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    p_voter_token,
    coalesce(x->>'answer_raw',''),
    coalesce(x->>'answer_norm','')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  perform public._poll_task_finish_batch(p_game_id,(select share_key_poll from public.games where id=p_game_id),p_voter_token);
  return true;
end;
$$;


--
-- Name: poll_text_submit_simple_legacy("uuid", "text", "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_submit_simple_legacy"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_voter_token" "text", "p_answer_text" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  perform public.poll_text_submit(
    p_game_id,
    p_key,
    p_question_id,
    p_voter_token,
    p_answer_text,
    p_answer_text
  );
end;
$$;


--
-- Name: FUNCTION "poll_text_submit_simple_legacy"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_voter_token" "text", "p_answer_text" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."poll_text_submit_simple_legacy"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_voter_token" "text", "p_answer_text" "text") IS 'LEGACY wrapper: maps old poll_text_submit(..., answer_text) to poll_text_submit(..., raw, norm).';


--
-- Name: poll_text_tally_apply("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_tally_apply"("p_game_id" "uuid", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
  q record;
  item jsonb;
  v_all jsonb := '{}'::jsonb;
  v_ans jsonb;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type <> 'poll_text' THEN
    RAISE EXCEPTION 'wrong_type';
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  -- najpierw policz i zwaliduj wszystkie pytania, dopiero potem zapisuj
  FOR q IN SELECT id, ord FROM public.questions WHERE game_id = p_game_id ORDER BY ord LOOP
    SELECT i INTO item
    FROM jsonb_array_elements(p_payload->'items') AS i
    WHERE i->>'question_id' = q.id::text
    LIMIT 1;

    SELECT coalesce(jsonb_agg(jsonb_build_object('text', c.atext, 'points', c.points) ORDER BY c.ord), '[]'::jsonb)
      INTO v_ans
    FROM public._poll_text_tally_points(item->'answers') c;

    IF item IS NULL OR jsonb_array_length(v_ans) < 3 THEN
      RAISE EXCEPTION 'poll_close_blocked:closeMinText:%', q.ord USING ERRCODE = 'P0001';
    END IF;

    v_all := v_all || jsonb_build_object(q.id::text, v_ans);
  END LOOP;

  FOR q IN SELECT id FROM public.questions WHERE game_id = p_game_id LOOP
    DELETE FROM public.answers WHERE question_id = q.id;
    INSERT INTO public.answers (question_id, ord, text, fixed_points)
    SELECT q.id, a.i, a.x->>'text', (a.x->>'points')::int
    FROM jsonb_array_elements(v_all->(q.id::text)) WITH ORDINALITY AS a(x, i);
  END LOOP;

  PERFORM public._poll_finish_tally(p_game_id);

  RETURN jsonb_build_object('ok', true, 'status', 'ready');
END $$;


--
-- Name: poll_text_tally_draft_get("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_tally_draft_get"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  d record;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.status::text INTO v_status FROM public.games g WHERE g.id = p_game_id;
  IF v_status <> 'poll_stopped' THEN
    RETURN jsonb_build_object('draft', NULL, 'saved_at', NULL);
  END IF;

  SELECT t.draft, t.updated_at INTO d FROM public.poll_tally_drafts t WHERE t.game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('draft', NULL, 'saved_at', NULL);
  END IF;
  RETURN jsonb_build_object('draft', d.draft, 'saved_at', d.updated_at);
END $$;


--
-- Name: poll_text_tally_draft_save("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_text_tally_draft_save"("p_game_id" "uuid", "p_draft" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type text;
  v_status text;
  v_at timestamptz := now();
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT g.type::text, g.status::text INTO v_type, v_status
  FROM public.games g WHERE g.id = p_game_id FOR UPDATE;

  IF v_type <> 'poll_text' THEN
    RAISE EXCEPTION 'wrong_type';
  END IF;
  IF v_status <> 'poll_stopped' THEN
    RAISE EXCEPTION 'poll_not_stopped';
  END IF;

  IF p_draft IS NULL OR p_draft = 'null'::jsonb THEN
    DELETE FROM public.poll_tally_drafts WHERE game_id = p_game_id;
    RETURN jsonb_build_object('ok', true, 'saved_at', NULL);
  END IF;
  IF octet_length(p_draft::text) > 524288 THEN
    RAISE EXCEPTION 'draft_too_large';
  END IF;

  INSERT INTO public.poll_tally_drafts (game_id, draft, updated_at)
  VALUES (p_game_id, p_draft, v_at)
  ON CONFLICT (game_id) DO UPDATE SET draft = excluded.draft, updated_at = excluded.updated_at;

  RETURN jsonb_build_object('ok', true, 'saved_at', v_at);
END $$;


--
-- Name: poll_vote("text", integer, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_vote"("p_key" "text", "p_question_ord" integer, "p_answer_ord" integer, "p_voter_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  gid uuid;
  gtype public.game_type;
  gst public.game_status;
begin
  select g.id, g.type, g.status
  into gid, gtype, gst
  from public.games g
  where g.share_key_poll = p_key
  limit 1;

  if gid is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  if gtype = 'prepared' then
    return jsonb_build_object('ok', false, 'reason', 'no_poll');
  end if;

  if gst <> 'poll_open' then
    return jsonb_build_object('ok', false, 'reason', 'poll_closed');
  end if;

  perform public._poll_assert_voter(gid,p_key,p_voter_token);

  insert into public.poll_votes(game_id, question_ord, answer_ord, voter_token)
  values (gid, p_question_ord, p_answer_ord, p_voter_token)
  on conflict (game_id, question_ord, voter_token)
  do update set
    answer_ord = excluded.answer_ord,
    created_at = now();

  return jsonb_build_object('ok', true);
end $$;


--
-- Name: poll_vote_by_ids_legacy("uuid", "text", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_vote_by_ids_legacy"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- keep behavior identical to the "by ids" vote path:
  -- use the existing "poll_vote_game" which you have
  perform public.poll_vote_game(p_game_id, p_key, p_question_id, p_answer_id, p_voter_token);
end;
$$;


--
-- Name: FUNCTION "poll_vote_by_ids_legacy"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."poll_vote_by_ids_legacy"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") IS 'LEGACY: vote by ids (game_id/question_id/answer_id). Prefer poll_vote(key, ord, ord, voter_token).';


--
-- Name: poll_vote_game("uuid", "text", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_vote_game"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g public.games;
  sess public.poll_sessions;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;
  if g.share_key_poll <> p_key then raise exception 'forbidden'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  -- aktywna sesja per pytanie (poll_sessions już masz)
  select * into sess
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if not found then
    insert into public.poll_sessions(game_id, question_id, is_open)
    values (p_game_id, p_question_id, true)
    returning * into sess;
  end if;

  insert into public.poll_votes(poll_session_id, voter_token, answer_id)
  values (sess.id, p_voter_token, p_answer_id)
  on conflict (poll_session_id, voter_token)
  do update set answer_id = excluded.answer_id;
end $$;


--
-- Name: poll_vote_points("uuid", "text", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."poll_vote_points"("p_game_id" "uuid", "p_key" "text", "p_question_id" "uuid", "p_answer_id" "uuid", "p_voter_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  g record;
  sid uuid;
begin
  perform public._poll_assert_voter(p_game_id,p_key,p_voter_token);
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then raise exception 'game not found'; end if;
  if g.share_key_poll is distinct from p_key then raise exception 'bad key'; end if;
  if g.type <> 'poll_points' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  select id into sid
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if sid is null then raise exception 'poll closed'; end if;

  insert into public.poll_votes(game_id, poll_session_id, question_id, answer_id, voter_token)
  values (p_game_id, sid, p_question_id, p_answer_id, p_voter_token)
  on conflict (poll_session_id, question_id, voter_token)
  do update set
    answer_id = excluded.answer_id,
    created_at = now();
end;
$$;


--
-- Name: polls_action("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_action"("p_kind" "text", "p_token" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r jsonb;
begin
  -- Jedyny kierunek delegacji:
  r := public.poll_action(p_kind, p_token, p_action);
  return r;
end;
$$;


--
-- Name: polls_hub_anon_voters("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_anon_voters"("p_game_id" "uuid", "p_poll_type" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  qn int := 0;
  tok_cnt int := 0;
  legacy_rows int := 0;
  legacy_est int := 0;
  base_cnt int := 0;

  fp_sum numeric := 0;
  fp_est int := 0;
BEGIN
  SELECT count(*)::int INTO qn
  FROM public.questions
  WHERE game_id = p_game_id;

  IF p_poll_type = 'poll_points' THEN
    -- NOWE: tokeny anonimowe (per gra)
    SELECT count(DISTINCT v.voter_token)::int INTO tok_cnt
    FROM public.poll_votes v
    WHERE v.game_id = p_game_id
      AND v.voter_user_id IS NULL
      AND v.voter_token IS NOT NULL
      AND v.voter_token <> ''
      AND v.voter_token NOT LIKE 'task:%';

    -- STARE: brak tokena / pusty token (legacy)
    SELECT count(*)::int INTO legacy_rows
    FROM public.poll_votes v
    WHERE v.game_id = p_game_id
      AND v.voter_user_id IS NULL
      AND (v.voter_token IS NULL OR v.voter_token = '');

  ELSIF p_poll_type = 'poll_text' THEN
    -- NOWE: tokeny anonimowe (per gra)
    SELECT count(DISTINCT e.voter_token)::int INTO tok_cnt
    FROM public.poll_text_entries e
    WHERE e.game_id = p_game_id
      AND e.voter_user_id IS NULL
      AND e.voter_token IS NOT NULL
      AND e.voter_token <> ''
      AND e.voter_token NOT LIKE 'task:%';

    -- STARE: brak tokena / pusty token (legacy)
    SELECT count(*)::int INTO legacy_rows
    FROM public.poll_text_entries e
    WHERE e.game_id = p_game_id
      AND e.voter_user_id IS NULL
      AND (e.voter_token IS NULL OR e.voter_token = '');
  ELSE
    tok_cnt := 0;
    legacy_rows := 0;
  END IF;

  -- legacy est: total legacy rows / liczba pytań (ceil), min 1 jeśli cokolwiek jest
  IF legacy_rows > 0 AND qn > 0 THEN
    legacy_est := GREATEST(1, CEIL(legacy_rows::numeric / qn::numeric))::int;
  ELSE
    legacy_est := 0;
  END IF;

  base_cnt := tok_cnt + legacy_est;

  -- ✅ fallback: jeśli dalej 0 -> fixed_points sum / liczba pytań
  IF base_cnt = 0 AND qn > 0 THEN
    SELECT coalesce(sum(a.fixed_points), 0)::numeric INTO fp_sum
    FROM public.answers a
    JOIN public.questions q ON q.id = a.question_id
    WHERE q.game_id = p_game_id;

    IF fp_sum > 0 THEN
      fp_est := CEIL(fp_sum / qn::numeric)::int;
      base_cnt := fp_est;
    END IF;
  END IF;

  RETURN base_cnt;
END;
$$;


--
-- Name: polls_hub_anon_voters_poll_points("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_anon_voters_poll_points"("p_game_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  qn int;
  v_new int;
  v_legacy_rows int;
  v_legacy_est int;
BEGIN
  SELECT count(*)::int INTO qn
  FROM public.questions q
  WHERE q.game_id = p_game_id;

  -- new style: distinct voter_token (anon only), exclude task:* (bo to nie są anon w hubie)
  SELECT count(DISTINCT v.voter_token)::int INTO v_new
  FROM public.poll_votes v
  WHERE v.game_id = p_game_id
    AND v.voter_user_id IS NULL
    AND NULLIF(btrim(v.voter_token), '') IS NOT NULL
    AND v.voter_token NOT LIKE 'task:%';

  -- legacy: missing token (NULL/empty)
  SELECT count(*)::int INTO v_legacy_rows
  FROM public.poll_votes v
  WHERE v.game_id = p_game_id
    AND v.voter_user_id IS NULL
    AND NULLIF(btrim(v.voter_token), '') IS NULL;

  v_legacy_est := CASE
    WHEN COALESCE(qn, 0) > 0 AND COALESCE(v_legacy_rows, 0) > 0
      THEN CEIL((v_legacy_rows::numeric) / NULLIF(qn::numeric, 0))::int
    ELSE 0
  END;

  RETURN COALESCE(v_new, 0) + COALESCE(v_legacy_est, 0);
END;
$$;


--
-- Name: polls_hub_anon_voters_poll_text("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_anon_voters_poll_text"("p_game_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  qn int;
  v_new int;
  v_legacy_rows int;
  v_legacy_est int;
BEGIN
  SELECT count(*)::int INTO qn
  FROM public.questions q
  WHERE q.game_id = p_game_id;

  SELECT count(DISTINCT e.voter_token)::int INTO v_new
  FROM public.poll_text_entries e
  WHERE e.game_id = p_game_id
    AND e.voter_user_id IS NULL
    AND NULLIF(btrim(e.voter_token), '') IS NOT NULL
    AND e.voter_token NOT LIKE 'task:%';

  SELECT count(*)::int INTO v_legacy_rows
  FROM public.poll_text_entries e
  WHERE e.game_id = p_game_id
    AND e.voter_user_id IS NULL
    AND NULLIF(btrim(e.voter_token), '') IS NULL;

  v_legacy_est := CASE
    WHEN COALESCE(qn, 0) > 0 AND COALESCE(v_legacy_rows, 0) > 0
      THEN CEIL((v_legacy_rows::numeric) / NULLIF(qn::numeric, 0))::int
    ELSE 0
  END;

  RETURN COALESCE(v_new, 0) + COALESCE(v_legacy_est, 0);
END;
$$;


--
-- Name: polls_hub_can_close("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_can_close"("p_game_id" "uuid", "p_poll_type" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Nie zamykamy jeśli są jeszcze aktywne taski (niezagłosowane): X != Y
  IF EXISTS (
    SELECT 1
    FROM public.poll_tasks t
    WHERE t.owner_id = auth.uid()
      AND t.game_id = p_game_id
      AND t.done_at IS NULL
      AND t.declined_at IS NULL
      AND t.cancelled_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN CASE
    WHEN p_poll_type = 'poll_points' THEN public.polls_hub_can_close_poll_points(p_game_id)
    WHEN p_poll_type = 'poll_text'   THEN public.polls_hub_can_close_poll_text(p_game_id)
    ELSE FALSE
  END;
END;
$$;


--
-- Name: polls_hub_can_close_poll_points("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_can_close_poll_points"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  q record;
  sid uuid;
  strong_cnt int;
BEGIN
  FOR q IN
    SELECT id FROM public.questions WHERE game_id = p_game_id ORDER BY ord
  LOOP
    -- ostatnia sesja dla pytania (jak w polls.js)
    SELECT ps.id
      INTO sid
    FROM public.poll_sessions ps
    WHERE ps.game_id = p_game_id AND ps.question_id = q.id
    ORDER BY ps.created_at DESC
    LIMIT 1;

    IF sid IS NULL THEN
      RETURN FALSE;
    END IF;

    /*
      poll.js:
        - bierzemy tylko votes z answer_id != null
        - counts tylko dla odpowiedzi z count>0
        - normalizacja do 100 przez floor + największe reszty (diff>0)
        - strong = points>=3
        - strong_cnt>=3
    */
    WITH counts AS (
      SELECT v.answer_id, count(*)::int AS cnt
      FROM public.poll_votes v
      WHERE v.game_id = p_game_id
        AND v.question_id = q.id
        AND v.poll_session_id = sid
        AND v.answer_id IS NOT NULL
      GROUP BY v.answer_id
      HAVING count(*) > 0
    ),
    total AS (
      SELECT sum(cnt)::numeric AS s FROM counts
    ),
    raw AS (
      SELECT
        answer_id,
        cnt,
        (100 * cnt::numeric) / NULLIF((SELECT s FROM total), 0) AS pct
      FROM counts
    ),
    floored AS (
      SELECT
        answer_id,
        cnt,
        pct,
        floor(pct)::int AS pts,
        (pct - floor(pct)) AS frac
      FROM raw
    ),
    sum_floor AS (
      SELECT coalesce(sum(pts), 0)::int AS s FROM floored
    ),
    diff AS (
      SELECT (100 - (SELECT s FROM sum_floor))::int AS d
    ),
    ranked AS (
      SELECT
        f.*,
        row_number() OVER (ORDER BY f.frac DESC, f.answer_id) AS rn
      FROM floored f
    ),
    distributed AS (
      SELECT
        answer_id,
        (pts + CASE WHEN (SELECT d FROM diff) > 0 AND rn <= (SELECT d FROM diff) THEN 1 ELSE 0 END)::int AS p_final
      FROM ranked
    )
    SELECT count(*)::int
      INTO strong_cnt
    FROM distributed
    WHERE p_final >= 3;

    -- jeśli nie ma żadnych głosów (counts puste) => distributed puste => strong_cnt=0 => FALSE
    IF COALESCE(strong_cnt, 0) < 3 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;


--
-- Name: polls_hub_can_close_poll_text("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_can_close_poll_text"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  q record;
  sid uuid;
  uniq_cnt int;
BEGIN
  FOR q IN
    SELECT id FROM public.questions WHERE game_id = p_game_id ORDER BY ord
  LOOP
    SELECT ps.id
      INTO sid
    FROM public.poll_sessions ps
    WHERE ps.game_id = p_game_id AND ps.question_id = q.id
    ORDER BY ps.created_at DESC
    LIMIT 1;

    IF sid IS NULL THEN
      RETURN FALSE;
    END IF;

    SELECT count(DISTINCT btrim(e.answer_norm))::int
      INTO uniq_cnt
    FROM public.poll_text_entries e
    WHERE e.game_id = p_game_id
      AND e.question_id = q.id
      AND e.poll_session_id = sid
      AND NULLIF(btrim(e.answer_norm), '') IS NOT NULL;

    IF COALESCE(uniq_cnt, 0) < 3 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;


--
-- Name: polls_hub_gc(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_gc"("p_days" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
with
  del_subs as (
    delete from poll_subscriptions
    where owner_id = auth.uid()
      and status in ('pending','declined','cancelled')
      and created_at < now() - (p_days || ' days')::interval
    returning 1
  ),
  del_tasks as (
    delete from poll_tasks
    where (owner_id = auth.uid() or recipient_user_id = auth.uid())
      and status in ('done','declined','cancelled')
      and coalesce(done_at, declined_at, cancelled_at, created_at) < now() - (p_days || ' days')::interval
    returning 1
  )
select jsonb_build_object(
  'ok', true,
  'subs_deleted', (select count(*) from del_subs),
  'tasks_deleted', (select count(*) from del_tasks)
);
$$;


--
-- Name: polls_hub_list_my_subscribers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_list_my_subscribers"() RETURNS TABLE("sub_id" "uuid", "subscriber_user_id" "uuid", "subscriber_email" "text", "subscriber_label" "text", "status" "text", "created_at" timestamp with time zone, "token" "uuid", "email_sent_at" timestamp with time zone, "email_send_count" integer, "is_expired" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with base as (
    select
      s.*,
      greatest(
        coalesce(s.declined_at,  '-infinity'::timestamptz),
        coalesce(s.cancelled_at, '-infinity'::timestamptz),
        coalesce(s.created_at,   '-infinity'::timestamptz)
      ) as last_action_at
    from public.poll_subscriptions s
    where s.owner_id = auth.uid()
  )
  select
    b.id as sub_id,
    b.subscriber_user_id,
    b.subscriber_email,
    case
      when b.subscriber_user_id is not null then coalesce(p.username, p.email, '—')
      else coalesce(b.subscriber_email, '—')
    end as subscriber_label,
    b.status,
    b.created_at,
    b.token,
    b.email_sent_at,
    b.email_send_count,
    (b.status in ('declined','cancelled') and b.last_action_at <= now() - interval '5 days') as is_expired
  from base b
  left join public.profiles p on p.id = b.subscriber_user_id
  where not (b.status in ('declined','cancelled') and b.last_action_at <= now() - interval '5 days')
  order by b.created_at desc;
end;
$$;


--
-- Name: polls_hub_list_open_polls(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_list_open_polls"() RETURNS TABLE("game_id" "uuid", "game_name" "text", "poll_type" "text", "status" "text", "updated_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select null::uuid, null::text, null::text, null::text, null::timestamptz where false
$$;


--
-- Name: polls_hub_list_polls(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_list_polls"() RETURNS TABLE("game_id" "uuid", "name" "text", "poll_type" "text", "poll_state" "text", "created_at" timestamp with time zone, "tasks_active" integer, "tasks_done" integer, "anon_votes" integer, "close_ready" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return query
  with g as (
    select
      gm.id as game_id,
      gm.name,
      gm.type as poll_type,  -- game_type enum
      case
        when gm.status = 'poll_open' then 'open'
        when gm.status = 'poll_stopped' then 'stopped'
        when gm.status = 'ready' then 'closed'
        else 'draft'
      end as poll_state,
      gm.created_at
    from public.games gm
    where gm.owner_id = auth.uid()
      and gm.type in ('poll_text','poll_points')
  ),
  t as (
    select
      pt.game_id,
      count(*) filter (where pt.done_at is null and pt.declined_at is null and pt.cancelled_at is null)::int as tasks_active,
      count(*) filter (where pt.done_at is not null)::int as tasks_done
    from public.poll_tasks pt
    where pt.owner_id = auth.uid()
    group by pt.game_id
  )
  select
    g.game_id,
    g.name,
    g.poll_type::text as poll_type, -- ✅ zwracamy text
    g.poll_state,
    g.created_at,
    coalesce(t.tasks_active,0) as tasks_active,
    coalesce(t.tasks_done,0) as tasks_done,
    public.polls_hub_anon_voters(g.game_id, g.poll_type::text) as anon_votes, -- ✅ cast
    (g.poll_state = 'open') and public.polls_hub_can_close(g.game_id, g.poll_type::text) as close_ready -- ✅ cast
  from g
  left join t on t.game_id = g.game_id
  order by g.created_at desc;
end;
$$;


--
-- Name: polls_hub_subscriber_remove("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_subscriber_remove"("p_id" "uuid") RETURNS "jsonb"
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

  PERFORM public._poll_identity_email_refs(ARRAY[v_sub.subscriber_email],ARRAY[v_uid,v_sub.subscriber_user_id,v_sub.registered_user_id]);
  PERFORM public._subscriber_pair_lock(v_uid,v_sub.subscriber_email);
  SELECT * INTO v_sub FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not found'); END IF;
  -- ✅ zamiast DELETE: oznacz jako cancelled i ustaw timestamp
  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id;

  -- E11b: usunięcie subskrybenta wycofuje jego czekające zaproszenia do ankiet tego właściciela
  delete from public.poll_tasks pt
  where pt.owner_id = v_uid
    and pt.status in ('pending', 'opened')
    and (pt.source_subscription_id=v_sub.id OR (pt.source_kind='game' AND ((v_sub.subscriber_user_id is not null and pt.recipient_user_id=v_sub.subscriber_user_id) OR (v_sub.subscriber_email is not null and public._norm_email(pt.recipient_email)=public._norm_email(v_sub.subscriber_email)))));

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: polls_hub_subscriber_resend("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_subscriber_resend"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_polls_hub_subscriber_resend(p_id);
 IF result->>'ok'='true' AND result->>'to' IS NOT NULL THEN PERFORM public._mail_allocate_notification('subscription',p_id,'poll:resend'); END IF;
 RETURN result;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: polls_hub_task_decline("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_task_decline"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE tok uuid;
BEGIN
 SELECT token INTO tok FROM public.poll_tasks WHERE id=p_task_id AND recipient_user_id=auth.uid();
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN public._poll_task_change(tok,'decline')='ok';
END; $$;


--
-- Name: polls_hub_tasks_mark_emailed("uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_hub_tasks_mark_emailed"("p_task_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_n integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  update public.poll_tasks
  set email_sent_at = now(),
      email_send_count = email_send_count + 1
  where owner_id = v_uid
    and id = any(coalesce(p_task_ids, array[]::uuid[]))
    and (recipient_email is not null or recipient_user_id is not null);

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$$;


--
-- Name: polls_vote_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."polls_vote_counts"() RETURNS TABLE("game_id" "uuid", "status" "text", "votes" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT g.id, g.status::text,
         CASE g.type
           WHEN 'poll_points' THEN
             (SELECT count(DISTINCT v.voter_token)::integer FROM public.poll_votes v WHERE v.game_id = g.id)
           ELSE
             (SELECT count(DISTINCT e.voter_token)::integer FROM public.poll_text_entries e WHERE e.game_id = g.id)
         END
  FROM public.games g
  WHERE g.owner_id = auth.uid()
    AND g.type IN ('poll_text', 'poll_points')
    AND g.status IN ('poll_open', 'poll_stopped');
$$;


--
-- Name: profile_login_to_email("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."profile_login_to_email"("p_login" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v text;
begin
  v := trim(coalesce(p_login, ''));
  if v = '' then
    return null;
  end if;

  if position('@' in v) > 0 then
    return lower(v);
  end if;

  select lower(u.email)
  into v
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(v)
  limit 1;

  if v is null then
    select lower(email)
    into v
    from public.profiles
    where lower(username) = lower(p_login)
    limit 1;
  end if;

  return v;
end;
$$;


--
-- Name: profiles_reserve_test_username(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."profiles_reserve_test_username"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE reason text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN RETURN NEW; END IF;
 reason:=public.reserved_username_reason(NEW.username);
 IF reason IS NULL THEN RETURN NEW; END IF;
 IF reason='test' AND btrim(NEW.username) ~* '^test[0-9]+$' AND EXISTS (
 SELECT 1 FROM auth.users u WHERE u.id=NEW.id
 AND lower(u.email)=lower(btrim(NEW.username))||'@familiada.online'
 ) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.reserved_username_accounts a WHERE a.user_id=NEW.id AND a.username=lower(btrim(NEW.username))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'username unavailable' USING ERRCODE='23505';
 RETURN NEW;
END $_$;


--
-- Name: questions_rules_state_stmt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."questions_rules_state_stmt"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct game_id) into v_ids from new_rows;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct game_id) into v_ids from old_rows;
  else
    select array_agg(distinct game_id) into v_ids
    from (select game_id from new_rows union select game_id from old_rows) x;
  end if;
  if v_ids is not null then
    perform public.games_rules_state_refresh(v_ids);
  end if;
  return null;
end;
$$;


--
-- Name: release_edit_lock("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: rename_resource_checked("text", "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rename_resource_checked"("p_resource_type" "text", "p_resource_id" "uuid", "p_name" "text", "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_blocker public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  if p_resource_type = 'game' then
    if not exists (select 1 from public.games where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;
    select * into v_blocker from public.edit_lock_blockers('game', p_resource_id, 'exclusive', p_tab_id) limit 1;
    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;
    update public.games set name = v_name where id = p_resource_id and owner_id = v_uid;

  elsif p_resource_type = 'base' then
    if not exists (select 1 from public.question_bases where id = p_resource_id and owner_id = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    end if;
    select * into v_blocker from public.edit_lock_blockers('base', p_resource_id, 'exclusive', p_tab_id) limit 1;
    if found then
      return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked');
    end if;
    update public.question_bases set name = v_name, updated_at = now()
     where id = p_resource_id and owner_id = v_uid;

  elsif p_resource_type = 'logo' then
    return public.update_logo_checked(p_resource_id, jsonb_build_object('name', v_name), p_tab_id);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_resource_type');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: request_display_audio_unlock("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."request_display_audio_unlock"("p_game_id" "uuid", "p_nonce" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.games WHERE id=p_game_id AND owner_id=auth.uid()
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_nonce IS NULL OR length(p_nonce)<8 OR length(p_nonce)>100 THEN
    RAISE EXCEPTION 'invalid nonce';
  END IF;
  INSERT INTO public.display_audio_unlock(
    game_id,session_nonce,request_nonce,acknowledged_nonce,requested_at,acknowledged_at
  ) VALUES(p_game_id,p_nonce,p_nonce,NULL,now(),NULL)
  ON CONFLICT(game_id) DO UPDATE SET request_nonce=EXCLUDED.request_nonce,
    acknowledged_nonce=NULL, requested_at=now(), acknowledged_at=NULL;
  RETURN true;
END;
$$;


--
-- Name: request_display_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."request_display_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF TG_OP = 'INSERT' OR NEW.step IS DISTINCT FROM OLD.step OR
    NEW.sound_cue_seq IS DISTINCT FROM OLD.sound_cue_seq THEN
  INSERT INTO public.game_state_display_completion(game_id, requested_rev) VALUES(NEW.game_id, NEW.rev)
  ON CONFLICT(game_id) DO UPDATE SET requested_rev = excluded.requested_rev;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: reserved_username_prefixes_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."reserved_username_prefixes_list"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('prefix',prefix,'kind',kind) ORDER BY prefix),'[]'::jsonb)
 FROM public.reserved_username_prefixes;
$$;


--
-- Name: reserved_username_reason("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."reserved_username_reason"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT kind FROM public.reserved_username_prefixes
 WHERE starts_with(lower(btrim(p_username)),prefix) ORDER BY length(prefix) DESC LIMIT 1;
$$;


--
-- Name: reset_email_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."reset_email_limits"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE "public"."email_providers"
    SET "rem_worker" = floor("daily_limit" * 0.8),
        "rem_immediate" = "daily_limit" - floor("daily_limit" * 0.8)
    WHERE "is_active" = true;
END;
$$;


--
-- Name: resolve_device_connect_code("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."resolve_device_connect_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rec record;
BEGIN
  DELETE FROM public.device_connect_codes
  WHERE expires_at IS NOT NULL AND expires_at < now();

  SELECT dcc.*, p.username AS owner_username
  INTO v_rec
  FROM public.device_connect_codes dcc
  JOIN public.profiles p ON p.id = dcc.owner_id
  WHERE dcc.code = p_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'code',           v_rec.code,
    'device_type',    v_rec.device_type,
    'game_id',        v_rec.game_id,
    'game_name',      v_rec.game_name,
    'share_key',      v_rec.share_key,
    'owner_username', v_rec.owner_username
  );
END;
$$;


--
-- Name: resource_copy_badges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."resource_copy_badges"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE actor uuid:=auth.uid(); items jsonb;
BEGIN
 IF actor IS NULL OR NOT public._poll_identity_regular(actor,(SELECT to_jsonb(u) FROM auth.users u WHERE u.id=actor)) THEN
  RETURN jsonb_build_object('ok',false,'items','[]'::jsonb);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',resource_kind,'variant',variant,'mode',mode,'count',n)),'[]'::jsonb)
 INTO items FROM (SELECT o.resource_kind,o.variant,
   CASE WHEN o.resource_kind='logo' THEN CASE WHEN l.type='GLYPH_30x10' THEN 'TEXT' ELSE coalesce(l.payload#>>'{source,mode}','DRAW') END END mode,
   count(*)::integer n FROM public.resource_copy_offers o LEFT JOIN public.user_logos l ON l.id=o.logo_id
  WHERE o.recipient_id=actor AND o.status='pending' AND o.created_at+interval '5 days'>clock_timestamp()
  GROUP BY o.resource_kind,o.variant,mode) counts;
 RETURN jsonb_build_object('ok',true,'items',items);
END $$;


--
-- Name: resource_copy_decide("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."resource_copy_decide"("p_offer" "uuid", "p_decision" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
BEGIN RETURN public._copy_decide(p_offer,p_decision); END $$;


--
-- Name: resource_copy_go_resolve("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."resource_copy_go_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE item public.resource_copy_offers; actor uuid:=auth.uid(); recipient_email text; recipient_label text;
BEGIN
 SELECT * INTO item FROM public.resource_copy_offers WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_token'); END IF;
 IF item.status='pending' AND item.created_at+interval '5 days'<=clock_timestamp() THEN
  PERFORM public._copy_discard(item.id,'expired');
  SELECT * INTO item FROM public.resource_copy_offers WHERE id=item.id;
 END IF;
 SELECT public._norm_email(u.email),coalesce(nullif(p.username,''),public._norm_email(u.email)) INTO recipient_email,recipient_label
  FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=item.recipient_id;
 RETURN jsonb_build_object('ok',true,'kind','copy','id',item.id,'status',item.status,'resource_kind',item.resource_kind,
  'name',item.name,'sender_label',item.sender_label,'recipient_email',recipient_email,
  'recipient_matches_me',actor=item.recipient_id,'recipient_label',recipient_label,
  'expires_at',item.created_at+interval '5 days');
END $$;


--
-- Name: resource_copy_history("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."resource_copy_history"("p_kind" "text", "p_source" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE actor uuid:=auth.uid(); items jsonb;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'error','auth_required','items','[]'::jsonb); END IF;
 IF p_kind='game' AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_source AND owner_id=actor)
  OR p_kind='logo' AND NOT EXISTS(SELECT 1 FROM public.user_logos WHERE id=p_source AND user_id=actor)
  OR p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('recipient_label',h.recipient_label,'sent_at',h.sent_at)
   ORDER BY h.sent_at DESC),'[]'::jsonb) INTO items FROM public.resource_copy_history h
  WHERE h.sender_id=actor AND h.sent_at>clock_timestamp()-interval '30 days'
   AND CASE p_kind WHEN 'game' THEN h.game_id ELSE h.logo_id END=p_source;
 RETURN jsonb_build_object('ok',true,'items',items);
END $$;


--
-- Name: resource_copy_inbox("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."resource_copy_inbox"("p_kind" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE actor uuid:=auth.uid(); items jsonb;
BEGIN
 IF actor IS NULL OR NOT public._poll_identity_regular(actor,(SELECT to_jsonb(u) FROM auth.users u WHERE u.id=actor)) THEN
  RETURN jsonb_build_object('ok',false,'error','auth_required','items','[]'::jsonb);
 END IF;
 IF p_kind IS NOT NULL AND p_kind NOT IN('game','logo') THEN RAISE EXCEPTION 'invalid_copy_kind'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'resource_kind',o.resource_kind,'variant',o.variant,
  'logo_mode',CASE WHEN o.resource_kind='logo' THEN (SELECT CASE WHEN l.type='GLYPH_30x10' THEN 'TEXT' ELSE l.payload#>>'{source,mode}' END FROM public.user_logos l WHERE l.id=o.logo_id) END,
  'name',o.name,'sender_label',o.sender_label,'created_at',o.created_at,'expires_at',o.created_at+interval '5 days',
  'game_id',o.game_id,'logo_id',o.logo_id) ORDER BY o.created_at DESC),'[]'::jsonb)
 INTO items FROM public.resource_copy_offers o WHERE o.recipient_id=actor AND o.status='pending'
  AND o.created_at+interval '5 days'>clock_timestamp() AND (p_kind IS NULL OR o.resource_kind=p_kind);
 RETURN jsonb_build_object('ok',true,'items',items);
END $$;


--
-- Name: restore_message("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."restore_message"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.messages SET deleted_at = NULL WHERE id = p_message_id;
END;
$$;


--
-- Name: restore_my_demo("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."restore_my_demo"("p_lang" "text" DEFAULT 'pl'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_lang text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_lang := lower(trim(coalesce(p_lang, 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  DELETE FROM public.user_logos WHERE user_id = v_uid AND is_demo = true;
  DELETE FROM public.question_bases WHERE owner_id = v_uid AND is_demo = true;
  DELETE FROM public.games WHERE owner_id = v_uid AND is_demo = true;

  PERFORM public.seed_demo_for_user(v_uid, v_lang);
END;
$$;


--
-- Name: revoke_base_share("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."revoke_base_share"("p_base_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_owner_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT b.owner_id INTO v_owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND OR v_owner_id<>auth.uid() THEN RETURN false; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_user_id);
 PERFORM 1 FROM public.question_bases b WHERE b.id=p_base_id AND b.owner_id=v_owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM public.question_base_shares WHERE base_id=p_base_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.base_share_tasks SET status='cancelled',cancelled_at=now()
 WHERE base_id=p_base_id AND recipient_user_id=p_user_id AND status IN ('pending','opened','done','declined');
 RETURN true;
END; $$;


--
-- Name: rpc_example(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_example"("p_x" integer) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p_x + 1;
$$;


--
-- Name: save_attachment("uuid", "text", "text", integer, "text", "text", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."save_attachment"("p_message_id" "uuid", "p_filename" "text", "p_mime_type" "text", "p_size" integer, "p_storage_path" "text", "p_content_id" "text" DEFAULT NULL::"text", "p_inline" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO message_attachments(message_id, filename, mime_type, size, storage_path, content_id, inline)
  VALUES (p_message_id, p_filename, p_mime_type, p_size, p_storage_path, p_content_id, p_inline)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: save_form_message("text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."save_form_message"("p_email" "text", "p_subject" "text", "p_body" "text", "p_lang" "text" DEFAULT 'pl'::"text") RETURNS TABLE("ok" boolean, "err" "text", "message_id" "uuid", "ticket_number" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_report_id  uuid;
  v_ticket     text;
  v_msg_id     uuid;
  v_last_ts    timestamptz;
BEGIN
  -- rate limit: 1 form message per email per 24h
  SELECT MAX(m.created_at) INTO v_last_ts
    FROM public.messages m
   WHERE m.source = 'form'
     AND m.from_email = lower(trim(p_email))
     AND m.created_at > now() - interval '24 hours';

  IF v_last_ts IS NOT NULL THEN
    RETURN QUERY SELECT false, 'rate_limited_email'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- create report
  v_ticket := public.generate_ticket_number();
  INSERT INTO public.reports (ticket_number, status, subject, lang)
  VALUES (v_ticket, 'open', COALESCE(p_subject,''), COALESCE(p_lang,'pl'))
  RETURNING id INTO v_report_id;

  -- create message
  INSERT INTO public.messages (source, direction, from_email, subject, body, report_id)
  VALUES ('form', 'inbound', lower(trim(p_email)), COALESCE(p_subject,''), COALESCE(p_body,''), v_report_id)
  RETURNING id INTO v_msg_id;

  RETURN QUERY SELECT true, NULL::text, v_msg_id, v_ticket;
END;
$$;


--
-- Name: save_inbound_message("text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."save_inbound_message"("p_from_email" "text", "p_subject" "text", "p_body" "text", "p_body_html" "text" DEFAULT NULL::"text", "p_ticket_number" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "report_id" "uuid", "ticket_number" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_report_id  uuid;
  v_ticket     text;
  v_msg_id     uuid;
  v_clean_ticket text;
BEGIN
  -- Same envelope sender boundary as the Worker; protects older deployments.
  IF lower(btrim(p_from_email)) ~ '^bounce[+][a-z0-9_-]+@bounce-zem[.]familiada[.]online$' THEN
    RETURN;
  END IF;
  -- normalise ticket: strip TICKET- prefix if present, keep YYYY-NNNN part
  IF p_ticket_number IS NOT NULL AND p_ticket_number <> '' THEN
    v_clean_ticket := regexp_replace(p_ticket_number, '^TICKET-', '');
    -- try full match first
    SELECT r.id, r.ticket_number INTO v_report_id, v_ticket
      FROM public.reports r
     WHERE r.ticket_number = p_ticket_number
        OR r.ticket_number = 'TICKET-' || v_clean_ticket
     LIMIT 1;
  END IF;

  INSERT INTO public.messages (source, direction, from_email, subject, body, body_html, report_id)
  VALUES ('email', 'inbound', p_from_email, COALESCE(p_subject,''), COALESCE(p_body,''), p_body_html, v_report_id)
  RETURNING messages.id INTO v_msg_id;

  RETURN QUERY SELECT v_msg_id, v_report_id, v_ticket;
END;
$_$;


--
-- Name: save_outbound_message("text", "text", "text", "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."save_outbound_message"("p_to_email" "text", "p_subject" "text", "p_body" "text", "p_body_html" "text" DEFAULT NULL::"text", "p_report_id" "uuid" DEFAULT NULL::"uuid", "p_queue_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_msg_id uuid;
BEGIN
  INSERT INTO public.messages (source, direction, to_email, subject, body, body_html, report_id, queue_id)
  VALUES ('compose', 'outbound', p_to_email, COALESCE(p_subject,''), COALESCE(p_body,''), p_body_html, p_report_id, p_queue_id)
  RETURNING id INTO v_msg_id;
  RETURN v_msg_id;
END;
$$;


--
-- Name: seed_demo_for_user("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."seed_demo_for_user"("p_uid" "uuid", "p_lang" "text" DEFAULT 'pl'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_lang       text;
  v_tpl        jsonb;
  v_base_id    uuid;
  v_cat_map    jsonb := '{}';
  v_tag_map    jsonb := '{}';
  v_bq_map     jsonb := '{}';
  v_game_id    uuid;
  v_q_ids      uuid[];
  v_a_map      jsonb;
  v_sess_ids   uuid[];
  v_cfg        RECORD;
  v_cat        jsonb;
  v_tag        jsonb;
  v_q          jsonb;
  v_a          jsonb;
  v_vote       jsonb;
  v_ctag       jsonb;
  v_qtag       jsonb;
  v_qi         int;
  v_ai         int;
  v_vi         int;
  v_pick       int;
  v_cat_id     uuid;
  v_tag_id     uuid;
  v_q_id       uuid;
  v_a_id       uuid;
  v_parent_id  uuid;
  v_sess_id    uuid;
  v_logo_slot  text;
  v_raw        text;
  v_norm       text;
BEGIN
  v_lang := lower(trim(coalesce(p_lang, 'pl')));
  IF v_lang NOT IN ('pl', 'en', 'uk') THEN v_lang := 'pl'; END IF;

  /* ── STEP 1: BASE ─────────────────────────────────────────────────── */
  SELECT payload INTO v_tpl FROM demo_template_data WHERE lang = v_lang AND slot = 'base';
  IF v_tpl IS NOT NULL THEN
    INSERT INTO question_bases (owner_id, name, is_demo)
    VALUES (p_uid, v_tpl->'base'->>'name', true)
    RETURNING id INTO v_base_id;

    FOR v_cat IN SELECT value FROM jsonb_array_elements(v_tpl->'categories') LOOP
      IF (v_cat->>'parent_id') IS NULL THEN
        INSERT INTO qb_categories (base_id, parent_id, name, ord)
        VALUES (v_base_id, NULL, v_cat->>'name', (v_cat->>'ord')::int)
        RETURNING id INTO v_cat_id;
        v_cat_map := v_cat_map || jsonb_build_object(v_cat->>'id', v_cat_id);
      END IF;
    END LOOP;
    FOR v_cat IN SELECT value FROM jsonb_array_elements(v_tpl->'categories') LOOP
      IF (v_cat->>'parent_id') IS NOT NULL THEN
        v_parent_id := (v_cat_map->>(v_cat->>'parent_id'))::uuid;
        INSERT INTO qb_categories (base_id, parent_id, name, ord)
        VALUES (v_base_id, v_parent_id, v_cat->>'name', (v_cat->>'ord')::int)
        RETURNING id INTO v_cat_id;
        v_cat_map := v_cat_map || jsonb_build_object(v_cat->>'id', v_cat_id);
      END IF;
    END LOOP;

    FOR v_tag IN SELECT value FROM jsonb_array_elements(v_tpl->'tags') LOOP
      INSERT INTO qb_tags (base_id, name, color, ord)
      VALUES (v_base_id, v_tag->>'name', v_tag->>'color', (v_tag->>'ord')::int)
      RETURNING id INTO v_tag_id;
      v_tag_map := v_tag_map || jsonb_build_object(v_tag->>'id', v_tag_id);
    END LOOP;

    FOR v_ctag IN SELECT value FROM jsonb_array_elements(v_tpl->'category_tags') LOOP
      INSERT INTO qb_category_tags (category_id, tag_id)
      VALUES ((v_cat_map->>(v_ctag->>'category_id'))::uuid, (v_tag_map->>(v_ctag->>'tag_id'))::uuid);
    END LOOP;

    FOR v_q IN SELECT value FROM jsonb_array_elements(v_tpl->'questions') LOOP
      v_cat_id := (v_cat_map->>(v_q->>'category_id'))::uuid;
      INSERT INTO qb_questions (base_id, category_id, ord, payload)
      VALUES (v_base_id, v_cat_id, (v_q->>'ord')::int, v_q->'payload')
      RETURNING id INTO v_q_id;
      v_bq_map := v_bq_map || jsonb_build_object(v_q->>'id', v_q_id);
    END LOOP;

    FOR v_qtag IN SELECT value FROM jsonb_array_elements(v_tpl->'question_tags') LOOP
      INSERT INTO qb_question_tags (question_id, tag_id)
      VALUES ((v_bq_map->>(v_qtag->>'question_id'))::uuid, (v_tag_map->>(v_qtag->>'tag_id'))::uuid);
    END LOOP;
  END IF;

  /* ── STEP 2: LOGOS ────────────────────────────────────────────────── */
  FOREACH v_logo_slot IN ARRAY ARRAY['logo_text', 'logo_draw', 'logo_image'] LOOP
    SELECT payload INTO v_tpl FROM demo_template_data WHERE lang = v_lang AND slot = v_logo_slot;
    IF v_tpl IS NOT NULL THEN
      INSERT INTO user_logos (user_id, name, type, is_demo, payload)
      VALUES (
        p_uid,
        v_tpl->>'name',
        CASE WHEN v_tpl->>'kind' = 'GLYPH' THEN 'GLYPH_30x10' ELSE 'PIX_150x70' END,
        true,
        v_tpl->'payload'
      );
    END IF;
  END LOOP;

  /* ── STEP 3: GAMES ────────────────────────────────────────────────── */
  FOR v_cfg IN
    SELECT * FROM (VALUES
      ('poll_text_open',     'poll_text'::game_type,   'poll_open'::game_status, true,  false),
      ('poll_text_closed',   'poll_text'::game_type,   'ready'::game_status,     false, false),
      ('poll_points_open',   'poll_points'::game_type, 'poll_open'::game_status, false, true),
      ('poll_points_closed', 'poll_points'::game_type, 'ready'::game_status,     false, false),
      ('prepared',           'prepared'::game_type,    'draft'::game_status,     false, false),
      ('poll_points_draft',  'poll_points'::game_type, 'draft'::game_status,     false, false),
      ('poll_text_draft',    'poll_text'::game_type,   'draft'::game_status,     false, false)
    ) AS t(slot, gtype, gstatus, is_text_open, is_points_open)
  LOOP
    SELECT payload INTO v_tpl FROM demo_template_data WHERE lang = v_lang AND slot = v_cfg.slot;
    CONTINUE WHEN v_tpl IS NULL;

    INSERT INTO games (owner_id, name, type, status, is_demo)
    VALUES (p_uid, v_tpl->'game'->>'name', v_cfg.gtype, v_cfg.gstatus, true)
    RETURNING id INTO v_game_id;

    v_q_ids := ARRAY[]::uuid[]; v_a_map := '{}'; v_sess_ids := ARRAY[]::uuid[];

    FOR v_qi IN 1..jsonb_array_length(v_tpl->'questions') LOOP
      v_q := (v_tpl->'questions')->(v_qi - 1);
      INSERT INTO questions (game_id, ord, text) VALUES (v_game_id, v_qi, v_q->>'text') RETURNING id INTO v_q_id;
      v_q_ids := array_append(v_q_ids, v_q_id);
      FOR v_ai IN 1..coalesce(jsonb_array_length(v_q->'answers'), 0) LOOP
        v_a := (v_q->'answers')->(v_ai - 1);
        INSERT INTO answers (question_id, ord, text, fixed_points)
        VALUES (v_q_id, v_ai, left(trim(v_a->>'text'), 17), coalesce((v_a->>'fixed_points')::int, 0))
        RETURNING id INTO v_a_id;
        v_a_map := v_a_map || jsonb_build_object((v_qi - 1)::text || ':' || (v_ai - 1)::text, v_a_id);
      END LOOP;
    END LOOP;

    IF v_cfg.is_text_open OR v_cfg.is_points_open THEN
      FOR v_qi IN 1..array_length(v_q_ids, 1) LOOP
        INSERT INTO poll_sessions (game_id, question_id, question_ord, is_open)
        VALUES (v_game_id, v_q_ids[v_qi], v_qi, true) RETURNING id INTO v_sess_id;
        v_sess_ids := array_append(v_sess_ids, v_sess_id);
      END LOOP;
    END IF;

    FOR v_vi IN 1..coalesce(jsonb_array_length(v_tpl->'votes'), 0) LOOP
      v_vote := (v_tpl->'votes')->(v_vi - 1);
      IF v_cfg.is_text_open THEN
        FOR v_qi IN 1..jsonb_array_length(v_vote->'answers_raw') LOOP
          v_raw := v_vote->'answers_raw'->>(v_qi - 1);
          INSERT INTO poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
          VALUES (v_game_id, v_sess_ids[v_qi], v_q_ids[v_qi], 'demo_seed_v' || lpad(v_vi::text, 4, '0'), v_raw, lower(regexp_replace(trim(v_raw), '\s+', ' ', 'g')));
        END LOOP;
      ELSIF v_cfg.is_points_open THEN
        FOR v_qi IN 1..jsonb_array_length(v_vote->'picks') LOOP
          v_pick := (v_vote->'picks'->>(v_qi - 1))::int;
          v_a_id := (v_a_map->>((v_qi - 1)::text || ':' || v_pick::text))::uuid;
          INSERT INTO poll_votes (game_id, question_ord, answer_ord, voter_token, poll_session_id, question_id, answer_id)
          VALUES (v_game_id, v_qi, v_pick + 1, 'demo_seed_v' || lpad(v_vi::text, 4, '0'), v_sess_ids[v_qi], v_q_ids[v_qi], v_a_id);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;


--
-- Name: set_ai_provider_cooldown("text", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_ai_provider_cooldown"("p_name" "text", "p_seconds" integer, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE "public"."marketing_ai_providers"
  SET 
    cooldown_until = now() + (p_seconds || ' seconds')::interval,
    last_error = p_error,
    updated_at = now()
  WHERE name = p_name;
END;
$$;


--
-- Name: set_my_email_notifications("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_my_email_notifications"("p_user_id" "uuid", "p_enabled" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE mailbox text; confirmed timestamptz; root uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id OR p_enabled IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 FOR attempt IN 1..1000 LOOP
  BEGIN
   SELECT public._norm_email(u.email),u.email_confirmed_at INTO mailbox,confirmed FROM auth.users u
    WHERE u.id=p_user_id AND public._poll_identity_regular(u.id,to_jsonb(u)) FOR SHARE NOWAIT;
   IF NOT FOUND OR mailbox IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF p_enabled AND confirmed IS NULL THEN RAISE EXCEPTION 'email_not_confirmed'; END IF;
   PERFORM public._mail_center_identity_lock(mailbox);
   SELECT token INTO root FROM public.email_unsub_tokens WHERE email=mailbox FOR UPDATE NOWAIT;
   IF NOT FOUND THEN root:=public._ensure_unsub_token(mailbox); END IF;
   PERFORM 1 FROM public.user_flags WHERE user_id=p_user_id FOR UPDATE NOWAIT;
   INSERT INTO public.user_flags(user_id,email_notifications) VALUES(p_user_id,p_enabled)
    ON CONFLICT(user_id) DO UPDATE SET email_notifications=excluded.email_notifications;
   UPDATE public.email_unsub_tokens SET suppressed_at=CASE WHEN p_enabled THEN NULL ELSE coalesce(suppressed_at,clock_timestamp()) END WHERE token=root;
   RETURN public._contact_mail_enabled(mailbox);
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;


--
-- Name: set_owner_id_on_games_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_owner_id_on_games_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end
$$;


--
-- Name: set_poll_qr_lang("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_poll_qr_lang"("p_game_id" "uuid", "p_lang" "text") RETURNS "void"
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


--
-- Name: FUNCTION "set_poll_qr_lang"("p_game_id" "uuid", "p_lang" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."set_poll_qr_lang"("p_game_id" "uuid", "p_lang" "text") IS 'Zapisuje games.poll_qr_lang -- jedyne źródło prawdy o języku QR-a w ankietach, odpytywane przez poll-qr.js zamiast dostarczane komendą/broadcastem.';


--
-- Name: set_report_status("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_report_status"("p_report_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_status NOT IN ('open','closed') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;
  UPDATE public.reports SET status = p_status WHERE id = p_report_id;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: share_base_by_email("uuid", "text", "public"."base_share_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."share_base_by_email"("p_base_id" "uuid", "p_email" "text", "p_role" "public"."base_share_role") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_user_id uuid;
begin
  -- baza istnieje i caller jest ownerem?
  select owner_id into v_owner
  from public.question_bases
  where id = p_base_id;

  if v_owner is null then
    return false;
  end if;

  if v_owner <> auth.uid() then
    return false;
  end if;

  -- znajdź usera po mailu (bez ujawniania wyniku na zewnątrz)
  select id into v_user_id
  from public.profiles
  where lower(email) = lower(p_email);

  if v_user_id is null then
    return false;
  end if;

  -- nie udostępniamy ownerowi
  if v_user_id = v_owner then
    return false;
  end if;

  insert into public.question_base_shares(base_id, user_id, role)
  values (p_base_id, v_user_id, p_role)
  on conflict (base_id, user_id)
  do update set role = excluded.role;

  return true;
exception
  when others then
    -- dowolny błąd = false (żadnych szczegółów)
    return false;
end;
$$;


--
-- Name: share_device("uuid", "text", "uuid", "text", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."share_device"("p_recipient_user_id" "uuid", "p_device_type" "text", "p_game_id" "uuid" DEFAULT NULL::"uuid", "p_game_name" "text" DEFAULT NULL::"text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_created boolean;
  v_mail_allowed boolean := false;
  v_cooldown_until timestamptz;
  v_target text;
BEGIN
  IF v_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'err', 'not_authenticated'); END IF;
  IF v_owner = p_recipient_user_id THEN RETURN jsonb_build_object('ok', false, 'err', 'self_share'); END IF;
  IF p_device_type NOT IN ('host', 'buzzer', 'display') THEN RETURN jsonb_build_object('ok', false, 'err', 'invalid_type'); END IF;

  v_created := NOT EXISTS (
    SELECT 1 FROM public.shared_devices
    WHERE owner_id = v_owner AND recipient_id = p_recipient_user_id AND device_type = p_device_type
      AND game_id IS NOT DISTINCT FROM p_game_id
  );

  INSERT INTO public.shared_devices (owner_id, recipient_id, device_type, game_id, game_name, expires_at)
  VALUES (v_owner, p_recipient_user_id, p_device_type, p_game_id, p_game_name, p_expires_at)
  ON CONFLICT (owner_id, recipient_id, device_type)
  DO UPDATE SET game_id = EXCLUDED.game_id, game_name = EXCLUDED.game_name, expires_at = EXCLUDED.expires_at;

  IF v_created THEN
    v_target := 'pair:' || v_owner::text || ':' || p_recipient_user_id::text
      || ':device:' || p_device_type || ':game:' || coalesce(p_game_id::text, 'none');

    SELECT ok, next_allowed_at INTO v_mail_allowed, v_cooldown_until
    FROM public.mail_cooldown_reserve('device:share', v_target);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'mail_allowed', v_mail_allowed,
    'cooldown_until', v_cooldown_until
  );
END;
$$;


--
-- Name: site_activity_ping("uuid", "text", "uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."site_activity_ping"("p_tab_id" "uuid", "p_page" "text", "p_game_id" "uuid" DEFAULT NULL::"uuid", "p_visible" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE uid uuid := auth.uid(); gid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF p_tab_id IS NULL OR p_page IS NULL OR p_page NOT IN
 ('home','games','control','editor','game-settings','bases','base-explorer','logo','polls','polls-hub','subscriptions','friends','subscribers','tasks','account','marketplace','manual','connect-device') THEN RAISE EXCEPTION 'invalid_page'; END IF;
 IF p_game_id IS NOT NULL AND p_page IN ('control','editor','game-settings','polls') THEN
   SELECT id INTO gid FROM public.games WHERE id=p_game_id AND owner_id=uid;
 END IF;
 -- One row per tab, bounded lifetime. No historical log.
 DELETE FROM public.site_activity WHERE last_seen_at < now()-interval '1 day';
 DELETE FROM public.site_activity_hours WHERE bucket < now()-interval '90 days';
 INSERT INTO public.site_activity_hours(bucket,user_id) VALUES(date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',uid) ON CONFLICT DO NOTHING;
 INSERT INTO public.site_activity(user_id,tab_id,page,game_id,visible,last_seen_at)
 VALUES(uid,p_tab_id,p_page,gid,coalesce(p_visible,true),now())
 ON CONFLICT(user_id,tab_id) DO UPDATE SET page=excluded.page,game_id=excluded.game_id,visible=excluded.visible,last_seen_at=excluded.last_seen_at;
END $$;


--
-- Name: slugify("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."slugify"("p_text" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v text;
begin
  v := lower(p_text);

  -- Polskie znaki
  v := translate(v, 'ąćęłńóśźż', 'acelnoszz');

  -- Ukraińskie/rosyjskie wieloznakowe (najpierw dłuższe sekwencje)
  v := replace(v, 'щ', 'shch');
  v := replace(v, 'ж', 'zh');
  v := replace(v, 'х', 'kh');
  v := replace(v, 'ц', 'ts');
  v := replace(v, 'ч', 'ch');
  v := replace(v, 'ш', 'sh');
  v := replace(v, 'є', 'ie');
  v := replace(v, 'ї', 'i');
  v := replace(v, 'ю', 'iu');
  v := replace(v, 'я', 'ia');
  v := replace(v, 'ё', 'e');

  -- Ukraińskie/rosyjskie jednoznakowe
  -- from (24): а б в г ґ д е з и й і к л м н о п р с т у ф ь ъ
  -- to   (22): a b v h g d e z y i i k l m n o p r s t u f  (ь i ъ → usunięte)
  v := translate(v, 'абвгґдезийіклмнопрстуфьъ',
                    'abvhgdezyiiklmnoprstuf');

  -- Usuń pozostałe znaki spoza ASCII
  v := regexp_replace(v, '[^a-z0-9\s\-]', '', 'g');
  v := regexp_replace(trim(v), '[\s\-]+', '-', 'g');
  v := left(v, 80);
  return v;
end;
$$;


--
-- Name: stats_exclude_user("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."stats_exclude_user"("p_username" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE username = p_username LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  END IF;

  INSERT INTO public.stats_excluded_users (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: stats_excluded_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."stats_excluded_list"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',e.user_id,'username',p.username,'email',p.email,
 'added_at',e.added_at,'reason',e.reason,'automatic',e.reason<>'manual') ORDER BY e.added_at),'[]'::jsonb)
 FROM public.stats_exclusions_effective e JOIN public.profiles p ON p.id=e.user_id;
$$;


--
-- Name: stats_unexclude_user("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."stats_unexclude_user"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.stats_excluded_users WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: storage_cleanup_claim(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."storage_cleanup_claim"("p_limit" integer DEFAULT 100) RETURNS TABLE("id" bigint, "bucket" "text", "path" "text", "is_folder" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.storage_cleanup_queue q
   WHERE (q.owner_kind = 'game' AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = q.owner_id))
      OR (q.owner_kind = 'user' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = q.owner_id))
      OR (q.owner_kind = 'logo' AND EXISTS (
            SELECT 1 FROM public.user_logos l
             WHERE l.id = q.owner_id
                OR public._logo_url_path(l.payload #>> '{source,imageUrl}', l.user_id) = q.path));

  RETURN QUERY
  UPDATE public.storage_cleanup_queue q
     SET claimed_at = now(), attempts = q.attempts + 1
   WHERE q.id IN (
     SELECT q2.id FROM public.storage_cleanup_queue q2
      WHERE q2.attempts < 20
        AND (q2.claimed_at IS NULL OR q2.claimed_at < now() - interval '5 minutes')
      ORDER BY q2.id
      LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.id, q.bucket, q.path, q.is_folder;
END;
$$;


--
-- Name: storage_cleanup_cron(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."storage_cleanup_cron"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (select 1 from public.storage_cleanup_queue where attempts < 20) then
    perform public.storage_cleanup_kick();
  end if;
end;
$$;


--
-- Name: storage_cleanup_done(bigint[], "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."storage_cleanup_done"("p_done" bigint[], "p_failed" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.storage_cleanup_queue where id = any(coalesce(p_done, '{}'));
  update public.storage_cleanup_queue q
     set last_error = f.err
    from (select (e->>'id')::bigint as id, e->>'error' as err from jsonb_array_elements(coalesce(p_failed, '[]'::jsonb)) e) f
   where q.id = f.id;
end;
$$;


--
-- Name: storage_cleanup_kick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."storage_cleanup_kick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_base text;
  v_anon text;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'anon_key';
  if coalesce(v_base, '') = '' or coalesce(v_anon, '') = '' then
    raise warning 'storage_cleanup_kick: brak project_url/anon_key w vault';
    return;
  end if;
  perform net.http_post(
    url := v_base || '/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon
    ),
    body := '{}'::jsonb
  );
exception when others then
  -- brak pg_net / vault nie może zablokować usunięcia; cron ponowi
  raise warning 'storage_cleanup_kick: %', sqlerrm;
end;
$$;


--
-- Name: storage_list_objects("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."storage_list_objects"("p_bucket" "text", "p_prefix" "text" DEFAULT ''::"text", "p_limit" integer DEFAULT 1000) RETURNS TABLE("name" "text", "id" "uuid", "metadata" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "version" "text", "size_bytes" bigint, "owner_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    o.name::text,
    o.id::uuid,
    o.metadata::jsonb,
    o.created_at::timestamptz,
    o.updated_at::timestamptz,
    o.last_accessed_at::timestamptz,
    o.version::text,
    COALESCE(NULLIF(o.metadata->>'size', ''), '0')::bigint as size_bytes,
    o.owner_id::uuid
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND (p_prefix = '' OR o.name LIKE (p_prefix || '%'))
  ORDER BY o.name
  LIMIT p_limit;
$$;


--
-- Name: FUNCTION "storage_list_objects"("p_bucket" "text", "p_prefix" "text", "p_limit" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."storage_list_objects"("p_bucket" "text", "p_prefix" "text", "p_limit" integer) IS 'Listuje obiekty w bucket Supabase Storage (RPC dla admina)';


--
-- Name: submit_contact_report("text", "text", "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."submit_contact_report"("p_email" "text", "p_subject" "text", "p_message" "text", "p_lang" "text" DEFAULT 'pl'::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("ok" boolean, "err" "text", "ticket_number" "text", "id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ticket text;
  v_id     uuid;
begin
  -- validate email
  if p_email is null or p_email not like '%@%' then
    return query select false, 'invalid_email'::text, null::text, null::uuid;
    return;
  end if;

  -- validate subject
  if p_subject is null or char_length(trim(p_subject)) < 1 or char_length(p_subject) > 200 then
    return query select false, 'invalid_subject'::text, null::text, null::uuid;
    return;
  end if;

  -- validate message
  if p_message is null or char_length(trim(p_message)) < 5 or char_length(p_message) > 5000 then
    return query select false, 'invalid_message'::text, null::text, null::uuid;
    return;
  end if;

  -- validate lang
  if p_lang not in ('pl','en','uk') then
    return query select false, 'invalid_lang'::text, null::text, null::uuid;
    return;
  end if;

  v_ticket := public.gen_contact_ticket_number();

  insert into public.contact_reports (ticket_number, email, subject, message, lang, status, user_id)
  values (v_ticket, lower(trim(p_email)), trim(p_subject), trim(p_message), p_lang, 'open', p_user_id)
  returning contact_reports.id into v_id;

  return query select true, null::text, v_ticket, v_id;
end;
$$;


--
-- Name: submit_contact_report("text", "text", "text", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."submit_contact_report"("p_email" "text", "p_subject" "text", "p_message" "text", "p_lang" "text" DEFAULT 'pl'::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_ip_address" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "err" "text", "ticket_number" "text", "id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ticket text;
  v_id     uuid;
  v_count  int;
begin
  -- validate email
  if p_email is null or p_email not like '%@%' then
    return query select false, 'invalid_email'::text, null::text, null::uuid;
    return;
  end if;

  -- validate subject
  if p_subject is null or char_length(trim(p_subject)) < 1 or char_length(p_subject) > 200 then
    return query select false, 'invalid_subject'::text, null::text, null::uuid;
    return;
  end if;

  -- validate message
  if p_message is null or char_length(trim(p_message)) < 5 or char_length(p_message) > 5000 then
    return query select false, 'invalid_message'::text, null::text, null::uuid;
    return;
  end if;

  -- validate lang
  if p_lang not in ('pl','en','uk') then
    return query select false, 'invalid_lang'::text, null::text, null::uuid;
    return;
  end if;

  -- rate limit: same email within 24h
  if p_ip_address is null then
    select count(*) into v_count
    from public.contact_reports
    where lower(trim(email)) = lower(trim(p_email))
      and created_at > now() - interval '24 hours';
    if v_count > 0 then
      return query select false, 'rate_limited_email'::text, null::text, null::uuid;
      return;
    end if;
  else
    select count(*) into v_count
    from public.contact_reports
    where lower(trim(email)) = lower(trim(p_email))
      and created_at > now() - interval '24 hours';
    if v_count > 0 then
      return query select false, 'rate_limited_email'::text, null::text, null::uuid;
      return;
    end if;

    select count(*) into v_count
    from public.contact_reports
    where ip_address = p_ip_address
      and created_at > now() - interval '24 hours';
    if v_count > 0 then
      return query select false, 'rate_limited_ip'::text, null::text, null::uuid;
      return;
    end if;
  end if;

  v_ticket := public.gen_contact_ticket_number();

  insert into public.contact_reports (ticket_number, email, subject, message, lang, status, user_id, ip_address)
  values (v_ticket, lower(trim(p_email)), trim(p_subject), trim(p_message), p_lang, 'open', p_user_id, p_ip_address)
  returning contact_reports.id into v_id;

  -- insert initial message into thread
  insert into public.contact_report_messages (report_id, direction, body, from_email)
  values (v_id, 'inbound', trim(p_message), lower(trim(p_email)));

  return query select true, null::text, v_ticket, v_id;
end;
$$;


--
-- Name: subscribers_invite("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."subscribers_invite"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
 v_uid uuid:=auth.uid(); v_email text:=public._norm_email(p_email);
 v_id uuid; v_token uuid; v_ok boolean; v_until timestamptz; v_target text; v_enabled boolean;
BEGIN
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[v_email],ARRAY[v_uid]);
 IF v_email IS NULL OR v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' THEN
   RETURN jsonb_build_object('ok',false,'err','invalid_email');
 END IF;
 IF public._poll_registered_uid(v_email) IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'err','has_account');
 END IF;
 IF NOT public._contact_mail_enabled(v_email) THEN RETURN jsonb_build_object('ok',false,'err','notifications_disabled','mail_allowed',false); END IF;
 PERFORM public._subscriber_pair_lock(v_uid,v_email);
 SELECT id,token INTO v_id,v_token FROM public.poll_subscriptions
   WHERE owner_id=v_uid AND subscriber_user_id IS NULL AND registered_user_id IS NULL AND lower(trim(subscriber_email))=v_email
     AND status IN ('pending','active') LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'already',true,'id',v_id,'token',v_token); END IF;
 v_until:=public._subscriber_refusal_until(v_uid,v_email);
 IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until,'reason','after_reject'); END IF;
 v_target:='pair:'||v_uid::text||':email:'||md5(v_email);
 -- The refusal window is relational and applies also when mail is disabled.
 SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite_after_reject',v_target);
 IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 v_enabled:=public._contact_mail_enabled(v_email);
 IF v_enabled THEN
   v_until:=public._poll_sub_mail_limit_until(v_uid,NULL,v_email);
   IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
   SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite',v_target);
   IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
 END IF;
 INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status)
   VALUES(v_uid,v_email,'pending') RETURNING id,token INTO v_id,v_token;
 IF v_enabled THEN PERFORM public.mail_cooldown_reserve('poll:invite',v_target); END IF;
 RETURN jsonb_build_object('ok',true,'already',false,'id',v_id,'token',v_token,'mail_allowed',v_enabled);
END; $_$;


--
-- Name: subscribers_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."subscribers_list"() RETURNS TABLE("id" "uuid", "email" "text", "status" "text", "created_at" timestamp with time zone, "token" "uuid", "email_sent_at" timestamp with time zone, "email_send_count" integer, "friend_user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT s.id,coalesce((SELECT email FROM auth.users WHERE id=s.registered_user_id),s.subscriber_email),s.status,s.created_at,s.token,s.email_sent_at,s.email_send_count,
    coalesce(s.registered_user_id,public._poll_registered_uid(s.subscriber_email))
  FROM public.poll_subscriptions s
  WHERE s.owner_id=auth.uid() AND s.subscriber_user_id IS NULL AND (s.status IN ('pending','active') OR (s.status='declined' AND s.declined_at>now()-interval '5 days'))
  ORDER BY s.created_at DESC;
$$;


--
-- Name: sync_market_game_rating_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."sync_market_game_rating_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE(NEW.market_game_id, OLD.market_game_id);
  UPDATE public.market_games
  SET
    rating_count = (SELECT COUNT(*) FROM public.market_game_ratings WHERE market_game_id = v_id),
    avg_rating   = COALESCE((SELECT ROUND(AVG(stars::numeric), 2) FROM public.market_game_ratings WHERE market_game_id = v_id), 0)
  WHERE id = v_id;
  RETURN NULL;
END;
$$;


--
-- Name: tasks_list("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."tasks_list"("p_kind" "text" DEFAULT NULL::"text") RETURNS TABLE("kind" "text", "id" "uuid", "state" "text", "title" "text", "owner_label" "text", "created_at" timestamp with time zone, "done_at" timestamp with time zone, "token" "uuid", "poll_type" "text", "role" "text", "device_type" "text", "game_id" "uuid", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.poll_claim_email_records();

  IF p_kind IS NULL OR p_kind = 'poll' THEN
    RETURN QUERY
    SELECT 'poll'::text, t.id,
           CASE WHEN t.done_at IS NOT NULL THEN 'done' ELSE 'todo' END,
           coalesce(g.name, ('Sondaż ' || left(t.game_id::text, 8))::text),
           coalesce(nullif(p.username, ''), p.email),
           t.created_at, t.done_at, t.token,
           t.poll_type, NULL::text, NULL::text, t.game_id, NULL::timestamptz
    FROM public.poll_tasks t
    LEFT JOIN public.games g ON g.id = t.game_id
    LEFT JOIN public.profiles p ON p.id = t.owner_id
    WHERE t.recipient_user_id = v_uid
      AND t.declined_at IS NULL AND t.cancelled_at IS NULL
      AND (t.done_at IS NULL OR t.done_at > now() - interval '5 days')
    ORDER BY t.created_at DESC;
  END IF;

END;
$$;


--
-- Name: touch_game_updated_at("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_game_updated_at"("p_game_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update public.games
  set updated_at = now()
  where id = p_game_id;
$$;


--
-- Name: touch_state_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_state_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.state is distinct from old.state then
    new.state_at := now();
  end if;
  return new;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- Name: touch_user_flags_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_user_flags_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- Name: track_control2_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."track_control2_session"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  sid uuid; sess public.game_sessions; d jsonb := NEW.detail;
  prev jsonb := CASE WHEN TG_OP = 'UPDATE' THEN OLD.detail ELSE '{}'::jsonb END;
  info jsonb; round_data jsonb; rn integer; a integer; b integer; fp integer;
  ra integer; rb integer; winner text; completed boolean; reason text;
  started boolean; was_started boolean; played_final boolean; final_step text;
BEGIN
  started := coalesce((d #>> '{locks,gameStarted}')::boolean, false);
  was_started := coalesce((prev #>> '{locks,gameStarted}')::boolean, false);
  SELECT s.* INTO sess FROM public.game_session_active x
    JOIN public.game_sessions s ON s.id=x.session_id WHERE x.game_id=NEW.game_id FOR UPDATE OF s;
  sid := sess.id;

  -- Restart is observed in the same transaction as its new blank state.
  IF NOT started THEN
    IF sid IS NOT NULL AND sess.ended_at IS NULL THEN
      UPDATE public.game_sessions SET status='abandoned', ended_at=now(), last_seen_at=now(),
        stats_detail=stats_detail || '{"end_reason":"restart"}'::jsonb WHERE id=sid;
    END IF;
    DELETE FROM public.game_session_active WHERE game_id=NEW.game_id;
    RETURN NEW;
  END IF;

  -- r_intro is the ready screen. Count a play only when intro actually starts.
  IF NEW.step::text='r_intro' THEN RETURN NEW; END IF;
  IF sid IS NULL THEN
    -- Never backfill games already finished when this migration was installed.
    IF coalesce((d #>> '{locks,gameEnded}')::boolean,false) THEN RETURN NEW; END IF;
    INSERT INTO public.game_sessions(game_id, control_version, start_rev, client_meta, stats_detail)
      VALUES(NEW.game_id, 2, NEW.rev, '{"source":"control2"}',
        jsonb_build_object('teams',d->'teams','settings',d->'settings',
          'resumed_at_install', was_started AND NEW.step::text <> 'r_roundStart'))
      RETURNING * INTO sess;
    sid:=sess.id;
    INSERT INTO public.game_session_active VALUES(NEW.game_id,sid);
  END IF;
  IF sess.ended_at IS NOT NULL THEN RETURN NEW; END IF;

  a:=coalesce((d #>> '{rounds,totals,A}')::integer,0);
  b:=coalesce((d #>> '{rounds,totals,B}')::integer,0);
  fp:=coalesce((d #>> '{final,runtime,sum}')::integer,0);
  played_final:=jsonb_array_length(coalesce(d #> '{final,questions}','[]'))>0;
  completed:=coalesce((d #>> '{locks,gameEnded}')::boolean,false);
  winner:=CASE WHEN played_final THEN d #>> '{final,winnerTeam}'
    WHEN a>b THEN 'A' WHEN b>a THEN 'B' ELSE NULL END;
  ra:=a; rb:=b;
  IF played_final AND completed THEN
    IF winner='A' THEN ra:=a-fp; ELSE rb:=b-fp; END IF;
  END IF;
  info:=sess.stats_detail || jsonb_build_object('teams',d->'teams','last_step',NEW.step,
    'last_rev',NEW.rev,'final_played',played_final,
    'target_reached',coalesce((d #>> '{final,runtime,reached200}')::boolean,false));

  -- A round is counted at settlement, including a zero-point round.
  -- Showing remaining answers and entering the next round do not count again.
  IF TG_OP='UPDATE' AND OLD.step::text='r_play' AND OLD.phase::text IN ('PLAY','STEAL')
     AND (NEW.phase::text='REVEAL' OR
       coalesce((d #>> '{rounds,roundNo}')::integer,1) > coalesce((prev #>> '{rounds,roundNo}')::integer,1)) THEN
    rn:=coalesce((prev #>> '{rounds,roundNo}')::integer,1);
    round_data:=jsonb_build_object('number',rn,'question',prev #> '{rounds,question}',
      'bank',prev #> '{rounds,bankPts}', 'score_a',a,'score_b',b,
      'awarded_a',a-coalesce((prev #>> '{rounds,totals,A}')::integer,0),
      'awarded_b',b-coalesce((prev #>> '{rounds,totals,B}')::integer,0),
      'winner',CASE WHEN coalesce((prev #>> '{rounds,steal,used}')::boolean,false)
        AND coalesce((prev #>> '{rounds,steal,won}')::boolean,false)
        THEN prev #>> '{rounds,steal,team}' ELSE OLD.control_team::text END,
      'steal',prev #> '{rounds,steal}', 'x_a',prev #> '{rounds,xA}','x_b',prev #> '{rounds,xB}',
      'multiplier',coalesce((d #> '{settings,roundMultipliers}' ->> least(rn-1,
        jsonb_array_length(d #> '{settings,roundMultipliers}')-1))::integer,1));
    info:=jsonb_set(info,'{rounds}',coalesce(info->'rounds','{}') || jsonb_build_object(rn::text,round_data));
  END IF;
  IF played_final THEN
    info:=info || jsonb_build_object('final',jsonb_build_object('player1',d #> '{final,runtime,p1}',
      'player2',d #> '{final,runtime,p2}','mapping1',d #> '{final,runtime,map1}',
      'mapping2',d #> '{final,runtime,map2}','questions',d #> '{final,questions}',
      'points',fp,'target',d #> '{settings,finalTarget}'));
    final_step:=CASE
      WHEN NEW.step::text='f_end' THEN 'finished'
      WHEN NEW.step::text LIKE 'f_p1_map_q%' THEN 'p1_q' || coalesce(substring(NEW.step::text from 'q([1-5])$'), '1')
      WHEN NEW.step::text LIKE 'f_p2_map_q%' THEN 'p2_q' || coalesce(substring(NEW.step::text from 'q([1-5])$'), '1')
      WHEN NEW.step::text IN ('f_p2_start','f_p2_entry') THEN 'player2_entry'
      ELSE 'final_start' END;
  END IF;
  IF NEW.step::text IN ('r_gameEnd','f_end') THEN
    reason:=CASE WHEN played_final THEN CASE
      WHEN coalesce((d #>> '{final,runtime,reached200}')::boolean,false) THEN 'final_target' ELSE 'final_complete' END
      WHEN greatest(ra,rb)>=coalesce((d #>> '{settings,finalMinPoints}')::integer,300) THEN 'rounds_target'
      ELSE 'questions_exhausted' END;
    info:=info || jsonb_build_object('end_reason',reason,'end_screen',d #> '{settings,endScreenMode}');
    IF played_final AND d #>> '{settings,endScreenMode}'='money' THEN
      info:=info || jsonb_build_object('prize', (greatest(ra,rb)+fp)*coalesce((d #>> '{settings,finalPrizeMultiplier}')::integer,3)
        + CASE WHEN coalesce((d #>> '{final,runtime,reached200}')::boolean,false)
          THEN coalesce((d #>> '{settings,mainPrizeAmount}')::integer,25000) ELSE 0 END);
    END IF;
  END IF;
  UPDATE public.game_sessions SET last_seen_at=now(),
    status=CASE WHEN completed THEN 'final' ELSE 'playing' END,
    ended_at=CASE WHEN completed THEN now() ELSE NULL END,
    rounds_played=(SELECT count(*) FROM jsonb_object_keys(coalesce(info->'rounds','{}'))),
    winner_team=winner, rounds_score_a=ra, rounds_score_b=rb,
    team_a_score=a, team_b_score=b, final_points=CASE WHEN played_final THEN fp ELSE NULL END,
    client_meta=client_meta || CASE WHEN final_step IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('final_step',final_step) END, stats_detail=info WHERE id=sid;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Statistics are auxiliary: they must not roll back a valid gameplay action.
  RAISE LOG 'control2 statistics failed game=% rev=%: %',NEW.game_id,NEW.rev,SQLERRM;
  RETURN NEW;
END;
$_$;


--
-- Name: trash_message("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trash_message"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.messages SET deleted_at = now() WHERE id = p_message_id AND deleted_at IS NULL;
END;
$$;


--
-- Name: trg_market_games_assign_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_market_games_assign_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Nadaj slug jeśli gra jest/staje się published i slug jest pusty
  IF NEW.status = 'published' AND (NEW.slug IS NULL OR NEW.slug = '') THEN
    NEW.slug := public.unique_market_slug(NEW.title, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_market_library_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_market_library_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if tg_op = 'INSERT' then
        update public.market_games
           set library_count = library_count + 1,
               updated_at    = now()
         where id = new.market_game_id;
        return new;
    end if;

    if tg_op = 'DELETE' then
        update public.market_games
           set library_count = greatest(0, library_count - 1),
               updated_at    = now()
         where id = old.market_game_id;
        return old;
    end if;

    return null;
end;
$$;


--
-- Name: trg_touch_game_from_answers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_touch_game_from_answers"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_qid uuid;
  v_game_id uuid;
begin
  v_qid := coalesce(new.question_id, old.question_id);
  if v_qid is null then
    return coalesce(new, old);
  end if;

  select q.game_id into v_game_id
  from public.questions q
  where q.id = v_qid;

  if v_game_id is not null then
    perform public.touch_game_updated_at(v_game_id);
  end if;

  return coalesce(new, old);
end;
$$;


--
-- Name: trg_touch_game_from_questions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_touch_game_from_questions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_game_id uuid;
begin
  v_game_id := coalesce(new.game_id, old.game_id);
  if v_game_id is not null then
    perform public.touch_game_updated_at(v_game_id);
  end if;
  return coalesce(new, old);
end;
$$;


--
-- Name: trg_touch_market_games_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_touch_market_games_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


--
-- Name: truncate_marketing_queries_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."truncate_marketing_queries_log"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    TRUNCATE marketing_search_queries_log RESTART IDENTITY CASCADE;
END;
$$;


--
-- Name: truncate_marketing_search_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."truncate_marketing_search_logs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    TRUNCATE marketing_search_logs RESTART IDENTITY CASCADE;
END;
$$;


--
-- Name: unassign_message_report("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."unassign_message_report"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.messages SET report_id = NULL WHERE id = p_message_id;
END;
$$;


--
-- Name: unique_market_slug("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."unique_market_slug"("p_base" "text", "p_exclude_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_slug text;
  v_candidate text;
  v_n integer := 1;
begin
  v_slug := slugify(p_base);
  if v_slug = '' then
    v_slug := 'game';
  end if;

  v_candidate := v_slug;
  loop
    if not exists (
      select 1 from public.market_games
       where slug = v_candidate
         and (p_exclude_id is null or id <> p_exclude_id)
    ) then
      return v_candidate;
    end if;
    v_n := v_n + 1;
    v_candidate := v_slug || '-' || v_n;
  end loop;
end;
$$;


--
-- Name: unshare_device("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."unshare_device"("p_recipient_user_id" "uuid", "p_device_type" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.shared_devices
  WHERE owner_id = auth.uid()
    AND recipient_id = p_recipient_user_id
    AND device_type = p_device_type;
  RETURN true;
END;
$$;


--
-- Name: update_base_share_role("uuid", "uuid", "public"."base_share_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_base_share_role"("p_base_id" "uuid", "p_user_id" "uuid", "p_role" "public"."base_share_role") RETURNS TABLE("ok" boolean, "err" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_owner_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN QUERY SELECT false,'auth required'; RETURN; END IF;
 SELECT b.owner_id INTO v_owner_id FROM public.question_bases b WHERE id=p_base_id;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'base_not_found'; RETURN; END IF;
 IF v_owner_id<>auth.uid() THEN RETURN QUERY SELECT false,'not_owner'; RETURN; END IF;
 IF p_role IS NULL THEN RETURN QUERY SELECT false,'invalid_role'; RETURN; END IF;
 PERFORM public._base_share_pair_lock(p_base_id,p_user_id);
 PERFORM 1 FROM public.question_bases b WHERE b.id=p_base_id AND b.owner_id=v_owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'base_not_found'; RETURN; END IF;
 UPDATE public.question_base_shares SET role=p_role WHERE base_id=p_base_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'share_not_found'; RETURN; END IF;
 RETURN QUERY SELECT true,NULL::text;
END; $$;


--
-- Name: update_lead_finder_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_lead_finder_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_logo_checked("uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_logo_checked"("p_logo_id" "uuid", "p_patch" "jsonb", "p_tab_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_blocker public.edit_locks;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (select 1 from public.user_logos where id = p_logo_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  -- 316: to logo (inna karta) albo cała pula logo (Control / ustawienia gry)
  -- trzymane przez kogoś innego.
  select * into v_blocker
  from public.edit_lock_blockers('logo', p_logo_id, 'exclusive', p_tab_id)
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'in_use', true, 'reason', 'locked',
      'blocker_type', v_blocker.resource_type, 'blocker_context', v_blocker.holder_context);
  end if;

  update public.user_logos
  set
    name = coalesce(p_patch->>'name', name),
    type = coalesce(p_patch->>'type', type),
    payload = coalesce(p_patch->'payload', payload)
  where id = p_logo_id and user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: update_marketing_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_marketing_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "ord" integer NOT NULL,
    "text" "text" NOT NULL,
    "fixed_points" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "answers_ord_range" CHECK ((("ord" >= 1) AND ("ord" <= 6))),
    CONSTRAINT "answers_pts_non_negative" CHECK (("fixed_points" >= 0)),
    CONSTRAINT "answers_text_len" CHECK ((("char_length"("text") >= 1) AND ("char_length"("text") <= 17)))
);


--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "note" "text"
);


--
-- Name: app_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."app_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stars" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_ratings_stars_check" CHECK ((("stars" >= 1) AND ("stars" <= 5)))
);


--
-- Name: contact_report_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."contact_report_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "body" "text" NOT NULL,
    "from_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moved_from_report_id" "uuid",
    CONSTRAINT "contact_report_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


--
-- Name: contact_report_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."contact_report_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contact_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."contact_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_number" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "lang" "text" DEFAULT 'pl'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "user_id" "uuid",
    "reply_message" "text",
    "replied_at" timestamp with time zone,
    "ip_address" "text",
    CONSTRAINT "contact_reports_email_check" CHECK (("email" ~~ '%@%'::"text")),
    CONSTRAINT "contact_reports_lang_check" CHECK (("lang" = ANY (ARRAY['pl'::"text", 'en'::"text", 'uk'::"text"]))),
    CONSTRAINT "contact_reports_message_check" CHECK ((("char_length"("message") >= 5) AND ("char_length"("message") <= 5000))),
    CONSTRAINT "contact_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'replied'::"text", 'closed'::"text"]))),
    CONSTRAINT "contact_reports_subject_check" CHECK ((("char_length"("subject") >= 1) AND ("char_length"("subject") <= 200)))
);


--
-- Name: control2_device_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."control2_device_events" (
    "id" bigint NOT NULL,
    "game_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "device_type" "text" DEFAULT 'display'::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "text",
    CONSTRAINT "control2_device_events_device_type_check" CHECK (("device_type" = ANY (ARRAY['display'::"text", 'host'::"text", 'buzzer'::"text"]))),
    CONSTRAINT "control2_device_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['page_state'::"text", 'render_stall'::"text", 'runtime_error'::"text", 'network_state'::"text", 'lease_state'::"text"])))
);


--
-- Name: control2_device_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."control2_device_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."control2_device_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: control_device_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."control_device_connections" (
    "id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "device_type" "text" NOT NULL,
    "state" "text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "released_at" timestamp with time zone,
    "epoch" bigint,
    "page_visibility" "text",
    "focused" boolean,
    "received_rev" bigint DEFAULT 0 NOT NULL,
    "rendered_rev" bigint DEFAULT 0 NOT NULL,
    "started_sound_cue_seq" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "control_device_connections_device_type_check" CHECK (("device_type" = ANY (ARRAY['display'::"text", 'host'::"text", 'buzzer'::"text"]))),
    CONSTRAINT "control_device_connections_page_visibility_check" CHECK ((("page_visibility" IS NULL) OR ("page_visibility" = ANY (ARRAY['visible'::"text", 'hidden'::"text", 'unknown'::"text"])))),
    CONSTRAINT "control_device_connections_received_rev_check" CHECK (("received_rev" >= 0)),
    CONSTRAINT "control_device_connections_rendered_rev_check" CHECK (("rendered_rev" >= 0)),
    CONSTRAINT "control_device_connections_started_sound_cue_seq_check" CHECK (("started_sound_cue_seq" >= 0)),
    CONSTRAINT "control_device_connections_state_check" CHECK (("state" = ANY (ARRAY['waiting'::"text", 'primary'::"text", 'released'::"text", 'expired'::"text", 'revoked'::"text"])))
);


--
-- Name: control_device_link_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."control_device_link_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "device_type" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "control_device_link_tokens_device_type_check" CHECK (("device_type" = ANY (ARRAY['display'::"text", 'host'::"text", 'buzzer'::"text"])))
);


--
-- Name: control_device_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."control_device_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "recipient_email" "text",
    "device_type" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "control_device_shares_check" CHECK ((("recipient_id" IS NOT NULL) <> ("recipient_email" IS NOT NULL))),
    CONSTRAINT "control_device_shares_device_type_check" CHECK (("device_type" = ANY (ARRAY['display'::"text", 'host'::"text", 'buzzer'::"text"]))),
    CONSTRAINT "control_device_shares_recipient_email_check" CHECK ((("recipient_email" IS NULL) OR (("recipient_email" = "lower"(TRIM(BOTH FROM "recipient_email"))) AND ("recipient_email" <> ''::"text"))))
);


--
-- Name: control_device_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."control_device_slots" (
    "session_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "device_type" "text" NOT NULL,
    "primary_connection_id" "uuid",
    "epoch" bigint DEFAULT 0 NOT NULL,
    "lease_expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "control_device_slots_check" CHECK ((("primary_connection_id" IS NULL) = ("lease_expires_at" IS NULL))),
    CONSTRAINT "control_device_slots_device_type_check" CHECK (("device_type" = ANY (ARRAY['display'::"text", 'host'::"text", 'buzzer'::"text"]))),
    CONSTRAINT "control_device_slots_epoch_check" CHECK (("epoch" >= 0))
);


--
-- Name: control_runtime_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."control_runtime_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '01:00:00'::interval) NOT NULL,
    "ended_at" timestamp with time zone,
    "end_reason" "text",
    "device_protocol" smallint DEFAULT 1 NOT NULL,
    CONSTRAINT "control_runtime_sessions_device_protocol_check" CHECK (("device_protocol" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "control_runtime_sessions_end_reason_check" CHECK ((("end_reason" IS NULL) OR ("end_reason" = ANY (ARRAY['idle'::"text", 'game_deleted'::"text"]))))
);


--
-- Name: demo_template_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."demo_template_data" (
    "lang" "text" NOT NULL,
    "slot" "text" NOT NULL,
    "payload" "jsonb" NOT NULL
);


--
-- Name: device_connect_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."device_connect_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "game_name" "text",
    "device_type" "text" NOT NULL,
    "share_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "device_connect_codes_device_type_check" CHECK (("device_type" = ANY (ARRAY['display'::"text", 'host'::"text", 'buzzer'::"text", 'poll_qr'::"text"])))
);


--
-- Name: device_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."device_presence" (
    "game_id" "uuid" NOT NULL,
    "device_type" "public"."device_type" NOT NULL,
    "device_id" "text" NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: display_audio_unlock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."display_audio_unlock" (
    "game_id" "uuid" NOT NULL,
    "session_nonce" "text" NOT NULL,
    "request_nonce" "text" NOT NULL,
    "acknowledged_nonce" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone
);


--
-- Name: e2e_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."e2e_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient" "text" NOT NULL,
    "from_email" "text",
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "body_html" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT "e2e_emails_recipient_check" CHECK (("recipient" ~ '^test([1-9]|1[0-5])@familiada\.online$'::"text"))
);


--
-- Name: TABLE "e2e_emails"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."e2e_emails" IS 'Krotkozyjaca skrzynka testow E2E; brak dostepu anon/authenticated, TTL 24h.';


--
-- Name: email_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_cooldowns" (
    "email_hash" "text" NOT NULL,
    "action_key" "text" NOT NULL,
    "next_allowed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: email_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_intents" (
    "email" "text" NOT NULL,
    "intent" "text" NOT NULL,
    "status" "text" NOT NULL,
    "cooldown_until" timestamp with time zone,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_intents_intent_check" CHECK (("intent" = ANY (ARRAY['signup'::"text", 'guest_migrate'::"text"]))),
    CONSTRAINT "email_intents_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'expired'::"text"])))
);


--
-- Name: email_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "label" "text" NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "daily_limit" integer DEFAULT 1000 NOT NULL,
    "rem_worker" integer DEFAULT 800 NOT NULL,
    "rem_immediate" integer DEFAULT 200 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: email_unsub_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_unsub_tokens" (
    "email" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "suppressed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: example_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."example_table" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


--
-- Name: game_gen_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_gen_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lang" "text" DEFAULT 'pl'::"text" NOT NULL,
    "topic" "text",
    "total_games" integer DEFAULT 1 NOT NULL,
    "already_used" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "last_error" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "processed_games" integer DEFAULT 0 NOT NULL,
    "results" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "game_gen_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


--
-- Name: game_import_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_import_receipts" (
    "owner_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "payload_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "game_import_receipts_payload_hash_check" CHECK (("payload_hash" ~ '^[a-f0-9]{64}$'::"text"))
);

ALTER TABLE ONLY "public"."game_import_receipts" FORCE ROW LEVEL SECURITY;


--
-- Name: game_session_active; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_session_active" (
    "game_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL
);


--
-- Name: game_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "rounds_played" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "client_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "winner_team" "text",
    "team_a_score" integer,
    "team_b_score" integer,
    "rounds_score_a" integer,
    "rounds_score_b" integer,
    "final_points" integer,
    "control_version" smallint DEFAULT 1 NOT NULL,
    "start_rev" bigint,
    "stats_detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "game_sessions_control_version_check" CHECK (("control_version" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "game_sessions_final_points_check" CHECK ((("final_points" IS NULL) OR ("final_points" >= 0))),
    CONSTRAINT "game_sessions_rounds_played_check" CHECK (("rounds_played" >= 0)),
    CONSTRAINT "game_sessions_rounds_scores_check" CHECK (((("rounds_score_a" IS NULL) OR ("rounds_score_a" >= 0)) AND (("rounds_score_b" IS NULL) OR ("rounds_score_b" >= 0)))),
    CONSTRAINT "game_sessions_scores_check" CHECK (((("team_a_score" IS NULL) OR ("team_a_score" >= 0)) AND (("team_b_score" IS NULL) OR ("team_b_score" >= 0)))),
    CONSTRAINT "game_sessions_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'playing'::"text", 'final'::"text", 'won'::"text", 'lost'::"text", 'abandoned'::"text", 'error'::"text", 'legacy'::"text"]))),
    CONSTRAINT "game_sessions_winner_team_check" CHECK ((("winner_team" = ANY (ARRAY['A'::"text", 'B'::"text"])) OR ("winner_team" IS NULL)))
);


--
-- Name: game_sessions_effective; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."game_sessions_effective" WITH ("security_invoker"='true') AS
 SELECT "id",
    "game_id",
    "started_at",
    "last_seen_at",
    "ended_at",
    "status",
    "rounds_played",
    "error_message",
    "client_meta",
    "created_at",
    "winner_team",
    "team_a_score",
    "team_b_score",
    "rounds_score_a",
    "rounds_score_b",
    "final_points",
        CASE
            WHEN (("ended_at" IS NULL) AND ("status" = ANY (ARRAY['started'::"text", 'playing'::"text", 'final'::"text"])) AND (("now"() - "last_seen_at") > '01:00:00'::interval)) THEN 'abandoned'::"text"
            ELSE "status"
        END AS "effective_status",
    "control_version",
    "start_rev",
    "stats_detail"
   FROM "public"."game_sessions" "s";


--
-- Name: game_state_display_completion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_state_display_completion" (
    "game_id" "uuid" NOT NULL,
    "rendered_rev" bigint DEFAULT 0 NOT NULL,
    "requested_rev" bigint DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY "public"."game_state_display_completion" REPLICA IDENTITY FULL;


--
-- Name: game_state_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_state_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "rev" bigint NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "game_state_history"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."game_state_history" IS 'Migawki wiersza game_state SPRZED każdej zmiany (pisane przez game_state_write) — jednopoziomowe "Cofnij ostatnią akcję" w Control v2 przez game_state_undo. Przycinane do ~20 najnowszych na grę.';


--
-- Name: games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Nowa Familiada'::"text" NOT NULL,
    "type" "public"."game_type" DEFAULT 'prepared'::"public"."game_type" NOT NULL,
    "status" "public"."game_status" DEFAULT 'draft'::"public"."game_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "poll_opened_at" timestamp with time zone,
    "poll_closed_at" timestamp with time zone,
    "share_key_poll" "text" DEFAULT "public"."gen_share_key"(18) NOT NULL,
    "share_key_control" "text" DEFAULT "public"."gen_share_key"(24) NOT NULL,
    "share_key_display" "text" DEFAULT "public"."gen_share_key"(18) NOT NULL,
    "share_key_host" "text" DEFAULT "public"."gen_share_key"(18) NOT NULL,
    "share_key_buzzer" "text" DEFAULT "public"."gen_share_key"(18) NOT NULL,
    "poll_share_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL,
    "source_market_id" "uuid",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "poll_qr_lang" "text",
    "rules_state" "jsonb",
    "poll_ended_key" "text",
    "received_from_label" "text",
    "received_from_identity" "uuid",
    CONSTRAINT "games_name_len" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 80))),
    CONSTRAINT "games_poll_status_ok" CHECK (((("type" = ANY (ARRAY['prepared'::"public"."game_type", 'market'::"public"."game_type"])) AND ("status" = ANY (ARRAY['draft'::"public"."game_status", 'ready'::"public"."game_status"]))) OR (("type" <> ALL (ARRAY['prepared'::"public"."game_type", 'market'::"public"."game_type"])) AND ("status" = ANY (ARRAY['draft'::"public"."game_status", 'poll_open'::"public"."game_status", 'poll_stopped'::"public"."game_status", 'ready'::"public"."game_status"]))))),
    CONSTRAINT "games_status_check" CHECK (("status" = ANY (ARRAY['draft'::"public"."game_status", 'poll_open'::"public"."game_status", 'poll_stopped'::"public"."game_status", 'ready'::"public"."game_status"]))),
    CONSTRAINT "games_type_check" CHECK (("type" = ANY (ARRAY['poll_text'::"public"."game_type", 'poll_points'::"public"."game_type", 'prepared'::"public"."game_type", 'market'::"public"."game_type"])))
);


--
-- Name: COLUMN "games"."settings"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."games"."settings" IS 'Per-game settings: teams, display, sound, questions';


--
-- Name: COLUMN "games"."poll_qr_lang"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."games"."poll_qr_lang" IS 'Ostatni język operatora w polls.html, do odczytu przez poll-qr.js (get_poll_game) -- NULL dopóki operator nigdy nie zmienił języka, wtedy poll-qr zostaje przy własnym, lokalnie wykrytym języku.';


--
-- Name: guest_migration_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."guest_migration_staging" (
    "user_id" "uuid" NOT NULL,
    "pending_username" "text",
    "pending_password_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: konta_do_stworzenia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."konta_do_stworzenia" (
    "new_user_id" "uuid",
    "user_username" "text",
    "user_email" "text",
    "encrypted_pw" "text"
);


--
-- Name: mail_center_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_center_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token_hash" "text" NOT NULL,
    "email" "text" NOT NULL,
    "root_token" "uuid" NOT NULL,
    "purpose" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "mail_center_links_email_check" CHECK (("email" = "public"."_norm_email"("email"))),
    CONSTRAINT "mail_center_links_purpose_check" CHECK (("purpose" = ANY (ARRAY['footer'::"text", 'verification'::"text"]))),
    CONSTRAINT "mail_center_links_token_hash_check" CHECK (("token_hash" ~ '^[a-f0-9]{64}$'::"text"))
);


--
-- Name: mail_center_request_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_center_request_events" (
    "id" bigint NOT NULL,
    "email_hash" "text" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


--
-- Name: mail_center_request_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_center_request_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."mail_center_request_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mail_center_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_center_sessions" (
    "secret_hash" "text" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "mail_center_sessions_secret_hash_check" CHECK (("secret_hash" ~ '^[a-f0-9]{64}$'::"text"))
);


--
-- Name: mail_cooldown_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_cooldown_policies" (
    "action_key" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "cooldown_seconds" integer NOT NULL,
    "enforce" boolean DEFAULT true NOT NULL,
    "description" "text",
    CONSTRAINT "mail_cooldown_policies_cooldown_seconds_check" CHECK (("cooldown_seconds" >= 0)),
    CONSTRAINT "mail_cooldown_policies_scope_check" CHECK (("scope" = ANY (ARRAY['email'::"text", 'user'::"text", 'pair'::"text"])))
);


--
-- Name: mail_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_cooldowns" (
    "action_key" "text" NOT NULL,
    "target_key" "text" NOT NULL,
    "next_allowed_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: mail_function_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_function_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "function_name" "text" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "event" "text" NOT NULL,
    "request_id" "uuid",
    "queue_id" "uuid",
    "actor_user_id" "uuid",
    "recipient_email" "text",
    "provider" "text",
    "status" "text",
    "error" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: mail_function_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_function_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."mail_function_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mail_notification_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_notification_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "lifecycle_owner_id" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "identity_id" "uuid",
    "to_email" "text" NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_token" "uuid" NOT NULL,
    "friendship_id" "uuid",
    "subscription_id" "uuid",
    "poll_task_id" "uuid",
    "base_task_id" "uuid",
    "device_share_id" "uuid",
    "snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "enqueue_before" timestamp with time zone DEFAULT ("clock_timestamp"() + '00:05:00'::interval) NOT NULL,
    "consumed_at" timestamp with time zone,
    "consumed_queue_id" "uuid",
    "revoked_at" timestamp with time zone,
    "copy_offer_id" "uuid",
    CONSTRAINT "mail_notification_allocations_check1" CHECK ((("consumed_at" IS NULL) = ("consumed_queue_id" IS NULL))),
    CONSTRAINT "mail_notification_allocations_one_source" CHECK (("num_nonnulls"("friendship_id", "subscription_id", "poll_task_id", "base_task_id", "device_share_id", "copy_offer_id") = 1)),
    CONSTRAINT "mail_notification_allocations_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['friend'::"text", 'subscription'::"text", 'poll'::"text", 'base'::"text", 'device'::"text", 'copy'::"text"])))
);


--
-- Name: mail_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mail_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "delay_ms" integer DEFAULT 250 NOT NULL,
    "batch_max" integer DEFAULT 100 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "worker_limit" integer DEFAULT 25 NOT NULL,
    CONSTRAINT "mail_settings_singleton" CHECK (("id" = 1))
);


--
-- Name: market_game_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."market_game_ratings" (
    "market_game_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stars" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "market_game_ratings_stars_check" CHECK ((("stars" >= 1) AND ("stars" <= 5)))
);


--
-- Name: market_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."market_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_game_id" "uuid",
    "author_user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "lang" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "public"."market_game_status" DEFAULT 'pending'::"public"."market_game_status" NOT NULL,
    "moderation_note" "text",
    "library_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origin" "public"."market_game_origin" DEFAULT 'community'::"public"."market_game_origin" NOT NULL,
    "questions_text" "text" DEFAULT ''::"text" NOT NULL,
    "questions_fingerprint" "text",
    "embedding" "public"."vector"(384),
    "slug" "text",
    "avg_rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "rating_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "market_games_lang_check" CHECK (("lang" = ANY (ARRAY['pl'::"text", 'en'::"text", 'uk'::"text"]))),
    CONSTRAINT "market_games_library_count_nn" CHECK (("library_count" >= 0)),
    CONSTRAINT "market_games_title_len" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 120)))
);


--
-- Name: marketing_ai_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marketing_ai_providers" (
    "name" "text" NOT NULL,
    "label" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "priority" integer DEFAULT 0,
    "cooldown_until" timestamp with time zone,
    "last_error" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: marketing_cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marketing_cities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true
);


--
-- Name: marketing_search_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marketing_search_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."marketing_search_logs" REPLICA IDENTITY FULL;


--
-- Name: marketing_search_queries_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marketing_search_queries_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "query_text" "text" NOT NULL,
    "urls_found" integer DEFAULT 0,
    "status" "text" DEFAULT 'completed'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "urls_added" integer DEFAULT 0
);


--
-- Name: marketing_verified_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marketing_verified_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "short_description" "text",
    "email" "text" NOT NULL,
    "url" "text" NOT NULL,
    "is_used" boolean DEFAULT false,
    "added_at" timestamp with time zone DEFAULT "now"(),
    "verify_reason" "text"
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid",
    "filename" "text" DEFAULT ''::"text" NOT NULL,
    "mime_type" "text" DEFAULT 'application/octet-stream'::"text" NOT NULL,
    "size" integer DEFAULT 0 NOT NULL,
    "storage_path" "text" DEFAULT ''::"text" NOT NULL,
    "content_id" "text",
    "inline" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'email'::"text" NOT NULL,
    "direction" "text" NOT NULL,
    "from_email" "text",
    "to_email" "text",
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "body_html" "text",
    "report_id" "uuid",
    "queue_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "is_marketing" boolean DEFAULT false,
    CONSTRAINT "messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "messages_source_check" CHECK (("source" = ANY (ARRAY['email'::"text", 'form'::"text", 'compose'::"text"])))
);


--
-- Name: COLUMN "messages"."is_marketing"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."messages"."is_marketing" IS 'True for marketing/bulk emails sent from marketing panel';


--
-- Name: poll_anonymous_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_anonymous_limits" (
    "game_id" "uuid" NOT NULL,
    "key_hash" "text" NOT NULL,
    "browser_hash" "text" NOT NULL,
    "next_allowed_at" timestamp with time zone DEFAULT '-infinity'::timestamp with time zone NOT NULL,
    "voter_hash" "text",
    "payload_hash" "text",
    "in_progress" boolean DEFAULT false NOT NULL
);


--
-- Name: poll_mail_budget_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_mail_budget_events" (
    "queue_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "recipient_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."poll_mail_budget_events" FORCE ROW LEVEL SECURITY;


--
-- Name: poll_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "question_ord" integer NOT NULL,
    "is_open" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "question_id" "uuid" NOT NULL
);


--
-- Name: poll_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "subscriber_user_id" "uuid",
    "subscriber_email" "text",
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opened_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "email_sent_at" timestamp with time zone,
    "email_send_count" integer DEFAULT 0 NOT NULL,
    "registered_user_id" "uuid",
    "identity_tracking_enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "poll_subscriptions_one_subscriber_chk" CHECK (((("subscriber_user_id" IS NOT NULL) AND ("subscriber_email" IS NULL)) OR (("subscriber_user_id" IS NULL) AND ("subscriber_email" IS NOT NULL)))),
    CONSTRAINT "poll_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


--
-- Name: poll_tally_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_tally_drafts" (
    "game_id" "uuid" NOT NULL,
    "draft" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: poll_text_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_text_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "poll_session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "voter_token" "text" NOT NULL,
    "answer_raw" "text" NOT NULL,
    "answer_norm" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "voter_user_id" "uuid"
);


--
-- Name: poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "question_ord" integer NOT NULL,
    "answer_ord" integer NOT NULL,
    "voter_token" "text" NOT NULL,
    "poll_session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question_id" "uuid",
    "answer_id" "uuid",
    "voter_user_id" "uuid",
    CONSTRAINT "pv_token_len" CHECK ((("char_length"("voter_token") >= 8) AND ("char_length"("voter_token") <= 120)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "username" "text",
    "is_guest" boolean DEFAULT false NOT NULL,
    "guest_last_active_at" timestamp with time zone,
    "guest_expires_at" timestamp with time zone
);


--
-- Name: public_kv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."public_kv" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: qb_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qb_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "base_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "ord" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


--
-- Name: qb_category_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qb_category_tags" (
    "category_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: qb_question_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qb_question_tags" (
    "question_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: qb_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qb_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "base_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "ord" integer DEFAULT 0 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


--
-- Name: qb_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qb_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "base_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT 'gray'::"text" NOT NULL,
    "ord" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: question_base_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."question_base_shares" (
    "base_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."base_share_role" DEFAULT 'viewer'::"public"."base_share_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: question_bases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."question_bases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Nowa baza pytań'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL
);


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "ord" integer NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "questions_ord_positive" CHECK (("ord" >= 1)),
    CONSTRAINT "questions_text_len" CHECK ((("char_length"("text") >= 1) AND ("char_length"("text") <= 200)))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_number" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "lang" "text" DEFAULT 'pl'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


--
-- Name: reserved_username_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reserved_username_accounts" (
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    CONSTRAINT "reserved_username_accounts_username_check" CHECK (("username" = "lower"("btrim"("username"))))
);


--
-- Name: reserved_username_prefixes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reserved_username_prefixes" (
    "prefix" "text" NOT NULL,
    "kind" "text" NOT NULL,
    CONSTRAINT "reserved_username_prefixes_kind_check" CHECK (("kind" = ANY (ARRAY['test'::"text", 'system'::"text"]))),
    CONSTRAINT "reserved_username_prefixes_prefix_check" CHECK ((("prefix" = "lower"("btrim"("prefix"))) AND ("length"("prefix") > 0)))
);


--
-- Name: resource_clone_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."resource_clone_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "reference_hash" "text" NOT NULL,
    "reference" "text" NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_path" "text",
    "mime" "text" NOT NULL,
    "byte_size" integer NOT NULL,
    "etag" "text",
    "content_hash" "text",
    "destination_path" "text" NOT NULL,
    CONSTRAINT "resource_clone_assets_byte_size_check" CHECK ((("byte_size" >= 1) AND ("byte_size" <= 5242880))),
    CONSTRAINT "resource_clone_assets_mime_check" CHECK (("mime" = ANY (ARRAY['image/png'::"text", 'image/jpeg'::"text", 'image/gif'::"text", 'image/webp'::"text"]))),
    CONSTRAINT "resource_clone_assets_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['storage'::"text", 'embedded'::"text", 'demo_asset'::"text"])))
);

ALTER TABLE ONLY "public"."resource_clone_assets" FORCE ROW LEVEL SECURITY;


--
-- Name: resource_clone_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."resource_clone_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_identity" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "resource_kind" "text" NOT NULL,
    "action" "text" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "source_snapshot" "jsonb",
    "status" "text" DEFAULT 'preparing'::"text" NOT NULL,
    "game_id" "uuid",
    "base_id" "uuid",
    "logo_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "completed_at" timestamp with time zone,
    "definition_hash" "text",
    CONSTRAINT "resource_clone_jobs_action_check" CHECK (("action" = ANY (ARRAY['duplicate'::"text", 'send'::"text"]))),
    CONSTRAINT "resource_clone_jobs_check" CHECK (("num_nonnulls"("game_id", "base_id", "logo_id") <= 1)),
    CONSTRAINT "resource_clone_jobs_check1" CHECK (((("action" = 'duplicate'::"text") AND ("actor_identity" = "recipient_id")) OR (("action" = 'send'::"text") AND ("actor_identity" <> "recipient_id") AND ("resource_kind" <> 'base'::"text")))),
    CONSTRAINT "resource_clone_jobs_resource_kind_check" CHECK (("resource_kind" = ANY (ARRAY['game'::"text", 'base'::"text", 'logo'::"text"]))),
    CONSTRAINT "resource_clone_jobs_status_check" CHECK (("status" = ANY (ARRAY['preparing'::"text", 'complete'::"text", 'removed'::"text", 'expired'::"text"])))
);

ALTER TABLE ONLY "public"."resource_clone_jobs" FORCE ROW LEVEL SECURITY;


--
-- Name: resource_clone_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."resource_clone_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "creator_id" "uuid",
    "creator_identity" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "resource_kind" "text" NOT NULL,
    "action" "text" NOT NULL,
    "demo_origin" boolean DEFAULT false NOT NULL,
    "definition_hash" "text" NOT NULL,
    "game_id" "uuid",
    "base_id" "uuid",
    "logo_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "resource_clone_receipts_action_check" CHECK (("action" = ANY (ARRAY['duplicate'::"text", 'send'::"text"]))),
    CONSTRAINT "resource_clone_receipts_check" CHECK (("num_nonnulls"("game_id", "base_id", "logo_id") <= 1)),
    CONSTRAINT "resource_clone_receipts_check1" CHECK ((("game_id" IS NULL) OR ("resource_kind" = 'game'::"text"))),
    CONSTRAINT "resource_clone_receipts_check2" CHECK ((("base_id" IS NULL) OR ("resource_kind" = 'base'::"text"))),
    CONSTRAINT "resource_clone_receipts_check3" CHECK ((("logo_id" IS NULL) OR ("resource_kind" = 'logo'::"text"))),
    CONSTRAINT "resource_clone_receipts_check4" CHECK (((("action" = 'duplicate'::"text") AND ("creator_identity" = "recipient_id")) OR (("action" = 'send'::"text") AND ("creator_identity" <> "recipient_id") AND ("resource_kind" <> 'base'::"text")))),
    CONSTRAINT "resource_clone_receipts_resource_kind_check" CHECK (("resource_kind" = ANY (ARRAY['game'::"text", 'base'::"text", 'logo'::"text"])))
);

ALTER TABLE ONLY "public"."resource_clone_receipts" FORCE ROW LEVEL SECURITY;


--
-- Name: resource_copy_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."resource_copy_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "logo_id" "uuid",
    "offer_id" "uuid",
    "recipient_identity" "uuid" NOT NULL,
    "recipient_label" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "resource_copy_history_check" CHECK (("num_nonnulls"("game_id", "logo_id") = 1))
);

ALTER TABLE ONLY "public"."resource_copy_history" FORCE ROW LEVEL SECURITY;


--
-- Name: resource_copy_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."resource_copy_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "sender_identity" "uuid" NOT NULL,
    "sender_label" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "resource_kind" "text" NOT NULL,
    "variant" "text" NOT NULL,
    "name" "text" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "decided_at" timestamp with time zone,
    "game_id" "uuid",
    "logo_id" "uuid",
    CONSTRAINT "resource_copy_offers_check" CHECK (("sender_identity" <> "recipient_id")),
    CONSTRAINT "resource_copy_offers_check1" CHECK (((("resource_kind" = 'game'::"text") AND ("variant" = ANY (ARRAY['prepared'::"text", 'poll_text'::"text", 'poll_points'::"text"]))) OR (("resource_kind" = 'logo'::"text") AND ("variant" = ANY (ARRAY['GLYPH_30x10'::"text", 'PIX_150x70'::"text"]))))),
    CONSTRAINT "resource_copy_offers_check2" CHECK ((("game_id" IS NULL) OR ("resource_kind" = 'game'::"text"))),
    CONSTRAINT "resource_copy_offers_check3" CHECK ((("logo_id" IS NULL) OR ("resource_kind" = 'logo'::"text"))),
    CONSTRAINT "resource_copy_offers_check4" CHECK ((("status" <> ALL (ARRAY['declined'::"text", 'expired'::"text"])) OR (("game_id" IS NULL) AND ("logo_id" IS NULL)))),
    CONSTRAINT "resource_copy_offers_payload_hash_check" CHECK (("payload_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "resource_copy_offers_resource_kind_check" CHECK (("resource_kind" = ANY (ARRAY['game'::"text", 'logo'::"text"]))),
    CONSTRAINT "resource_copy_offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);

ALTER TABLE ONLY "public"."resource_copy_offers" FORCE ROW LEVEL SECURITY;


--
-- Name: resource_demo_origins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."resource_demo_origins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "base_id" "uuid",
    "logo_id" "uuid",
    CONSTRAINT "resource_demo_origins_check" CHECK (("num_nonnulls"("game_id", "base_id", "logo_id") = 1))
);

ALTER TABLE ONLY "public"."resource_demo_origins" FORCE ROW LEVEL SECURITY;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."schema_migrations" (
    "filename" "text" NOT NULL,
    "checksum" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "git_sha" "text"
);


--
-- Name: shared_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."shared_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "device_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "game_id" "uuid",
    "game_name" "text",
    "expires_at" timestamp with time zone,
    "recipient_email" "text",
    CONSTRAINT "shared_devices_device_type_check" CHECK (("device_type" = ANY (ARRAY['host'::"text", 'buzzer'::"text", 'display'::"text"])))
);


--
-- Name: site_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."site_activity" (
    "user_id" "uuid" NOT NULL,
    "tab_id" "uuid" NOT NULL,
    "page" "text" NOT NULL,
    "game_id" "uuid",
    "visible" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: site_activity_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."site_activity_hours" (
    "bucket" timestamp with time zone NOT NULL,
    "user_id" "uuid" NOT NULL
);


--
-- Name: stats_excluded_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."stats_excluded_users" (
    "user_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: stats_exclusions_effective; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."stats_exclusions_effective" AS
 SELECT DISTINCT ON ("user_id") "user_id",
    "added_at",
    "reason"
   FROM ( SELECT "stats_excluded_users"."user_id",
            "stats_excluded_users"."added_at",
            'manual'::"text" AS "reason",
            2 AS "priority"
           FROM "public"."stats_excluded_users"
        UNION ALL
         SELECT "p"."id",
            "p"."created_at",
                CASE
                    WHEN (COALESCE(("u"."raw_app_meta_data" ->> 'is_test_guest'::"text"), 'false'::"text") = 'true'::"text") THEN 'test_guest'::"text"
                    ELSE 'test_account'::"text"
                END AS "case",
            1
           FROM ("public"."profiles" "p"
             JOIN "auth"."users" "u" ON (("u"."id" = "p"."id")))
          WHERE (("lower"(("u"."email")::"text") ~ '^test[0-9]+@familiada[.]online$'::"text") OR (COALESCE(("u"."raw_app_meta_data" ->> 'is_test_guest'::"text"), 'false'::"text") = 'true'::"text"))) "x"
  ORDER BY "user_id", "priority";


--
-- Name: storage_cleanup_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."storage_cleanup_queue" (
    "id" bigint NOT NULL,
    "bucket" "text" NOT NULL,
    "path" "text" NOT NULL,
    "is_folder" boolean NOT NULL,
    "owner_kind" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    CONSTRAINT "storage_cleanup_queue_bucket_check" CHECK (("bucket" = ANY (ARRAY['user-sounds'::"text", 'user-logos'::"text"]))),
    CONSTRAINT "storage_cleanup_queue_owner_kind_check" CHECK (("owner_kind" = ANY (ARRAY['game'::"text", 'logo'::"text", 'user'::"text"]))),
    CONSTRAINT "storage_cleanup_queue_path_check" CHECK ((("path" <> ''::"text") AND ("path" !~~ '/%'::"text")))
);


--
-- Name: storage_cleanup_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."storage_cleanup_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: storage_cleanup_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."storage_cleanup_queue_id_seq" OWNED BY "public"."storage_cleanup_queue"."id";


--
-- Name: user_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_cooldowns" (
    "user_id" "uuid" NOT NULL,
    "action_key" "text" NOT NULL,
    "next_allowed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_flags" (
    "user_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_notifications" boolean DEFAULT true NOT NULL
);


--
-- Name: COLUMN "user_flags"."email_notifications"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."user_flags"."email_notifications" IS 'If true, user receives email notifications (subscription invites, vote tasks, base shares).';


--
-- Name: user_logos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_logos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL,
    "received_from_label" "text",
    "received_from_identity" "uuid",
    CONSTRAINT "user_logos_type_check" CHECK (("type" = ANY (ARRAY['GLYPH_30x10'::"text", 'PIX_150x70'::"text"])))
);


--
-- Name: user_market_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_market_library" (
    "user_id" "uuid" NOT NULL,
    "market_game_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "game_id" "uuid"
);


--
-- Name: storage_cleanup_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."storage_cleanup_queue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."storage_cleanup_queue_id_seq"'::"regclass");


--
-- Name: answers answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_pkey" PRIMARY KEY ("id");


--
-- Name: answers answers_q_ord_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_q_ord_uniq" UNIQUE ("question_id", "ord");


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");


--
-- Name: app_ratings app_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_ratings"
    ADD CONSTRAINT "app_ratings_pkey" PRIMARY KEY ("id");


--
-- Name: app_ratings app_ratings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_ratings"
    ADD CONSTRAINT "app_ratings_user_id_key" UNIQUE ("user_id");


--
-- Name: base_share_tasks base_share_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."base_share_tasks"
    ADD CONSTRAINT "base_share_tasks_pkey" PRIMARY KEY ("id");


--
-- Name: contact_report_messages contact_report_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contact_report_messages"
    ADD CONSTRAINT "contact_report_messages_pkey" PRIMARY KEY ("id");


--
-- Name: contact_reports contact_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contact_reports"
    ADD CONSTRAINT "contact_reports_pkey" PRIMARY KEY ("id");


--
-- Name: contact_reports contact_reports_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contact_reports"
    ADD CONSTRAINT "contact_reports_ticket_number_key" UNIQUE ("ticket_number");


--
-- Name: control2_device_events control2_device_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control2_device_events"
    ADD CONSTRAINT "control2_device_events_pkey" PRIMARY KEY ("id");


--
-- Name: control_device_connections control_device_connections_id_session_id_game_id_device_typ_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_connections"
    ADD CONSTRAINT "control_device_connections_id_session_id_game_id_device_typ_key" UNIQUE ("id", "session_id", "game_id", "device_type");


--
-- Name: control_device_connections control_device_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_connections"
    ADD CONSTRAINT "control_device_connections_pkey" PRIMARY KEY ("id");


--
-- Name: control_device_link_tokens control_device_link_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_link_tokens"
    ADD CONSTRAINT "control_device_link_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: control_device_link_tokens control_device_link_tokens_session_id_device_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_link_tokens"
    ADD CONSTRAINT "control_device_link_tokens_session_id_device_type_key" UNIQUE ("session_id", "device_type");


--
-- Name: control_device_link_tokens control_device_link_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_link_tokens"
    ADD CONSTRAINT "control_device_link_tokens_token_key" UNIQUE ("token");


--
-- Name: control_device_shares control_device_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_shares"
    ADD CONSTRAINT "control_device_shares_pkey" PRIMARY KEY ("id");


--
-- Name: control_device_shares control_device_shares_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_shares"
    ADD CONSTRAINT "control_device_shares_token_key" UNIQUE ("token");


--
-- Name: control_device_slots control_device_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_slots"
    ADD CONSTRAINT "control_device_slots_pkey" PRIMARY KEY ("session_id", "device_type");


--
-- Name: control_runtime_sessions control_runtime_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_runtime_sessions"
    ADD CONSTRAINT "control_runtime_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: demo_template_data demo_template_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."demo_template_data"
    ADD CONSTRAINT "demo_template_data_pkey" PRIMARY KEY ("lang", "slot");


--
-- Name: device_connect_codes device_connect_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_connect_codes"
    ADD CONSTRAINT "device_connect_codes_code_key" UNIQUE ("code");


--
-- Name: device_connect_codes device_connect_codes_owner_id_game_id_device_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_connect_codes"
    ADD CONSTRAINT "device_connect_codes_owner_id_game_id_device_type_key" UNIQUE ("owner_id", "game_id", "device_type");


--
-- Name: device_connect_codes device_connect_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_connect_codes"
    ADD CONSTRAINT "device_connect_codes_pkey" PRIMARY KEY ("id");


--
-- Name: device_presence device_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_presence"
    ADD CONSTRAINT "device_presence_pkey" PRIMARY KEY ("game_id", "device_type", "device_id");


--
-- Name: display_audio_unlock display_audio_unlock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."display_audio_unlock"
    ADD CONSTRAINT "display_audio_unlock_pkey" PRIMARY KEY ("game_id");


--
-- Name: e2e_emails e2e_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."e2e_emails"
    ADD CONSTRAINT "e2e_emails_pkey" PRIMARY KEY ("id");


--
-- Name: edit_locks edit_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."edit_locks"
    ADD CONSTRAINT "edit_locks_pkey" PRIMARY KEY ("resource_type", "resource_id", "holder_tab_id");


--
-- Name: email_cooldowns email_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_cooldowns"
    ADD CONSTRAINT "email_cooldowns_pkey" PRIMARY KEY ("email_hash", "action_key");


--
-- Name: email_intents email_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_intents"
    ADD CONSTRAINT "email_intents_pkey" PRIMARY KEY ("email");


--
-- Name: email_providers email_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_providers"
    ADD CONSTRAINT "email_providers_pkey" PRIMARY KEY ("id");


--
-- Name: email_unsub_tokens email_unsub_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_unsub_tokens"
    ADD CONSTRAINT "email_unsub_tokens_pkey" PRIMARY KEY ("email");


--
-- Name: email_unsub_tokens email_unsub_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_unsub_tokens"
    ADD CONSTRAINT "email_unsub_tokens_token_key" UNIQUE ("token");


--
-- Name: example_table example_table_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."example_table"
    ADD CONSTRAINT "example_table_pkey" PRIMARY KEY ("id");


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");


--
-- Name: friendships friendships_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_token_key" UNIQUE ("token");


--
-- Name: game_gen_queue game_gen_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_gen_queue"
    ADD CONSTRAINT "game_gen_queue_pkey" PRIMARY KEY ("id");


--
-- Name: game_import_receipts game_import_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_import_receipts"
    ADD CONSTRAINT "game_import_receipts_pkey" PRIMARY KEY ("owner_id", "request_id");


--
-- Name: game_session_active game_session_active_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_session_active"
    ADD CONSTRAINT "game_session_active_pkey" PRIMARY KEY ("game_id");


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_sessions"
    ADD CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: game_state_display_completion game_state_display_completion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_state_display_completion"
    ADD CONSTRAINT "game_state_display_completion_pkey" PRIMARY KEY ("game_id");


--
-- Name: game_state_history game_state_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_state_history"
    ADD CONSTRAINT "game_state_history_pkey" PRIMARY KEY ("id");


--
-- Name: game_state game_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_state"
    ADD CONSTRAINT "game_state_pkey" PRIMARY KEY ("game_id");


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");


--
-- Name: games games_share_keys_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_share_keys_unique" UNIQUE ("share_key_poll", "share_key_control", "share_key_display", "share_key_host", "share_key_buzzer");


--
-- Name: guest_migration_staging guest_migration_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."guest_migration_staging"
    ADD CONSTRAINT "guest_migration_staging_pkey" PRIMARY KEY ("user_id");


--
-- Name: mail_center_links mail_center_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_center_links"
    ADD CONSTRAINT "mail_center_links_pkey" PRIMARY KEY ("id");


--
-- Name: mail_center_links mail_center_links_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_center_links"
    ADD CONSTRAINT "mail_center_links_token_hash_key" UNIQUE ("token_hash");


--
-- Name: mail_center_request_events mail_center_request_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_center_request_events"
    ADD CONSTRAINT "mail_center_request_events_pkey" PRIMARY KEY ("id");


--
-- Name: mail_center_sessions mail_center_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_center_sessions"
    ADD CONSTRAINT "mail_center_sessions_pkey" PRIMARY KEY ("secret_hash");


--
-- Name: mail_cooldown_policies mail_cooldown_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_cooldown_policies"
    ADD CONSTRAINT "mail_cooldown_policies_pkey" PRIMARY KEY ("action_key");


--
-- Name: mail_cooldowns mail_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_cooldowns"
    ADD CONSTRAINT "mail_cooldowns_pkey" PRIMARY KEY ("action_key", "target_key");


--
-- Name: mail_function_logs mail_function_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_function_logs"
    ADD CONSTRAINT "mail_function_logs_pkey" PRIMARY KEY ("id");


--
-- Name: mail_notification_allocations mail_notification_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_pkey" PRIMARY KEY ("id");


--
-- Name: mail_queue mail_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_pkey" PRIMARY KEY ("id");


--
-- Name: mail_settings mail_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_settings"
    ADD CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id");


--
-- Name: market_game_ratings market_game_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_game_ratings"
    ADD CONSTRAINT "market_game_ratings_pkey" PRIMARY KEY ("market_game_id", "user_id");


--
-- Name: market_games market_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_games"
    ADD CONSTRAINT "market_games_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_ai_providers marketing_ai_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_ai_providers"
    ADD CONSTRAINT "marketing_ai_providers_pkey" PRIMARY KEY ("name");


--
-- Name: marketing_cities marketing_cities_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_cities"
    ADD CONSTRAINT "marketing_cities_name_key" UNIQUE ("name");


--
-- Name: marketing_cities marketing_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_cities"
    ADD CONSTRAINT "marketing_cities_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_raw_contacts marketing_raw_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_raw_contacts"
    ADD CONSTRAINT "marketing_raw_contacts_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_raw_contacts marketing_raw_contacts_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_raw_contacts"
    ADD CONSTRAINT "marketing_raw_contacts_url_key" UNIQUE ("url");


--
-- Name: marketing_search_logs marketing_search_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_search_logs"
    ADD CONSTRAINT "marketing_search_logs_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_search_queries_log marketing_search_queries_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_search_queries_log"
    ADD CONSTRAINT "marketing_search_queries_log_pkey" PRIMARY KEY ("id");


--
-- Name: marketing_search_queries_log marketing_search_queries_log_query_text_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_search_queries_log"
    ADD CONSTRAINT "marketing_search_queries_log_query_text_key" UNIQUE ("query_text");


--
-- Name: marketing_verified_contacts marketing_verified_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketing_verified_contacts"
    ADD CONSTRAINT "marketing_verified_contacts_pkey" PRIMARY KEY ("id");


--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");


--
-- Name: poll_anonymous_limits poll_anonymous_limits_game_id_key_hash_voter_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_anonymous_limits"
    ADD CONSTRAINT "poll_anonymous_limits_game_id_key_hash_voter_hash_key" UNIQUE ("game_id", "key_hash", "voter_hash");


--
-- Name: poll_anonymous_limits poll_anonymous_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_anonymous_limits"
    ADD CONSTRAINT "poll_anonymous_limits_pkey" PRIMARY KEY ("game_id", "key_hash", "browser_hash");


--
-- Name: poll_mail_budget_events poll_mail_budget_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_mail_budget_events"
    ADD CONSTRAINT "poll_mail_budget_events_pkey" PRIMARY KEY ("queue_id");


--
-- Name: poll_sessions poll_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_sessions"
    ADD CONSTRAINT "poll_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: poll_subscriptions poll_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_subscriptions"
    ADD CONSTRAINT "poll_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: poll_tally_drafts poll_tally_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tally_drafts"
    ADD CONSTRAINT "poll_tally_drafts_pkey" PRIMARY KEY ("game_id");


--
-- Name: poll_tasks poll_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tasks"
    ADD CONSTRAINT "poll_tasks_pkey" PRIMARY KEY ("id");


--
-- Name: poll_tasks poll_tasks_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tasks"
    ADD CONSTRAINT "poll_tasks_token_key" UNIQUE ("token");


--
-- Name: poll_text_entries poll_text_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_text_entries"
    ADD CONSTRAINT "poll_text_entries_pkey" PRIMARY KEY ("id");


--
-- Name: poll_votes poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: public_kv public_kv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."public_kv"
    ADD CONSTRAINT "public_kv_pkey" PRIMARY KEY ("key");


--
-- Name: qb_categories qb_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_categories"
    ADD CONSTRAINT "qb_categories_pkey" PRIMARY KEY ("id");


--
-- Name: qb_category_tags qb_category_tags_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_category_tags"
    ADD CONSTRAINT "qb_category_tags_pk" PRIMARY KEY ("category_id", "tag_id");


--
-- Name: qb_question_tags qb_question_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_question_tags"
    ADD CONSTRAINT "qb_question_tags_pkey" PRIMARY KEY ("question_id", "tag_id");


--
-- Name: qb_questions qb_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_questions"
    ADD CONSTRAINT "qb_questions_pkey" PRIMARY KEY ("id");


--
-- Name: qb_tags qb_tags_base_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_tags"
    ADD CONSTRAINT "qb_tags_base_id_name_key" UNIQUE ("base_id", "name");


--
-- Name: qb_tags qb_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_tags"
    ADD CONSTRAINT "qb_tags_pkey" PRIMARY KEY ("id");


--
-- Name: question_base_shares question_base_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."question_base_shares"
    ADD CONSTRAINT "question_base_shares_pkey" PRIMARY KEY ("base_id", "user_id");


--
-- Name: question_bases question_bases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."question_bases"
    ADD CONSTRAINT "question_bases_pkey" PRIMARY KEY ("id");


--
-- Name: questions questions_game_ord_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_game_ord_uniq" UNIQUE ("game_id", "ord");


--
-- Name: questions questions_game_ord_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_game_ord_unique" UNIQUE ("game_id", "ord");


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");


--
-- Name: reports reports_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_ticket_number_key" UNIQUE ("ticket_number");


--
-- Name: reserved_username_accounts reserved_username_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reserved_username_accounts"
    ADD CONSTRAINT "reserved_username_accounts_pkey" PRIMARY KEY ("user_id", "username");


--
-- Name: reserved_username_prefixes reserved_username_prefixes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reserved_username_prefixes"
    ADD CONSTRAINT "reserved_username_prefixes_pkey" PRIMARY KEY ("prefix");


--
-- Name: resource_clone_assets resource_clone_assets_destination_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_assets"
    ADD CONSTRAINT "resource_clone_assets_destination_path_key" UNIQUE ("destination_path");


--
-- Name: resource_clone_assets resource_clone_assets_job_id_reference_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_assets"
    ADD CONSTRAINT "resource_clone_assets_job_id_reference_hash_key" UNIQUE ("job_id", "reference_hash");


--
-- Name: resource_clone_assets resource_clone_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_assets"
    ADD CONSTRAINT "resource_clone_assets_pkey" PRIMARY KEY ("id");


--
-- Name: resource_clone_jobs resource_clone_jobs_actor_identity_recipient_id_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_jobs"
    ADD CONSTRAINT "resource_clone_jobs_actor_identity_recipient_id_request_id_key" UNIQUE ("actor_identity", "recipient_id", "request_id");


--
-- Name: resource_clone_jobs resource_clone_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_jobs"
    ADD CONSTRAINT "resource_clone_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: resource_clone_receipts resource_clone_receipts_creator_identity_recipient_id_reque_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_receipts"
    ADD CONSTRAINT "resource_clone_receipts_creator_identity_recipient_id_reque_key" UNIQUE ("creator_identity", "recipient_id", "request_id");


--
-- Name: resource_clone_receipts resource_clone_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_receipts"
    ADD CONSTRAINT "resource_clone_receipts_pkey" PRIMARY KEY ("id");


--
-- Name: resource_copy_history resource_copy_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_history"
    ADD CONSTRAINT "resource_copy_history_pkey" PRIMARY KEY ("id");


--
-- Name: resource_copy_offers resource_copy_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_offers"
    ADD CONSTRAINT "resource_copy_offers_pkey" PRIMARY KEY ("id");


--
-- Name: resource_copy_offers resource_copy_offers_sender_identity_request_id_recipient_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_offers"
    ADD CONSTRAINT "resource_copy_offers_sender_identity_request_id_recipient_i_key" UNIQUE ("sender_identity", "request_id", "recipient_id");


--
-- Name: resource_copy_offers resource_copy_offers_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_offers"
    ADD CONSTRAINT "resource_copy_offers_token_key" UNIQUE ("token");


--
-- Name: resource_demo_origins resource_demo_origins_base_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_base_id_key" UNIQUE ("base_id");


--
-- Name: resource_demo_origins resource_demo_origins_game_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_game_id_key" UNIQUE ("game_id");


--
-- Name: resource_demo_origins resource_demo_origins_logo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_logo_id_key" UNIQUE ("logo_id");


--
-- Name: resource_demo_origins resource_demo_origins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_pkey" PRIMARY KEY ("id");


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("filename");


--
-- Name: shared_devices shared_devices_owner_id_recipient_id_device_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shared_devices"
    ADD CONSTRAINT "shared_devices_owner_id_recipient_id_device_type_key" UNIQUE ("owner_id", "recipient_id", "device_type");


--
-- Name: shared_devices shared_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shared_devices"
    ADD CONSTRAINT "shared_devices_pkey" PRIMARY KEY ("id");


--
-- Name: site_activity_hours site_activity_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_activity_hours"
    ADD CONSTRAINT "site_activity_hours_pkey" PRIMARY KEY ("bucket", "user_id");


--
-- Name: site_activity site_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_activity"
    ADD CONSTRAINT "site_activity_pkey" PRIMARY KEY ("user_id", "tab_id");


--
-- Name: stats_excluded_users stats_excluded_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."stats_excluded_users"
    ADD CONSTRAINT "stats_excluded_users_pkey" PRIMARY KEY ("user_id");


--
-- Name: storage_cleanup_queue storage_cleanup_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."storage_cleanup_queue"
    ADD CONSTRAINT "storage_cleanup_queue_pkey" PRIMARY KEY ("id");


--
-- Name: user_cooldowns user_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_cooldowns"
    ADD CONSTRAINT "user_cooldowns_pkey" PRIMARY KEY ("user_id", "action_key");


--
-- Name: user_flags user_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_flags"
    ADD CONSTRAINT "user_flags_pkey" PRIMARY KEY ("user_id");


--
-- Name: user_logos user_logos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_logos"
    ADD CONSTRAINT "user_logos_pkey" PRIMARY KEY ("id");


--
-- Name: user_market_library user_market_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_market_library"
    ADD CONSTRAINT "user_market_library_pkey" PRIMARY KEY ("user_id", "market_game_id");


--
-- Name: answers_q_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "answers_q_idx" ON "public"."answers" USING "btree" ("question_id");


--
-- Name: base_share_tasks_base_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "base_share_tasks_base_id_idx" ON "public"."base_share_tasks" USING "btree" ("base_id");


--
-- Name: base_share_tasks_owner_base_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "base_share_tasks_owner_base_idx" ON "public"."base_share_tasks" USING "btree" ("owner_id", "base_id");


--
-- Name: base_share_tasks_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "base_share_tasks_recipient_idx" ON "public"."base_share_tasks" USING "btree" ("recipient_user_id");


--
-- Name: base_share_tasks_source_friendship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "base_share_tasks_source_friendship_idx" ON "public"."base_share_tasks" USING "btree" ("source_friendship_id");


--
-- Name: base_share_tasks_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "base_share_tasks_status_created_idx" ON "public"."base_share_tasks" USING "btree" ("status", "created_at");


--
-- Name: base_share_tasks_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "base_share_tasks_token_idx" ON "public"."base_share_tasks" USING "btree" ("token");


--
-- Name: control2_device_events_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "control2_device_events_event_id_idx" ON "public"."control2_device_events" USING "btree" ("game_id", "event_id") WHERE ("event_id" IS NOT NULL);


--
-- Name: control2_device_events_game_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "control2_device_events_game_created_idx" ON "public"."control2_device_events" USING "btree" ("game_id", "created_at" DESC, "id" DESC);


--
-- Name: control_device_connections_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "control_device_connections_expiry_idx" ON "public"."control_device_connections" USING "btree" ("last_seen_at") WHERE ("state" = ANY (ARRAY['waiting'::"text", 'primary'::"text"]));


--
-- Name: control_device_connections_one_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "control_device_connections_one_primary_idx" ON "public"."control_device_connections" USING "btree" ("session_id", "device_type") WHERE ("state" = 'primary'::"text");


--
-- Name: control_device_connections_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "control_device_connections_queue_idx" ON "public"."control_device_connections" USING "btree" ("session_id", "device_type", "requested_at", "id") WHERE ("state" = 'waiting'::"text");


--
-- Name: control_device_shares_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "control_device_shares_email_unique" ON "public"."control_device_shares" USING "btree" ("session_id", "recipient_email", "device_type") WHERE (("recipient_id" IS NULL) AND ("revoked_at" IS NULL));


--
-- Name: control_device_shares_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "control_device_shares_session_idx" ON "public"."control_device_shares" USING "btree" ("session_id");


--
-- Name: control_device_shares_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "control_device_shares_user_unique" ON "public"."control_device_shares" USING "btree" ("session_id", "recipient_id", "device_type") WHERE (("recipient_id" IS NOT NULL) AND ("revoked_at" IS NULL));


--
-- Name: control_runtime_sessions_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "control_runtime_sessions_expiry_idx" ON "public"."control_runtime_sessions" USING "btree" ("expires_at") WHERE ("ended_at" IS NULL);


--
-- Name: control_runtime_sessions_one_active_per_game; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "control_runtime_sessions_one_active_per_game" ON "public"."control_runtime_sessions" USING "btree" ("game_id") WHERE ("ended_at" IS NULL);


--
-- Name: copy_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "copy_inbox" ON "public"."resource_copy_offers" USING "btree" ("recipient_id", "resource_kind", "variant", "status", "created_at");


--
-- Name: copy_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "copy_pair" ON "public"."resource_copy_offers" USING "btree" ("sender_identity", "source_id", "recipient_id", "status", "decided_at");


--
-- Name: crm_report_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crm_report_id_idx" ON "public"."contact_report_messages" USING "btree" ("report_id", "created_at");


--
-- Name: e2e_emails_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "e2e_emails_expires_idx" ON "public"."e2e_emails" USING "btree" ("expires_at");


--
-- Name: e2e_emails_recipient_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "e2e_emails_recipient_received_idx" ON "public"."e2e_emails" USING "btree" ("recipient", "received_at" DESC);


--
-- Name: edit_locks_exclusive_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "edit_locks_exclusive_uidx" ON "public"."edit_locks" USING "btree" ("resource_type", "resource_id") WHERE ("mode" = 'exclusive'::"text");


--
-- Name: email_intents_cooldown_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "email_intents_cooldown_idx" ON "public"."email_intents" USING "btree" ("cooldown_until");


--
-- Name: email_intents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "email_intents_status_idx" ON "public"."email_intents" USING "btree" ("status");


--
-- Name: example_table_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "example_table_created_at_idx" ON "public"."example_table" USING "btree" ("created_at" DESC);


--
-- Name: friendships_addressee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "friendships_addressee_idx" ON "public"."friendships" USING "btree" ("addressee_id");


--
-- Name: friendships_pair_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "friendships_pair_uniq" ON "public"."friendships" USING "btree" (LEAST("requester_id", "addressee_id"), GREATEST("requester_id", "addressee_id"));


--
-- Name: friendships_requester_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "friendships_requester_idx" ON "public"."friendships" USING "btree" ("requester_id");


--
-- Name: friendships_source_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "friendships_source_subscription_idx" ON "public"."friendships" USING "btree" ("source_subscription_id");


--
-- Name: game_gen_queue_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "game_gen_queue_created_by_idx" ON "public"."game_gen_queue" USING "btree" ("created_by", "created_at" DESC);


--
-- Name: game_gen_queue_pick_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "game_gen_queue_pick_idx" ON "public"."game_gen_queue" USING "btree" ("status", "created_at");


--
-- Name: game_sessions_control2_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "game_sessions_control2_start_idx" ON "public"."game_sessions" USING "btree" ("game_id", "start_rev") WHERE ("control_version" = 2);


--
-- Name: game_sessions_game_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "game_sessions_game_id_idx" ON "public"."game_sessions" USING "btree" ("game_id");


--
-- Name: game_sessions_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "game_sessions_started_at_idx" ON "public"."game_sessions" USING "btree" ("started_at");


--
-- Name: game_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "game_sessions_status_idx" ON "public"."game_sessions" USING "btree" ("status");


--
-- Name: game_state_history_game_id_rev_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "game_state_history_game_id_rev_idx" ON "public"."game_state_history" USING "btree" ("game_id", "rev" DESC);


--
-- Name: games_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "games_created_at_idx" ON "public"."games" USING "btree" ("created_at" DESC);


--
-- Name: games_keys_control_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "games_keys_control_idx" ON "public"."games" USING "btree" ("share_key_control");


--
-- Name: games_keys_display_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "games_keys_display_idx" ON "public"."games" USING "btree" ("share_key_display");


--
-- Name: games_keys_host_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "games_keys_host_idx" ON "public"."games" USING "btree" ("share_key_host");


--
-- Name: games_keys_poll_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "games_keys_poll_idx" ON "public"."games" USING "btree" ("share_key_poll");


--
-- Name: games_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "games_owner_idx" ON "public"."games" USING "btree" ("owner_id");


--
-- Name: games_owner_market_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "games_owner_market_uniq" ON "public"."games" USING "btree" ("owner_id", "source_market_id") WHERE ("source_market_id" IS NOT NULL);


--
-- Name: games_source_market_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "games_source_market_id_idx" ON "public"."games" USING "btree" ("source_market_id") WHERE ("source_market_id" IS NOT NULL);


--
-- Name: idx_marketing_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marketing_logs_created" ON "public"."marketing_search_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_marketing_raw_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marketing_raw_status" ON "public"."marketing_raw_contacts" USING "btree" ("status") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_marketing_verified_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marketing_verified_email" ON "public"."marketing_verified_contacts" USING "btree" ("email");


--
-- Name: idx_marketing_verified_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marketing_verified_used" ON "public"."marketing_verified_contacts" USING "btree" ("is_used");


--
-- Name: idx_messages_marketing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_marketing" ON "public"."messages" USING "btree" ("direction", "is_marketing", "created_at") WHERE (("deleted_at" IS NULL) AND ("is_marketing" = true));


--
-- Name: idx_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_unread" ON "public"."messages" USING "btree" ("direction", "is_read", "report_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_poll_text_entries_game_user_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_poll_text_entries_game_user_token" ON "public"."poll_text_entries" USING "btree" ("game_id", "voter_user_id", "voter_token");


--
-- Name: idx_poll_votes_game_user_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_poll_votes_game_user_token" ON "public"."poll_votes" USING "btree" ("game_id", "voter_user_id", "voter_token");


--
-- Name: idx_questions_game; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_questions_game" ON "public"."questions" USING "btree" ("game_id");


--
-- Name: mail_center_links_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_center_links_email_idx" ON "public"."mail_center_links" USING "btree" ("email") WHERE ("revoked_at" IS NULL);


--
-- Name: mail_center_links_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_center_links_expires_at_idx" ON "public"."mail_center_links" USING "btree" ("expires_at");


--
-- Name: mail_center_request_events_email_hash_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_center_request_events_email_hash_created_at_idx" ON "public"."mail_center_request_events" USING "btree" ("email_hash", "created_at");


--
-- Name: mail_center_request_events_ip_hash_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_center_request_events_ip_hash_created_at_idx" ON "public"."mail_center_request_events" USING "btree" ("ip_hash", "created_at");


--
-- Name: mail_center_sessions_link_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_center_sessions_link_id_idx" ON "public"."mail_center_sessions" USING "btree" ("link_id");


--
-- Name: mail_function_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_function_logs_created_at_idx" ON "public"."mail_function_logs" USING "btree" ("created_at" DESC);


--
-- Name: mail_function_logs_fn_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_function_logs_fn_created_idx" ON "public"."mail_function_logs" USING "btree" ("function_name", "created_at" DESC);


--
-- Name: mail_function_logs_level_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_function_logs_level_created_idx" ON "public"."mail_function_logs" USING "btree" ("level", "created_at" DESC);


--
-- Name: mail_function_logs_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_function_logs_queue_idx" ON "public"."mail_function_logs" USING "btree" ("queue_id");


--
-- Name: mail_function_logs_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_function_logs_request_idx" ON "public"."mail_function_logs" USING "btree" ("request_id");


--
-- Name: mail_notification_allocations_copy_offer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_notification_allocations_copy_offer_id_idx" ON "public"."mail_notification_allocations" USING "btree" ("copy_offer_id") WHERE ("copy_offer_id" IS NOT NULL);


--
-- Name: mail_notification_allocations_source_kind_source_token_crea_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_notification_allocations_source_kind_source_token_crea_idx" ON "public"."mail_notification_allocations" USING "btree" ("source_kind", "source_token", "created_at" DESC) WHERE (("consumed_at" IS NULL) AND ("revoked_at" IS NULL));


--
-- Name: mail_queue_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_created_by_idx" ON "public"."mail_queue" USING "btree" ("created_by", "created_at" DESC);


--
-- Name: mail_queue_notification_allocation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "mail_queue_notification_allocation_id_idx" ON "public"."mail_queue" USING "btree" ("notification_allocation_id") WHERE ("notification_allocation_id" IS NOT NULL);


--
-- Name: mail_queue_notification_base_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_notification_base_task_id_idx" ON "public"."mail_queue" USING "btree" ("notification_base_task_id") WHERE ("notification_base_task_id" IS NOT NULL);


--
-- Name: mail_queue_notification_copy_offer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_notification_copy_offer_id_idx" ON "public"."mail_queue" USING "btree" ("notification_copy_offer_id") WHERE ("notification_copy_offer_id" IS NOT NULL);


--
-- Name: mail_queue_notification_device_share_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_notification_device_share_id_idx" ON "public"."mail_queue" USING "btree" ("notification_device_share_id") WHERE ("notification_device_share_id" IS NOT NULL);


--
-- Name: mail_queue_notification_friendship_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_notification_friendship_id_idx" ON "public"."mail_queue" USING "btree" ("notification_friendship_id") WHERE ("notification_friendship_id" IS NOT NULL);


--
-- Name: mail_queue_notification_poll_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_notification_poll_task_id_idx" ON "public"."mail_queue" USING "btree" ("notification_poll_task_id") WHERE ("notification_poll_task_id" IS NOT NULL);


--
-- Name: mail_queue_notification_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_notification_subscription_id_idx" ON "public"."mail_queue" USING "btree" ("notification_subscription_id") WHERE ("notification_subscription_id" IS NOT NULL);


--
-- Name: mail_queue_pick_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "mail_queue_pick_idx" ON "public"."mail_queue" USING "btree" ("status", "not_before", "created_at");


--
-- Name: market_games_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_games_author_idx" ON "public"."market_games" USING "btree" ("author_user_id");


--
-- Name: market_games_embedding_ivfflat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_games_embedding_ivfflat_idx" ON "public"."market_games" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');


--
-- Name: market_games_lang_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_games_lang_idx" ON "public"."market_games" USING "btree" ("lang");


--
-- Name: market_games_library_cnt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_games_library_cnt_idx" ON "public"."market_games" USING "btree" ("library_count" DESC);


--
-- Name: market_games_questions_fingerprint_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_games_questions_fingerprint_idx" ON "public"."market_games" USING "btree" ("lang", "questions_fingerprint") WHERE ("questions_fingerprint" IS NOT NULL);


--
-- Name: market_games_questions_text_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_games_questions_text_trgm_idx" ON "public"."market_games" USING "gin" ("questions_text" "public"."gin_trgm_ops");


--
-- Name: market_games_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "market_games_slug_key" ON "public"."market_games" USING "btree" ("slug");


--
-- Name: market_games_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_games_status_idx" ON "public"."market_games" USING "btree" ("status");


--
-- Name: message_attachments_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "message_attachments_message_id_idx" ON "public"."message_attachments" USING "btree" ("message_id");


--
-- Name: messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_created_at_idx" ON "public"."messages" USING "btree" ("created_at" DESC);


--
-- Name: messages_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_deleted_at_idx" ON "public"."messages" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);


--
-- Name: messages_direction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_direction_idx" ON "public"."messages" USING "btree" ("direction");


--
-- Name: messages_report_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_report_id_idx" ON "public"."messages" USING "btree" ("report_id") WHERE ("report_id" IS NOT NULL);


--
-- Name: poll_mail_budget_pair_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_mail_budget_pair_time" ON "public"."poll_mail_budget_events" USING "btree" ("owner_id", "recipient_key", "created_at" DESC);


--
-- Name: poll_sessions_game_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_sessions_game_idx" ON "public"."poll_sessions" USING "btree" ("game_id");


--
-- Name: poll_sessions_game_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_sessions_game_open_idx" ON "public"."poll_sessions" USING "btree" ("game_id", "is_open", "created_at" DESC);


--
-- Name: poll_subscriptions_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_subscriptions_owner_idx" ON "public"."poll_subscriptions" USING "btree" ("owner_id");


--
-- Name: poll_subscriptions_registered_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_subscriptions_registered_user_idx" ON "public"."poll_subscriptions" USING "btree" ("registered_user_id");


--
-- Name: poll_subscriptions_sub_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_subscriptions_sub_email_idx" ON "public"."poll_subscriptions" USING "btree" ("subscriber_email");


--
-- Name: poll_subscriptions_sub_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_subscriptions_sub_user_idx" ON "public"."poll_subscriptions" USING "btree" ("subscriber_user_id");


--
-- Name: poll_subscriptions_token_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "poll_subscriptions_token_uq" ON "public"."poll_subscriptions" USING "btree" ("token");


--
-- Name: poll_tasks_game_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_tasks_game_idx" ON "public"."poll_tasks" USING "btree" ("game_id");


--
-- Name: poll_tasks_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_tasks_owner_idx" ON "public"."poll_tasks" USING "btree" ("owner_id");


--
-- Name: poll_tasks_recipient_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_tasks_recipient_email_idx" ON "public"."poll_tasks" USING "btree" ("lower"("recipient_email"));


--
-- Name: poll_tasks_recipient_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_tasks_recipient_user_idx" ON "public"."poll_tasks" USING "btree" ("recipient_user_id");


--
-- Name: poll_tasks_source_friendship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_tasks_source_friendship_idx" ON "public"."poll_tasks" USING "btree" ("source_friendship_id");


--
-- Name: poll_tasks_source_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_tasks_source_subscription_idx" ON "public"."poll_tasks" USING "btree" ("source_subscription_id");


--
-- Name: poll_text_entries_voter_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_text_entries_voter_user_idx" ON "public"."poll_text_entries" USING "btree" ("voter_user_id");


--
-- Name: poll_votes_by_answer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_votes_by_answer" ON "public"."poll_votes" USING "btree" ("answer_id");


--
-- Name: poll_votes_by_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_votes_by_session" ON "public"."poll_votes" USING "btree" ("poll_session_id");


--
-- Name: poll_votes_game_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_votes_game_idx" ON "public"."poll_votes" USING "btree" ("game_id");


--
-- Name: poll_votes_game_q_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_votes_game_q_idx" ON "public"."poll_votes" USING "btree" ("game_id", "question_ord");


--
-- Name: poll_votes_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_votes_session_idx" ON "public"."poll_votes" USING "btree" ("poll_session_id");


--
-- Name: poll_votes_unique_per_q; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "poll_votes_unique_per_q" ON "public"."poll_votes" USING "btree" ("poll_session_id", "question_id", "voter_token");


--
-- Name: poll_votes_voter_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_votes_voter_user_idx" ON "public"."poll_votes" USING "btree" ("voter_user_id");


--
-- Name: profiles_guest_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profiles_guest_expires_idx" ON "public"."profiles" USING "btree" ("guest_expires_at") WHERE ("is_guest" = true);


--
-- Name: profiles_username_ci_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "profiles_username_ci_uq" ON "public"."profiles" USING "btree" ("lower"("username"));


--
-- Name: profiles_username_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "profiles_username_unique" ON "public"."profiles" USING "btree" ("lower"("username")) WHERE (("username" IS NOT NULL) AND ("username" <> ''::"text"));


--
-- Name: profiles_username_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "profiles_username_uq" ON "public"."profiles" USING "btree" ("username");


--
-- Name: pte_by_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pte_by_question" ON "public"."poll_text_entries" USING "btree" ("question_id");


--
-- Name: pte_by_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pte_by_session" ON "public"."poll_text_entries" USING "btree" ("poll_session_id");


--
-- Name: pte_unique_per_q; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "pte_unique_per_q" ON "public"."poll_text_entries" USING "btree" ("poll_session_id", "question_id", "voter_token");


--
-- Name: qb_categories_base_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_categories_base_id_idx" ON "public"."qb_categories" USING "btree" ("base_id");


--
-- Name: qb_categories_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_categories_parent_id_idx" ON "public"."qb_categories" USING "btree" ("parent_id");


--
-- Name: qb_category_tags_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_category_tags_category_id_idx" ON "public"."qb_category_tags" USING "btree" ("category_id");


--
-- Name: qb_category_tags_tag_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_category_tags_tag_id_idx" ON "public"."qb_category_tags" USING "btree" ("tag_id");


--
-- Name: qb_question_tags_question_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_question_tags_question_id_idx" ON "public"."qb_question_tags" USING "btree" ("question_id");


--
-- Name: qb_question_tags_tag_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_question_tags_tag_id_idx" ON "public"."qb_question_tags" USING "btree" ("tag_id");


--
-- Name: qb_questions_base_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_questions_base_id_idx" ON "public"."qb_questions" USING "btree" ("base_id");


--
-- Name: qb_questions_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_questions_category_id_idx" ON "public"."qb_questions" USING "btree" ("category_id");


--
-- Name: qb_questions_payload_text_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_questions_payload_text_idx" ON "public"."qb_questions" USING "btree" ("lower"(("payload" ->> 'text'::"text")));


--
-- Name: qb_tags_base_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qb_tags_base_id_idx" ON "public"."qb_tags" USING "btree" ("base_id");


--
-- Name: question_base_shares_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "question_base_shares_user_id_idx" ON "public"."question_base_shares" USING "btree" ("user_id");


--
-- Name: question_bases_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "question_bases_owner_id_idx" ON "public"."question_bases" USING "btree" ("owner_id");


--
-- Name: questions_game_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "questions_game_idx" ON "public"."questions" USING "btree" ("game_id");


--
-- Name: questions_game_ord_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "questions_game_ord_idx" ON "public"."questions" USING "btree" ("game_id", "ord");


--
-- Name: questions_game_ord_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "questions_game_ord_uq" ON "public"."questions" USING "btree" ("game_id", "ord");


--
-- Name: reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reports_status_idx" ON "public"."reports" USING "btree" ("status");


--
-- Name: resource_copy_history_retention; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "resource_copy_history_retention" ON "public"."resource_copy_history" USING "btree" ("sent_at");


--
-- Name: site_activity_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "site_activity_seen_idx" ON "public"."site_activity" USING "btree" ("last_seen_at");


--
-- Name: uml_market_game_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "uml_market_game_idx" ON "public"."user_market_library" USING "btree" ("market_game_id");


--
-- Name: user_logos_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_logos_user_id_idx" ON "public"."user_logos" USING "btree" ("user_id");


--
-- Name: user_logos_user_name_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_logos_user_name_uniq" ON "public"."user_logos" USING "btree" ("user_id", "name");


--
-- Name: friendships base_friend_source_close; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "base_friend_source_close" AFTER UPDATE OF "status", "cancelled_at" ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."_base_friend_source_close"();


--
-- Name: friendships base_friend_source_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "base_friend_source_delete" BEFORE DELETE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."_base_friend_source_close"();


--
-- Name: games clone_demo_origin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "clone_demo_origin" AFTER INSERT OR UPDATE OF "is_demo" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."_resource_demo_origin_mark"();


--
-- Name: question_bases clone_demo_origin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "clone_demo_origin" AFTER INSERT OR UPDATE OF "is_demo" ON "public"."question_bases" FOR EACH ROW EXECUTE FUNCTION "public"."_resource_demo_origin_mark"();


--
-- Name: user_logos clone_demo_origin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "clone_demo_origin" AFTER INSERT OR UPDATE OF "is_demo" ON "public"."user_logos" FOR EACH ROW EXECUTE FUNCTION "public"."_resource_demo_origin_mark"();


--
-- Name: resource_clone_jobs clone_job_cleanup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "clone_job_cleanup" BEFORE DELETE ON "public"."resource_clone_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."_resource_clone_job_delete"();


--
-- Name: resource_clone_jobs clone_job_cleanup_kick; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "clone_job_cleanup_kick" AFTER DELETE ON "public"."resource_clone_jobs" FOR EACH STATEMENT EXECUTE FUNCTION "public"."_storage_cleanup_kick_trigger"();


--
-- Name: user_logos clone_logo_cleanup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "clone_logo_cleanup" BEFORE DELETE ON "public"."user_logos" FOR EACH ROW EXECUTE FUNCTION "public"."_resource_clone_logo_delete"();


--
-- Name: contact_reports contact_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "contact_reports_updated_at" BEFORE UPDATE ON "public"."contact_reports" FOR EACH ROW EXECUTE FUNCTION "public"."contact_reports_set_updated_at"();


--
-- Name: control_device_connections control_device_connections_log_lease_state; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "control_device_connections_log_lease_state" AFTER INSERT OR UPDATE OF "state" ON "public"."control_device_connections" FOR EACH ROW EXECUTE FUNCTION "public"."_control2_log_device_lease_transition"();


--
-- Name: answers copy_pending_answer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_answer" BEFORE INSERT OR DELETE OR UPDATE ON "public"."answers" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: control_device_link_tokens copy_pending_control_device_link_tokens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_control_device_link_tokens" BEFORE INSERT OR DELETE OR UPDATE ON "public"."control_device_link_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: control_device_shares copy_pending_control_device_shares; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_control_device_shares" BEFORE INSERT OR DELETE OR UPDATE ON "public"."control_device_shares" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: control_runtime_sessions copy_pending_control_runtime_sessions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_control_runtime_sessions" BEFORE INSERT OR DELETE OR UPDATE ON "public"."control_runtime_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: device_connect_codes copy_pending_device_connect_codes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_device_connect_codes" BEFORE INSERT OR DELETE OR UPDATE ON "public"."device_connect_codes" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: device_presence copy_pending_device_presence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_device_presence" BEFORE INSERT OR DELETE OR UPDATE ON "public"."device_presence" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: display_audio_unlock copy_pending_display_audio_unlock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_display_audio_unlock" BEFORE INSERT OR DELETE OR UPDATE ON "public"."display_audio_unlock" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: games copy_pending_game; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_game" BEFORE DELETE OR UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: game_session_active copy_pending_game_session_active; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_game_session_active" BEFORE INSERT OR DELETE OR UPDATE ON "public"."game_session_active" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: game_sessions copy_pending_game_sessions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_game_sessions" BEFORE INSERT OR DELETE OR UPDATE ON "public"."game_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: game_state_history copy_pending_game_state_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_game_state_history" BEFORE INSERT OR DELETE OR UPDATE ON "public"."game_state_history" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: user_logos copy_pending_logo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_logo" BEFORE DELETE OR UPDATE ON "public"."user_logos" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: market_games copy_pending_market_games; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_market_games" BEFORE INSERT OR DELETE OR UPDATE ON "public"."market_games" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: poll_anonymous_limits copy_pending_poll_anonymous_limits; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_poll_anonymous_limits" BEFORE INSERT OR DELETE OR UPDATE ON "public"."poll_anonymous_limits" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: poll_sessions copy_pending_poll_sessions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_poll_sessions" BEFORE INSERT OR DELETE OR UPDATE ON "public"."poll_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: poll_tally_drafts copy_pending_poll_tally_drafts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_poll_tally_drafts" BEFORE INSERT OR DELETE OR UPDATE ON "public"."poll_tally_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: poll_tasks copy_pending_poll_tasks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_poll_tasks" BEFORE INSERT OR DELETE OR UPDATE ON "public"."poll_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: poll_text_entries copy_pending_poll_text_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_poll_text_entries" BEFORE INSERT OR DELETE OR UPDATE ON "public"."poll_text_entries" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: poll_votes copy_pending_poll_votes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_poll_votes" BEFORE INSERT OR DELETE OR UPDATE ON "public"."poll_votes" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: questions copy_pending_question; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_question" BEFORE INSERT OR DELETE OR UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: game_state copy_pending_runtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_runtime" BEFORE INSERT OR DELETE OR UPDATE ON "public"."game_state" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: shared_devices copy_pending_shared_devices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_shared_devices" BEFORE INSERT OR DELETE OR UPDATE ON "public"."shared_devices" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: user_market_library copy_pending_user_market_library; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "copy_pending_user_market_library" BEFORE INSERT OR DELETE OR UPDATE ON "public"."user_market_library" FOR EACH ROW EXECUTE FUNCTION "public"."_copy_pending_guard"();


--
-- Name: poll_subscriptions friend_source_closed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "friend_source_closed" AFTER UPDATE OF "status", "cancelled_at", "declined_at" ON "public"."poll_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_friend_source_closed"();


--
-- Name: poll_subscriptions friend_source_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "friend_source_delete" BEFORE DELETE ON "public"."poll_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_friend_source_closed"();


--
-- Name: friendships friendships_accept_cleanup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "friendships_accept_cleanup" AFTER INSERT OR UPDATE OF "status" ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."_friend_accept_cleanup"();


--
-- Name: friendships friendships_initial_decision_user; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "friendships_initial_decision_user" BEFORE INSERT ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."_friend_initial_decision_user"();


--
-- Name: game_state game_state_track_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "game_state_track_session" AFTER INSERT OR UPDATE OF "detail", "step", "phase" ON "public"."game_state" FOR EACH ROW EXECUTE FUNCTION "public"."track_control2_session"();


--
-- Name: game_state guard_final_display_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "guard_final_display_completion" BEFORE UPDATE ON "public"."game_state" FOR EACH ROW EXECUTE FUNCTION "public"."guard_final_display_completion"();


--
-- Name: profiles poll_identity_profile; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "poll_identity_profile" AFTER INSERT OR UPDATE OF "email", "is_guest" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."_poll_identity_profile_trigger"();


--
-- Name: poll_tasks poll_identity_task_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "poll_identity_task_insert" BEFORE INSERT ON "public"."poll_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."_poll_identity_task_insert"();


--
-- Name: poll_tasks poll_tasks_cleanup_partial_votes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "poll_tasks_cleanup_partial_votes" BEFORE DELETE OR UPDATE OF "status" ON "public"."poll_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."_poll_task_cleanup_partial_votes"();


--
-- Name: profiles profiles_reserve_test_username; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "profiles_reserve_test_username" BEFORE INSERT OR UPDATE OF "username" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_reserve_test_username"();


--
-- Name: game_state request_display_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "request_display_completion" AFTER INSERT OR UPDATE ON "public"."game_state" FOR EACH ROW EXECUTE FUNCTION "public"."request_display_completion"();


--
-- Name: resource_copy_offers resource_copy_mail_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "resource_copy_mail_epoch" AFTER UPDATE ON "public"."resource_copy_offers" FOR EACH ROW EXECUTE FUNCTION "public"."_resource_copy_mail_epoch"();


--
-- Name: games storage_cleanup_kick; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "storage_cleanup_kick" AFTER DELETE ON "public"."games" FOR EACH STATEMENT EXECUTE FUNCTION "public"."_storage_cleanup_kick_trigger"();


--
-- Name: profiles storage_cleanup_kick; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "storage_cleanup_kick" AFTER DELETE ON "public"."profiles" FOR EACH STATEMENT EXECUTE FUNCTION "public"."_storage_cleanup_kick_trigger"();


--
-- Name: user_logos storage_cleanup_kick; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "storage_cleanup_kick" AFTER DELETE ON "public"."user_logos" FOR EACH STATEMENT EXECUTE FUNCTION "public"."_storage_cleanup_kick_trigger"();


--
-- Name: games storage_cleanup_row; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "storage_cleanup_row" AFTER DELETE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."_storage_cleanup_on_game_delete"();


--
-- Name: profiles storage_cleanup_row; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "storage_cleanup_row" AFTER DELETE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."_storage_cleanup_on_profile_delete"();


--
-- Name: user_logos storage_cleanup_row; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "storage_cleanup_row" AFTER DELETE ON "public"."user_logos" FOR EACH ROW EXECUTE FUNCTION "public"."_storage_cleanup_on_logo_delete"();


--
-- Name: poll_subscriptions subscriber_identity_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "subscriber_identity_insert" BEFORE INSERT ON "public"."poll_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_subscriber_identity_insert"();


--
-- Name: poll_subscriptions subscriber_identity_refusal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "subscriber_identity_refusal" AFTER INSERT OR UPDATE OF "registered_user_id", "declined_at" ON "public"."poll_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_subscriber_identity_refusal"();


--
-- Name: answers touch_game_from_answers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_game_from_answers" AFTER INSERT OR DELETE OR UPDATE ON "public"."answers" FOR EACH ROW EXECUTE FUNCTION "public"."trg_touch_game_from_answers"();


--
-- Name: questions touch_game_from_questions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_game_from_questions" AFTER INSERT OR DELETE OR UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_touch_game_from_questions"();


--
-- Name: answers trg_answers_rules_state_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_answers_rules_state_del" AFTER DELETE ON "public"."answers" REFERENCING OLD TABLE AS "old_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."answers_rules_state_stmt"();


--
-- Name: answers trg_answers_rules_state_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_answers_rules_state_ins" AFTER INSERT ON "public"."answers" REFERENCING NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."answers_rules_state_stmt"();


--
-- Name: answers trg_answers_rules_state_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_answers_rules_state_upd" AFTER UPDATE ON "public"."answers" REFERENCING OLD TABLE AS "old_rows" NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."answers_rules_state_stmt"();


--
-- Name: games trg_assert_game_answers_minmax; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_assert_game_answers_minmax" BEFORE UPDATE OF "status" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."assert_game_answers_minmax"();


--
-- Name: email_intents trg_email_intents_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_email_intents_set_updated_at" BEFORE UPDATE ON "public"."email_intents" FOR EACH ROW EXECUTE FUNCTION "public"."email_intents_set_updated_at"();


--
-- Name: games trg_games_fill_share_keys; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_games_fill_share_keys" BEFORE INSERT ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."games_fill_share_keys"();


--
-- Name: games trg_games_market_orphan_to_prepared; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_games_market_orphan_to_prepared" BEFORE UPDATE OF "source_market_id" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."games_market_orphan_to_prepared"();


--
-- Name: games trg_games_poll_state_reset; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_games_poll_state_reset" BEFORE UPDATE OF "status" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."games_poll_state_reset"();


--
-- Name: games trg_games_rules_state; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_games_rules_state" BEFORE INSERT OR UPDATE OF "type", "status", "rules_state" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."games_rules_state_row"();


--
-- Name: games trg_games_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_games_touch" BEFORE UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: answers trg_guard_game_content; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_game_content" BEFORE INSERT OR DELETE OR UPDATE ON "public"."answers" FOR EACH ROW EXECUTE FUNCTION "public"."guard_game_content"();


--
-- Name: questions trg_guard_game_content; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_game_content" BEFORE INSERT OR DELETE OR UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_game_content"();


--
-- Name: games trg_guard_game_poll_close; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_game_poll_close" BEFORE UPDATE OF "status" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."guard_game_poll_close"();


--
-- Name: mail_queue trg_mail_queue_000_notification_preference_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_mail_queue_000_notification_preference_guard" BEFORE INSERT ON "public"."mail_queue" FOR EACH ROW EXECUTE FUNCTION "public"."mail_queue_notification_preference_guard"();


--
-- Name: mail_queue trg_mail_queue_001_poll_preference; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_mail_queue_001_poll_preference" BEFORE INSERT ON "public"."mail_queue" FOR EACH ROW EXECUTE FUNCTION "public"."poll_mail_preference_guard"();


--
-- Name: mail_queue trg_mail_queue_002_notification_source_bind; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_mail_queue_002_notification_source_bind" BEFORE INSERT ON "public"."mail_queue" FOR EACH ROW EXECUTE FUNCTION "public"."mail_queue_notification_source_bind"();


--
-- Name: mail_queue trg_mail_queue_cooldown_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_mail_queue_cooldown_guard" BEFORE INSERT ON "public"."mail_queue" FOR EACH ROW EXECUTE FUNCTION "public"."mail_queue_cooldown_guard"();


--
-- Name: mail_queue trg_mail_queue_poll_budget; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_mail_queue_poll_budget" AFTER INSERT ON "public"."mail_queue" FOR EACH ROW EXECUTE FUNCTION "public"."poll_mail_budget_guard"();


--
-- Name: market_game_ratings trg_market_game_rating_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_market_game_rating_stats" AFTER INSERT OR DELETE OR UPDATE ON "public"."market_game_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."sync_market_game_rating_stats"();


--
-- Name: market_games trg_market_games_questions_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_market_games_questions_fields" BEFORE INSERT OR UPDATE OF "payload" ON "public"."market_games" FOR EACH ROW EXECUTE FUNCTION "public"."market_games_set_questions_fields"();


--
-- Name: market_games trg_market_games_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_market_games_slug" BEFORE INSERT OR UPDATE OF "status", "slug" ON "public"."market_games" FOR EACH ROW EXECUTE FUNCTION "public"."trg_market_games_assign_slug"();


--
-- Name: market_games trg_market_games_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_market_games_updated_at" BEFORE UPDATE ON "public"."market_games" FOR EACH ROW EXECUTE FUNCTION "public"."trg_touch_market_games_updated_at"();


--
-- Name: mail_notification_allocations trg_notification_cancel_pending; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_cancel_pending" AFTER UPDATE OF "revoked_at" ON "public"."mail_notification_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_cancel_pending"();


--
-- Name: control_runtime_sessions trg_notification_parent_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_parent_epoch" AFTER UPDATE ON "public"."control_runtime_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_parent_epoch"();


--
-- Name: email_unsub_tokens trg_notification_parent_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_parent_epoch" AFTER INSERT OR UPDATE ON "public"."email_unsub_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_parent_epoch"();


--
-- Name: games trg_notification_parent_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_parent_epoch" AFTER UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_parent_epoch"();


--
-- Name: question_bases trg_notification_parent_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_parent_epoch" AFTER UPDATE ON "public"."question_bases" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_parent_epoch"();


--
-- Name: user_flags trg_notification_parent_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_parent_epoch" AFTER INSERT OR UPDATE ON "public"."user_flags" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_parent_epoch"();


--
-- Name: profiles trg_notification_profile_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_profile_epoch" AFTER UPDATE OF "is_guest" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_parent_epoch"();


--
-- Name: base_share_tasks trg_notification_source_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_source_epoch" AFTER UPDATE ON "public"."base_share_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_source_epoch"();


--
-- Name: control_device_shares trg_notification_source_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_source_epoch" AFTER UPDATE ON "public"."control_device_shares" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_source_epoch"();


--
-- Name: friendships trg_notification_source_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_source_epoch" AFTER UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_source_epoch"();


--
-- Name: poll_subscriptions trg_notification_source_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_source_epoch" AFTER UPDATE ON "public"."poll_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_source_epoch"();


--
-- Name: poll_tasks trg_notification_source_epoch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_notification_source_epoch" AFTER UPDATE ON "public"."poll_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."mail_notification_source_epoch"();


--
-- Name: games trg_poll_anonymous_cleanup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_poll_anonymous_cleanup" AFTER UPDATE OF "share_key_poll", "owner_id", "type", "status" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."_poll_anon_cleanup"();


--
-- Name: poll_text_entries trg_poll_task_text_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_poll_task_text_guard" BEFORE INSERT OR UPDATE OF "voter_token", "game_id", "poll_session_id" ON "public"."poll_text_entries" FOR EACH ROW EXECUTE FUNCTION "public"."_poll_task_vote_write_guard"();


--
-- Name: poll_votes trg_poll_task_vote_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_poll_task_vote_guard" BEFORE INSERT OR UPDATE OF "voter_token", "game_id", "poll_session_id" ON "public"."poll_votes" FOR EACH ROW EXECUTE FUNCTION "public"."_poll_task_vote_write_guard"();


--
-- Name: poll_tasks trg_poll_tasks_touch_status_ts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_poll_tasks_touch_status_ts" BEFORE UPDATE OF "status" ON "public"."poll_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."poll_tasks_touch_status_ts"();


--
-- Name: profiles trg_profile_created_suppression; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_profile_created_suppression" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."on_profile_created_check_suppression"();


--
-- Name: qb_categories trg_qb_categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_qb_categories_set_updated_at" BEFORE UPDATE ON "public"."qb_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: qb_questions trg_qb_questions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_qb_questions_set_updated_at" BEFORE UPDATE ON "public"."qb_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: questions trg_questions_rules_state_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_questions_rules_state_del" AFTER DELETE ON "public"."questions" REFERENCING OLD TABLE AS "old_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."questions_rules_state_stmt"();


--
-- Name: questions trg_questions_rules_state_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_questions_rules_state_ins" AFTER INSERT ON "public"."questions" REFERENCING NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."questions_rules_state_stmt"();


--
-- Name: questions trg_questions_rules_state_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_questions_rules_state_upd" AFTER UPDATE ON "public"."questions" REFERENCING OLD TABLE AS "old_rows" NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."questions_rules_state_stmt"();


--
-- Name: user_flags trg_touch_user_flags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_user_flags_updated_at" BEFORE UPDATE ON "public"."user_flags" FOR EACH ROW EXECUTE FUNCTION "public"."touch_user_flags_updated_at"();


--
-- Name: user_market_library trg_uml_library_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_uml_library_count" AFTER INSERT OR DELETE ON "public"."user_market_library" FOR EACH ROW EXECUTE FUNCTION "public"."trg_market_library_count"();


--
-- Name: user_logos trg_user_logos_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_user_logos_touch" BEFORE UPDATE ON "public"."user_logos" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: marketing_raw_contacts update_marketing_raw_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_marketing_raw_contacts_updated_at" BEFORE UPDATE ON "public"."marketing_raw_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: control_device_shares zz_mail_center_anon_source_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "zz_mail_center_anon_source_guard" BEFORE INSERT ON "public"."control_device_shares" FOR EACH ROW EXECUTE FUNCTION "public"."_mail_center_anon_source_insert_guard"();


--
-- Name: poll_subscriptions zz_mail_center_anon_source_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "zz_mail_center_anon_source_guard" BEFORE INSERT ON "public"."poll_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_mail_center_anon_source_insert_guard"();


--
-- Name: poll_tasks zz_mail_center_anon_source_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "zz_mail_center_anon_source_guard" BEFORE INSERT ON "public"."poll_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."_mail_center_anon_source_insert_guard"();


--
-- Name: profiles zz_mail_center_profile_invalidate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "zz_mail_center_profile_invalidate" AFTER UPDATE OF "is_guest" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."_mail_center_identity_invalidate"();


--
-- Name: answers answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;


--
-- Name: app_ratings app_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_ratings"
    ADD CONSTRAINT "app_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: base_share_tasks base_share_tasks_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."base_share_tasks"
    ADD CONSTRAINT "base_share_tasks_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE CASCADE;


--
-- Name: CONSTRAINT "base_share_tasks_base_id_fkey" ON "base_share_tasks"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT "base_share_tasks_base_id_fkey" ON "public"."base_share_tasks" IS 'E19: usunięcie bazy lub jej właściciela usuwa wszystkie zadania i tokeny akceptacji/odmowy tej bazy.';


--
-- Name: base_share_tasks base_share_tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."base_share_tasks"
    ADD CONSTRAINT "base_share_tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: base_share_tasks base_share_tasks_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."base_share_tasks"
    ADD CONSTRAINT "base_share_tasks_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: base_share_tasks base_share_tasks_source_friendship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."base_share_tasks"
    ADD CONSTRAINT "base_share_tasks_source_friendship_id_fkey" FOREIGN KEY ("source_friendship_id") REFERENCES "public"."friendships"("id") ON DELETE SET NULL;


--
-- Name: contact_report_messages contact_report_messages_moved_from_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contact_report_messages"
    ADD CONSTRAINT "contact_report_messages_moved_from_report_id_fkey" FOREIGN KEY ("moved_from_report_id") REFERENCES "public"."contact_reports"("id") ON DELETE SET NULL;


--
-- Name: contact_report_messages contact_report_messages_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contact_report_messages"
    ADD CONSTRAINT "contact_report_messages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."contact_reports"("id") ON DELETE CASCADE;


--
-- Name: contact_reports contact_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contact_reports"
    ADD CONSTRAINT "contact_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: control2_device_events control2_device_events_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control2_device_events"
    ADD CONSTRAINT "control2_device_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: control2_device_events control2_device_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control2_device_events"
    ADD CONSTRAINT "control2_device_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE CASCADE;


--
-- Name: control_device_connections control_device_connections_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_connections"
    ADD CONSTRAINT "control_device_connections_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: control_device_connections control_device_connections_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_connections"
    ADD CONSTRAINT "control_device_connections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."control_runtime_sessions"("id") ON DELETE CASCADE;


--
-- Name: control_device_link_tokens control_device_link_tokens_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_link_tokens"
    ADD CONSTRAINT "control_device_link_tokens_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: control_device_link_tokens control_device_link_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_link_tokens"
    ADD CONSTRAINT "control_device_link_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."control_runtime_sessions"("id") ON DELETE CASCADE;


--
-- Name: control_device_shares control_device_shares_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_shares"
    ADD CONSTRAINT "control_device_shares_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: control_device_shares control_device_shares_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_shares"
    ADD CONSTRAINT "control_device_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: control_device_shares control_device_shares_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_shares"
    ADD CONSTRAINT "control_device_shares_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: control_device_shares control_device_shares_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_shares"
    ADD CONSTRAINT "control_device_shares_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."control_runtime_sessions"("id") ON DELETE CASCADE;


--
-- Name: control_device_slots control_device_slots_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_slots"
    ADD CONSTRAINT "control_device_slots_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: control_device_slots control_device_slots_primary_connection_id_session_id_game_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_slots"
    ADD CONSTRAINT "control_device_slots_primary_connection_id_session_id_game_fkey" FOREIGN KEY ("primary_connection_id", "session_id", "game_id", "device_type") REFERENCES "public"."control_device_connections"("id", "session_id", "game_id", "device_type") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: control_device_slots control_device_slots_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_device_slots"
    ADD CONSTRAINT "control_device_slots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."control_runtime_sessions"("id") ON DELETE CASCADE;


--
-- Name: control_runtime_sessions control_runtime_sessions_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_runtime_sessions"
    ADD CONSTRAINT "control_runtime_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: control_runtime_sessions control_runtime_sessions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."control_runtime_sessions"
    ADD CONSTRAINT "control_runtime_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: device_connect_codes device_connect_codes_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_connect_codes"
    ADD CONSTRAINT "device_connect_codes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: device_connect_codes device_connect_codes_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_connect_codes"
    ADD CONSTRAINT "device_connect_codes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: device_presence device_presence_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_presence"
    ADD CONSTRAINT "device_presence_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: display_audio_unlock display_audio_unlock_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."display_audio_unlock"
    ADD CONSTRAINT "display_audio_unlock_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: friendships friendships_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: friendships friendships_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: friendships friendships_source_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_source_subscription_id_fkey" FOREIGN KEY ("source_subscription_id") REFERENCES "public"."poll_subscriptions"("id") ON DELETE SET NULL;


--
-- Name: game_import_receipts game_import_receipts_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_import_receipts"
    ADD CONSTRAINT "game_import_receipts_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


--
-- Name: game_import_receipts game_import_receipts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_import_receipts"
    ADD CONSTRAINT "game_import_receipts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: game_session_active game_session_active_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_session_active"
    ADD CONSTRAINT "game_session_active_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: game_session_active game_session_active_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_session_active"
    ADD CONSTRAINT "game_session_active_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE CASCADE;


--
-- Name: game_sessions game_sessions_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_sessions"
    ADD CONSTRAINT "game_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: game_state_display_completion game_state_display_completion_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_state_display_completion"
    ADD CONSTRAINT "game_state_display_completion_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."game_state"("game_id") ON DELETE CASCADE;


--
-- Name: game_state game_state_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_state"
    ADD CONSTRAINT "game_state_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: game_state_history game_state_history_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_state_history"
    ADD CONSTRAINT "game_state_history_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: games games_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: games games_source_market_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_source_market_id_fkey" FOREIGN KEY ("source_market_id") REFERENCES "public"."market_games"("id") ON DELETE SET NULL;


--
-- Name: guest_migration_staging guest_migration_staging_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."guest_migration_staging"
    ADD CONSTRAINT "guest_migration_staging_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: mail_center_links mail_center_links_root_token_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_center_links"
    ADD CONSTRAINT "mail_center_links_root_token_fkey" FOREIGN KEY ("root_token") REFERENCES "public"."email_unsub_tokens"("token") ON DELETE CASCADE;


--
-- Name: mail_center_sessions mail_center_sessions_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_center_sessions"
    ADD CONSTRAINT "mail_center_sessions_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."mail_center_links"("id") ON DELETE CASCADE;


--
-- Name: mail_cooldowns mail_cooldowns_action_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_cooldowns"
    ADD CONSTRAINT "mail_cooldowns_action_key_fkey" FOREIGN KEY ("action_key") REFERENCES "public"."mail_cooldown_policies"("action_key");


--
-- Name: mail_notification_allocations mail_notification_allocations_base_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_base_task_id_fkey" FOREIGN KEY ("base_task_id") REFERENCES "public"."base_share_tasks"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_copy_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_copy_offer_id_fkey" FOREIGN KEY ("copy_offer_id") REFERENCES "public"."resource_copy_offers"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_device_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_device_share_id_fkey" FOREIGN KEY ("device_share_id") REFERENCES "public"."control_device_shares"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_friendship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_friendship_id_fkey" FOREIGN KEY ("friendship_id") REFERENCES "public"."friendships"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_lifecycle_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_lifecycle_owner_id_fkey" FOREIGN KEY ("lifecycle_owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_poll_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_poll_task_id_fkey" FOREIGN KEY ("poll_task_id") REFERENCES "public"."poll_tasks"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: mail_notification_allocations mail_notification_allocations_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_notification_allocations"
    ADD CONSTRAINT "mail_notification_allocations_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."poll_subscriptions"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_contact_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_contact_message_id_fkey" FOREIGN KEY ("contact_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;


--
-- Name: mail_queue mail_queue_mail_center_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_mail_center_link_id_fkey" FOREIGN KEY ("mail_center_link_id") REFERENCES "public"."mail_center_links"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_notification_allocation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_notification_allocation_id_fkey" FOREIGN KEY ("notification_allocation_id") REFERENCES "public"."mail_notification_allocations"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_notification_base_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_notification_base_task_id_fkey" FOREIGN KEY ("notification_base_task_id") REFERENCES "public"."base_share_tasks"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_notification_copy_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_notification_copy_offer_id_fkey" FOREIGN KEY ("notification_copy_offer_id") REFERENCES "public"."resource_copy_offers"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_notification_device_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_notification_device_share_id_fkey" FOREIGN KEY ("notification_device_share_id") REFERENCES "public"."control_device_shares"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_notification_friendship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_notification_friendship_id_fkey" FOREIGN KEY ("notification_friendship_id") REFERENCES "public"."friendships"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_notification_poll_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_notification_poll_task_id_fkey" FOREIGN KEY ("notification_poll_task_id") REFERENCES "public"."poll_tasks"("id") ON DELETE CASCADE;


--
-- Name: mail_queue mail_queue_notification_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mail_queue"
    ADD CONSTRAINT "mail_queue_notification_subscription_id_fkey" FOREIGN KEY ("notification_subscription_id") REFERENCES "public"."poll_subscriptions"("id") ON DELETE CASCADE;


--
-- Name: market_game_ratings market_game_ratings_market_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_game_ratings"
    ADD CONSTRAINT "market_game_ratings_market_game_id_fkey" FOREIGN KEY ("market_game_id") REFERENCES "public"."market_games"("id") ON DELETE CASCADE;


--
-- Name: market_game_ratings market_game_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_game_ratings"
    ADD CONSTRAINT "market_game_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: market_games market_games_author_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_games"
    ADD CONSTRAINT "market_games_author_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: market_games market_games_source_game_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_games"
    ADD CONSTRAINT "market_games_source_game_fkey" FOREIGN KEY ("source_game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


--
-- Name: message_attachments message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;


--
-- Name: messages messages_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;


--
-- Name: poll_anonymous_limits poll_anonymous_limits_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_anonymous_limits"
    ADD CONSTRAINT "poll_anonymous_limits_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: poll_mail_budget_events poll_mail_budget_events_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_mail_budget_events"
    ADD CONSTRAINT "poll_mail_budget_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: poll_sessions poll_sessions_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_sessions"
    ADD CONSTRAINT "poll_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: poll_sessions poll_sessions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_sessions"
    ADD CONSTRAINT "poll_sessions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;


--
-- Name: poll_subscriptions poll_subscriptions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_subscriptions"
    ADD CONSTRAINT "poll_subscriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: poll_subscriptions poll_subscriptions_registered_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_subscriptions"
    ADD CONSTRAINT "poll_subscriptions_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: poll_subscriptions poll_subscriptions_subscriber_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_subscriptions"
    ADD CONSTRAINT "poll_subscriptions_subscriber_user_id_fkey" FOREIGN KEY ("subscriber_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: poll_tally_drafts poll_tally_drafts_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tally_drafts"
    ADD CONSTRAINT "poll_tally_drafts_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: poll_tasks poll_tasks_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tasks"
    ADD CONSTRAINT "poll_tasks_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: poll_tasks poll_tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tasks"
    ADD CONSTRAINT "poll_tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: poll_tasks poll_tasks_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tasks"
    ADD CONSTRAINT "poll_tasks_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: poll_tasks poll_tasks_source_friendship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tasks"
    ADD CONSTRAINT "poll_tasks_source_friendship_id_fkey" FOREIGN KEY ("source_friendship_id") REFERENCES "public"."friendships"("id") ON DELETE CASCADE;


--
-- Name: poll_tasks poll_tasks_source_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_tasks"
    ADD CONSTRAINT "poll_tasks_source_subscription_id_fkey" FOREIGN KEY ("source_subscription_id") REFERENCES "public"."poll_subscriptions"("id") ON DELETE CASCADE;


--
-- Name: poll_text_entries poll_text_entries_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_text_entries"
    ADD CONSTRAINT "poll_text_entries_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: poll_text_entries poll_text_entries_poll_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_text_entries"
    ADD CONSTRAINT "poll_text_entries_poll_session_id_fkey" FOREIGN KEY ("poll_session_id") REFERENCES "public"."poll_sessions"("id") ON DELETE CASCADE;


--
-- Name: poll_text_entries poll_text_entries_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_text_entries"
    ADD CONSTRAINT "poll_text_entries_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;


--
-- Name: poll_text_entries poll_text_entries_voter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_text_entries"
    ADD CONSTRAINT "poll_text_entries_voter_user_id_fkey" FOREIGN KEY ("voter_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: poll_votes poll_votes_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_poll_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_poll_session_id_fkey" FOREIGN KEY ("poll_session_id") REFERENCES "public"."poll_sessions"("id") ON DELETE SET NULL;


--
-- Name: poll_votes poll_votes_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_voter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_voter_user_id_fkey" FOREIGN KEY ("voter_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: qb_categories qb_categories_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_categories"
    ADD CONSTRAINT "qb_categories_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE CASCADE;


--
-- Name: qb_categories qb_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_categories"
    ADD CONSTRAINT "qb_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."qb_categories"("id") ON DELETE CASCADE;


--
-- Name: qb_category_tags qb_category_tags_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_category_tags"
    ADD CONSTRAINT "qb_category_tags_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."qb_categories"("id") ON DELETE CASCADE;


--
-- Name: qb_category_tags qb_category_tags_tag_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_category_tags"
    ADD CONSTRAINT "qb_category_tags_tag_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."qb_tags"("id") ON DELETE CASCADE;


--
-- Name: qb_question_tags qb_question_tags_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_question_tags"
    ADD CONSTRAINT "qb_question_tags_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."qb_questions"("id") ON DELETE CASCADE;


--
-- Name: qb_question_tags qb_question_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_question_tags"
    ADD CONSTRAINT "qb_question_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."qb_tags"("id") ON DELETE CASCADE;


--
-- Name: qb_questions qb_questions_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_questions"
    ADD CONSTRAINT "qb_questions_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE CASCADE;


--
-- Name: qb_questions qb_questions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_questions"
    ADD CONSTRAINT "qb_questions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."qb_categories"("id") ON DELETE SET NULL;


--
-- Name: qb_questions qb_questions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_questions"
    ADD CONSTRAINT "qb_questions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: qb_tags qb_tags_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qb_tags"
    ADD CONSTRAINT "qb_tags_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE CASCADE;


--
-- Name: question_base_shares question_base_shares_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."question_base_shares"
    ADD CONSTRAINT "question_base_shares_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE CASCADE;


--
-- Name: question_base_shares question_base_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."question_base_shares"
    ADD CONSTRAINT "question_base_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: question_bases question_bases_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."question_bases"
    ADD CONSTRAINT "question_bases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: questions questions_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: reserved_username_accounts reserved_username_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reserved_username_accounts"
    ADD CONSTRAINT "reserved_username_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: resource_clone_assets resource_clone_assets_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_assets"
    ADD CONSTRAINT "resource_clone_assets_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."resource_clone_jobs"("id") ON DELETE CASCADE;


--
-- Name: resource_clone_jobs resource_clone_jobs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_jobs"
    ADD CONSTRAINT "resource_clone_jobs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_jobs resource_clone_jobs_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_jobs"
    ADD CONSTRAINT "resource_clone_jobs_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_jobs resource_clone_jobs_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_jobs"
    ADD CONSTRAINT "resource_clone_jobs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_jobs resource_clone_jobs_logo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_jobs"
    ADD CONSTRAINT "resource_clone_jobs_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "public"."user_logos"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_jobs resource_clone_jobs_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_jobs"
    ADD CONSTRAINT "resource_clone_jobs_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: resource_clone_receipts resource_clone_receipts_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_receipts"
    ADD CONSTRAINT "resource_clone_receipts_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_receipts resource_clone_receipts_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_receipts"
    ADD CONSTRAINT "resource_clone_receipts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_receipts resource_clone_receipts_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_receipts"
    ADD CONSTRAINT "resource_clone_receipts_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_receipts resource_clone_receipts_logo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_receipts"
    ADD CONSTRAINT "resource_clone_receipts_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "public"."user_logos"("id") ON DELETE SET NULL;


--
-- Name: resource_clone_receipts resource_clone_receipts_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_clone_receipts"
    ADD CONSTRAINT "resource_clone_receipts_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: resource_copy_history resource_copy_history_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_history"
    ADD CONSTRAINT "resource_copy_history_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: resource_copy_history resource_copy_history_logo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_history"
    ADD CONSTRAINT "resource_copy_history_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "public"."user_logos"("id") ON DELETE CASCADE;


--
-- Name: resource_copy_history resource_copy_history_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_history"
    ADD CONSTRAINT "resource_copy_history_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."resource_copy_offers"("id") ON DELETE SET NULL;


--
-- Name: resource_copy_history resource_copy_history_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_history"
    ADD CONSTRAINT "resource_copy_history_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: resource_copy_offers resource_copy_offers_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_offers"
    ADD CONSTRAINT "resource_copy_offers_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


--
-- Name: resource_copy_offers resource_copy_offers_logo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_offers"
    ADD CONSTRAINT "resource_copy_offers_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "public"."user_logos"("id") ON DELETE SET NULL;


--
-- Name: resource_copy_offers resource_copy_offers_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_offers"
    ADD CONSTRAINT "resource_copy_offers_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: resource_copy_offers resource_copy_offers_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_copy_offers"
    ADD CONSTRAINT "resource_copy_offers_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: resource_demo_origins resource_demo_origins_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "public"."question_bases"("id") ON DELETE CASCADE;


--
-- Name: resource_demo_origins resource_demo_origins_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: resource_demo_origins resource_demo_origins_logo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "public"."user_logos"("id") ON DELETE CASCADE;


--
-- Name: resource_demo_origins resource_demo_origins_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."resource_demo_origins"
    ADD CONSTRAINT "resource_demo_origins_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: shared_devices shared_devices_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shared_devices"
    ADD CONSTRAINT "shared_devices_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


--
-- Name: shared_devices shared_devices_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shared_devices"
    ADD CONSTRAINT "shared_devices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: shared_devices shared_devices_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shared_devices"
    ADD CONSTRAINT "shared_devices_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: site_activity site_activity_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_activity"
    ADD CONSTRAINT "site_activity_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


--
-- Name: site_activity_hours site_activity_hours_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_activity_hours"
    ADD CONSTRAINT "site_activity_hours_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: site_activity site_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."site_activity"
    ADD CONSTRAINT "site_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: stats_excluded_users stats_excluded_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."stats_excluded_users"
    ADD CONSTRAINT "stats_excluded_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: user_market_library uml_market_game_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_market_library"
    ADD CONSTRAINT "uml_market_game_fkey" FOREIGN KEY ("market_game_id") REFERENCES "public"."market_games"("id") ON DELETE CASCADE;


--
-- Name: user_market_library uml_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_market_library"
    ADD CONSTRAINT "uml_user_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_cooldowns user_cooldowns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_cooldowns"
    ADD CONSTRAINT "user_cooldowns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_flags user_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_flags"
    ADD CONSTRAINT "user_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_logos user_logos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_logos"
    ADD CONSTRAINT "user_logos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_market_library user_market_library_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_market_library"
    ADD CONSTRAINT "user_market_library_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


--
-- Name: game_gen_queue Allow public insert to queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert to queue" ON "public"."game_gen_queue" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: game_gen_queue Allow public read access to queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to queue" ON "public"."game_gen_queue" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: app_ratings Anyone can view ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view ratings" ON "public"."app_ratings" FOR SELECT USING (true);


--
-- Name: message_attachments No public access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No public access" ON "public"."message_attachments" USING (false);


--
-- Name: messages No public access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No public access" ON "public"."messages" USING (false);


--
-- Name: reports No public access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No public access" ON "public"."reports" USING (false);


--
-- Name: app_ratings Users can insert their own rating; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own rating" ON "public"."app_ratings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: app_ratings Users can update their own rating; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own rating" ON "public"."app_ratings" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."answers" ENABLE ROW LEVEL SECURITY;

--
-- Name: answers answers_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "answers_owner_all" ON "public"."answers" USING ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."games" "g" ON (("g"."id" = "q"."game_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("g"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."games" "g" ON (("g"."id" = "q"."game_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: answers answers_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "answers_owner_select" ON "public"."answers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."games" "g" ON (("g"."id" = "q"."game_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: answers answers_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "answers_owner_write" ON "public"."answers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."games" "g" ON (("g"."id" = "q"."game_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("g"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."games" "g" ON (("g"."id" = "q"."game_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: device_connect_codes anyone can read device_connect_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone can read device_connect_codes" ON "public"."device_connect_codes" FOR SELECT USING (true);


--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config app_config_no_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "app_config_no_access" ON "public"."app_config" USING (false);


--
-- Name: app_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_ratings" ENABLE ROW LEVEL SECURITY;

--
-- Name: base_share_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."base_share_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_report_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."contact_report_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."contact_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: control2_device_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."control2_device_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: control_device_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."control_device_connections" ENABLE ROW LEVEL SECURITY;

--
-- Name: control_device_link_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."control_device_link_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: control_device_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."control_device_shares" ENABLE ROW LEVEL SECURITY;

--
-- Name: control_device_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."control_device_slots" ENABLE ROW LEVEL SECURITY;

--
-- Name: control_runtime_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."control_runtime_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_reports cr_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cr_select_own" ON "public"."contact_reports" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: demo_template_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."demo_template_data" ENABLE ROW LEVEL SECURITY;

--
-- Name: base_share_tasks deny all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all" ON "public"."base_share_tasks" USING (false) WITH CHECK (false);


--
-- Name: device_connect_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."device_connect_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: device_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."device_presence" ENABLE ROW LEVEL SECURITY;

--
-- Name: device_presence device_presence_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "device_presence_owner_read" ON "public"."device_presence" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "device_presence"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: display_audio_unlock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."display_audio_unlock" ENABLE ROW LEVEL SECURITY;

--
-- Name: display_audio_unlock display_audio_unlock_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "display_audio_unlock_owner_read" ON "public"."display_audio_unlock" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "display_audio_unlock"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: game_state_display_completion display_completion_device_realtime_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "display_completion_device_realtime_read" ON "public"."game_state_display_completion" FOR SELECT TO "anon" USING ("public"."control_device_realtime_claim_valid"("game_id", "auth"."jwt"()));


--
-- Name: POLICY "display_completion_device_realtime_read" ON "game_state_display_completion"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "display_completion_device_realtime_read" ON "public"."game_state_display_completion" IS 'Allows only a signed primary-device JWT with a current lease to receive the completion row for its game.';


--
-- Name: game_state_display_completion display_completion_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "display_completion_owner" ON "public"."game_state_display_completion" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_state_display_completion"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: e2e_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."e2e_emails" ENABLE ROW LEVEL SECURITY;

--
-- Name: edit_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."edit_locks" ENABLE ROW LEVEL SECURITY;

--
-- Name: edit_locks edit_locks_read_if_can_edit_resource; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "edit_locks_read_if_can_edit_resource" ON "public"."edit_locks" FOR SELECT TO "authenticated" USING ("public"."can_edit_locked_resource"("resource_type", "resource_id"));


--
-- Name: email_cooldowns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_cooldowns" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_intents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_intents" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_intents email_intents_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "email_intents_service_only" ON "public"."email_intents" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: email_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_providers" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_providers email_providers_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "email_providers_admin_all" ON "public"."email_providers" USING (true) WITH CHECK (true);


--
-- Name: email_providers email_providers_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "email_providers_read_all" ON "public"."email_providers" FOR SELECT USING (true);


--
-- Name: email_unsub_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_unsub_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships friendships_select_parties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "friendships_select_parties" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("requester_id" = "auth"."uid"()) OR ("addressee_id" = "auth"."uid"())));


--
-- Name: game_gen_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."game_gen_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_gen_queue game_gen_queue_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "game_gen_queue_insert_own" ON "public"."game_gen_queue" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));


--
-- Name: game_gen_queue game_gen_queue_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "game_gen_queue_select_own" ON "public"."game_gen_queue" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));


--
-- Name: game_gen_queue game_gen_queue_worker_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "game_gen_queue_worker_all" ON "public"."game_gen_queue" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: game_import_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."game_import_receipts" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_session_active; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."game_session_active" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."game_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sessions game_sessions_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "game_sessions_owner_read" ON "public"."game_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: game_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."game_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_state game_state_device_realtime_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "game_state_device_realtime_read" ON "public"."game_state" FOR SELECT TO "anon" USING ("public"."control_device_realtime_claim_valid"("game_id", "auth"."jwt"()));


--
-- Name: POLICY "game_state_device_realtime_read" ON "game_state"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "game_state_device_realtime_read" ON "public"."game_state" IS 'Allows postgres_changes only to a signed device JWT whose session, type, primary connection and epoch still match the live lease.';


--
-- Name: game_state_display_completion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."game_state_display_completion" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_state_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."game_state_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_state_history game_state_history_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "game_state_history_owner_read" ON "public"."game_state_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_state_history"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: game_state game_state_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "game_state_owner_read" ON "public"."game_state" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_state"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: games; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;

--
-- Name: games games_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "games_owner_delete" ON "public"."games" FOR DELETE USING (("owner_id" = "auth"."uid"()));


--
-- Name: games games_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "games_owner_insert" ON "public"."games" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: games games_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "games_owner_select" ON "public"."games" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));


--
-- Name: games games_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "games_owner_update" ON "public"."games" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: games games_select_by_keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "games_select_by_keys" ON "public"."games" FOR SELECT USING ((("share_key_poll" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'share_key'::"text")) OR ("share_key_control" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'share_key'::"text")) OR ("share_key_display" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'share_key'::"text")) OR ("share_key_host" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'share_key'::"text"))));


--
-- Name: guest_migration_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."guest_migration_staging" ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_migration_staging guest_migration_staging_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "guest_migration_staging_service_only" ON "public"."guest_migration_staging" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: mail_center_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_center_links" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_center_request_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_center_request_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_center_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_center_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_cooldown_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_cooldown_policies" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_cooldowns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_cooldowns" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_function_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_function_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_function_logs mail_function_logs_read_none; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mail_function_logs_read_none" ON "public"."mail_function_logs" FOR SELECT TO "authenticated" USING (false);


--
-- Name: mail_function_logs mail_function_logs_write_none; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mail_function_logs_write_none" ON "public"."mail_function_logs" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: mail_notification_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_notification_allocations" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_queue mail_queue_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mail_queue_insert_own" ON "public"."mail_queue" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));


--
-- Name: mail_queue mail_queue_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mail_queue_select_own" ON "public"."mail_queue" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));


--
-- Name: mail_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mail_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_settings mail_settings_read_none; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mail_settings_read_none" ON "public"."mail_settings" FOR SELECT TO "authenticated" USING (false);


--
-- Name: mail_settings mail_settings_write_none; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mail_settings_write_none" ON "public"."mail_settings" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: market_game_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."market_game_ratings" ENABLE ROW LEVEL SECURITY;

--
-- Name: market_games; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."market_games" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_ai_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marketing_ai_providers" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_ai_providers marketing_ai_providers_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marketing_ai_providers_all" ON "public"."marketing_ai_providers" USING (true) WITH CHECK (true);


--
-- Name: marketing_cities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marketing_cities" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_cities marketing_cities_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marketing_cities_all" ON "public"."marketing_cities" USING (true) WITH CHECK (true);


--
-- Name: marketing_search_logs marketing_logs_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marketing_logs_all" ON "public"."marketing_search_logs" USING (true) WITH CHECK (true);


--
-- Name: marketing_search_queries_log marketing_queries_log_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marketing_queries_log_all" ON "public"."marketing_search_queries_log" USING (true) WITH CHECK (true);


--
-- Name: marketing_raw_contacts marketing_raw_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marketing_raw_all" ON "public"."marketing_raw_contacts" USING (true) WITH CHECK (true);


--
-- Name: marketing_raw_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marketing_raw_contacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_search_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marketing_search_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_search_queries_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marketing_search_queries_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_verified_contacts marketing_verified_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marketing_verified_all" ON "public"."marketing_verified_contacts" USING (true) WITH CHECK (true);


--
-- Name: marketing_verified_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marketing_verified_contacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: market_games mg_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mg_insert_own" ON "public"."market_games" FOR INSERT TO "authenticated" WITH CHECK (("author_user_id" = "auth"."uid"()));


--
-- Name: market_games mg_no_direct_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mg_no_direct_delete" ON "public"."market_games" FOR DELETE USING (false);


--
-- Name: market_games mg_no_direct_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mg_no_direct_update" ON "public"."market_games" FOR UPDATE USING (false);


--
-- Name: market_games mg_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mg_select" ON "public"."market_games" FOR SELECT USING ((("status" = 'published'::"public"."market_game_status") OR (("status" = 'withdrawn'::"public"."market_game_status") AND (("author_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_market_library"
  WHERE (("user_market_library"."market_game_id" = "market_games"."id") AND ("user_market_library"."user_id" = "auth"."uid"())))))) OR (("status" = ANY (ARRAY['pending'::"public"."market_game_status", 'rejected'::"public"."market_game_status"])) AND ("author_user_id" = "auth"."uid"()))));


--
-- Name: market_game_ratings mgr_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mgr_delete" ON "public"."market_game_ratings" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: market_game_ratings mgr_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mgr_insert" ON "public"."market_game_ratings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: market_game_ratings mgr_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mgr_select" ON "public"."market_game_ratings" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."market_games" "mg"
  WHERE (("mg"."id" = "market_game_ratings"."market_game_id") AND ("mg"."author_user_id" = "auth"."uid"()))))));


--
-- Name: market_game_ratings mgr_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mgr_update" ON "public"."market_game_ratings" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: shared_devices owner can manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can manage" ON "public"."shared_devices" USING (("owner_id" = "auth"."uid"()));


--
-- Name: device_connect_codes owner can manage device_connect_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can manage device_connect_codes" ON "public"."device_connect_codes" USING (("owner_id" = "auth"."uid"()));


--
-- Name: poll_anonymous_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_anonymous_limits" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_mail_budget_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_mail_budget_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_sessions poll_sessions_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_sessions_owner_read" ON "public"."poll_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_sessions poll_sessions_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_sessions_owner_select" ON "public"."poll_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_sessions poll_sessions_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_sessions_owner_write" ON "public"."poll_sessions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_sessions poll_sessions_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_sessions_select_owner" ON "public"."poll_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_subscriptions poll_subs_select_owner_or_subscriber; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_subs_select_owner_or_subscriber" ON "public"."poll_subscriptions" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR ("auth"."uid"() = "subscriber_user_id")));


--
-- Name: poll_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_tally_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_tally_drafts" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_tasks poll_tasks_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_tasks_select_owner" ON "public"."poll_tasks" FOR SELECT USING (("owner_id" = "auth"."uid"()));


--
-- Name: poll_tasks poll_tasks_select_owner_or_recipient; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_tasks_select_owner_or_recipient" ON "public"."poll_tasks" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR ("auth"."uid"() = "recipient_user_id")));


--
-- Name: poll_tasks poll_tasks_select_recipient; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_tasks_select_recipient" ON "public"."poll_tasks" FOR SELECT USING (("recipient_user_id" = "auth"."uid"()));


--
-- Name: poll_text_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_text_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_text_entries poll_text_entries_insert_owner_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_text_entries_insert_owner_open" ON "public"."poll_text_entries" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_text_entries"."game_id") AND ("g"."owner_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."poll_sessions" "s"
  WHERE (("s"."id" = "poll_text_entries"."poll_session_id") AND ("s"."game_id" = "poll_text_entries"."game_id") AND ("s"."is_open" = true))))));


--
-- Name: poll_text_entries poll_text_entries_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_text_entries_owner_read" ON "public"."poll_text_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_text_entries"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_text_entries poll_text_entries_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_text_entries_owner_select" ON "public"."poll_text_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_text_entries"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_text_entries poll_text_entries_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_text_entries_select_owner" ON "public"."poll_text_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_text_entries"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_text_entries poll_text_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_text_owner_select" ON "public"."poll_text_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_text_entries"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poll_votes" ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_votes poll_votes_insert_owner_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_votes_insert_owner_open" ON "public"."poll_votes" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_votes"."game_id") AND ("g"."owner_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."poll_sessions" "s"
  WHERE (("s"."id" = "poll_votes"."poll_session_id") AND ("s"."game_id" = "poll_votes"."game_id") AND ("s"."is_open" = true))))));


--
-- Name: poll_votes poll_votes_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_votes_owner_delete" ON "public"."poll_votes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_votes"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_votes poll_votes_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_votes_owner_read" ON "public"."poll_votes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_votes"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_votes poll_votes_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_votes_owner_select" ON "public"."poll_votes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_votes"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_votes poll_votes_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll_votes_select_owner" ON "public"."poll_votes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_votes"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: profiles profiles_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));


--
-- Name: profiles profiles_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_self_read" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));


--
-- Name: profiles profiles_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));


--
-- Name: poll_sessions ps_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ps_owner_all" ON "public"."poll_sessions" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_sessions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_text_entries pte_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pte_owner_delete" ON "public"."poll_text_entries" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_text_entries"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: poll_text_entries pte_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pte_owner_read" ON "public"."poll_text_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "poll_text_entries"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: public_kv; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."public_kv" ENABLE ROW LEVEL SECURITY;

--
-- Name: public_kv public_kv_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public_kv_read_auth" ON "public"."public_kv" FOR SELECT TO "authenticated" USING (true);


--
-- Name: question_bases qb_bases_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_bases_delete" ON "public"."question_bases" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));


--
-- Name: question_bases qb_bases_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_bases_insert" ON "public"."question_bases" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: question_bases qb_bases_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_bases_select" ON "public"."question_bases" FOR SELECT TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."question_base_shares" "s"
  WHERE (("s"."base_id" = "question_bases"."id") AND ("s"."user_id" = "auth"."uid"()))))));


--
-- Name: question_bases qb_bases_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_bases_update" ON "public"."question_bases" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: qb_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."qb_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_categories qb_categories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_categories_select" ON "public"."qb_categories" FOR SELECT USING ("public"."base_can_access"("base_id", "auth"."uid"()));


--
-- Name: qb_categories qb_categories_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_categories_write" ON "public"."qb_categories" USING ("public"."base_can_edit"("base_id", "auth"."uid"())) WITH CHECK ("public"."base_can_edit"("base_id", "auth"."uid"()));


--
-- Name: qb_category_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."qb_category_tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_category_tags qb_category_tags_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_category_tags_delete" ON "public"."qb_category_tags" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."qb_categories" "c"
     JOIN "public"."question_bases" "b" ON (("b"."id" = "c"."base_id")))
  WHERE (("c"."id" = "qb_category_tags"."category_id") AND (("b"."owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."question_base_shares" "s"
          WHERE (("s"."base_id" = "b"."id") AND ("s"."user_id" = "auth"."uid"()) AND ("s"."role" = 'editor'::"public"."base_share_role")))))))));


--
-- Name: qb_category_tags qb_category_tags_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_category_tags_insert" ON "public"."qb_category_tags" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."qb_categories" "c"
     JOIN "public"."qb_tags" "t" ON (("t"."base_id" = "c"."base_id")))
     JOIN "public"."question_bases" "b" ON (("b"."id" = "c"."base_id")))
  WHERE (("c"."id" = "qb_category_tags"."category_id") AND ("t"."id" = "qb_category_tags"."tag_id") AND (("b"."owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."question_base_shares" "s"
          WHERE (("s"."base_id" = "b"."id") AND ("s"."user_id" = "auth"."uid"()) AND ("s"."role" = 'editor'::"public"."base_share_role")))))))));


--
-- Name: qb_category_tags qb_category_tags_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_category_tags_select" ON "public"."qb_category_tags" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."qb_categories" "c"
     JOIN "public"."question_bases" "b" ON (("b"."id" = "c"."base_id")))
  WHERE (("c"."id" = "qb_category_tags"."category_id") AND (("b"."owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."question_base_shares" "s"
          WHERE (("s"."base_id" = "b"."id") AND ("s"."user_id" = "auth"."uid"()) AND ("s"."role" = ANY (ARRAY['editor'::"public"."base_share_role", 'viewer'::"public"."base_share_role"]))))))))));


--
-- Name: qb_question_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."qb_question_tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_question_tags qb_question_tags_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_question_tags_select" ON "public"."qb_question_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."qb_questions" "q"
  WHERE (("q"."id" = "qb_question_tags"."question_id") AND "public"."base_can_access"("q"."base_id", "auth"."uid"())))));


--
-- Name: qb_question_tags qb_question_tags_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_question_tags_write" ON "public"."qb_question_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."qb_questions" "q"
  WHERE (("q"."id" = "qb_question_tags"."question_id") AND "public"."base_can_edit"("q"."base_id", "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."qb_questions" "q"
  WHERE (("q"."id" = "qb_question_tags"."question_id") AND "public"."base_can_edit"("q"."base_id", "auth"."uid"())))));


--
-- Name: qb_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."qb_questions" ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_questions qb_questions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_questions_select" ON "public"."qb_questions" FOR SELECT USING ("public"."base_can_access"("base_id", "auth"."uid"()));


--
-- Name: qb_questions qb_questions_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_questions_write" ON "public"."qb_questions" USING ("public"."base_can_edit"("base_id", "auth"."uid"())) WITH CHECK ("public"."base_can_edit"("base_id", "auth"."uid"()));


--
-- Name: question_base_shares qb_shares_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_shares_select" ON "public"."question_base_shares" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."base_is_owner"("base_id", "auth"."uid"())));


--
-- Name: qb_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."qb_tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_tags qb_tags_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_tags_select" ON "public"."qb_tags" FOR SELECT USING ("public"."base_can_access"("base_id", "auth"."uid"()));


--
-- Name: qb_tags qb_tags_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qb_tags_write" ON "public"."qb_tags" USING ("public"."base_can_edit"("base_id", "auth"."uid"())) WITH CHECK ("public"."base_can_edit"("base_id", "auth"."uid"()));


--
-- Name: question_base_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."question_base_shares" ENABLE ROW LEVEL SECURITY;

--
-- Name: question_bases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."question_bases" ENABLE ROW LEVEL SECURITY;

--
-- Name: questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;

--
-- Name: questions questions_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "questions_owner_all" ON "public"."questions" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "questions"."game_id") AND ("g"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "questions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: questions questions_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "questions_owner_select" ON "public"."questions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "questions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: questions questions_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "questions_owner_write" ON "public"."questions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "questions"."game_id") AND ("g"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "questions"."game_id") AND ("g"."owner_id" = "auth"."uid"())))));


--
-- Name: shared_devices recipient can view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recipient can view" ON "public"."shared_devices" FOR SELECT USING (("recipient_id" = "auth"."uid"()));


--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: reserved_username_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."reserved_username_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: reserved_username_prefixes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."reserved_username_prefixes" ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_clone_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resource_clone_assets" ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_clone_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resource_clone_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_clone_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resource_clone_receipts" ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_copy_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resource_copy_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_copy_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resource_copy_offers" ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_demo_origins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."resource_demo_origins" ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."shared_devices" ENABLE ROW LEVEL SECURITY;

--
-- Name: site_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."site_activity" ENABLE ROW LEVEL SECURITY;

--
-- Name: site_activity_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."site_activity_hours" ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_cleanup_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."storage_cleanup_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_market_library uml_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "uml_own" ON "public"."user_market_library" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: user_cooldowns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_cooldowns" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_cooldowns user_cooldowns_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_cooldowns_insert_own" ON "public"."user_cooldowns" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_cooldowns user_cooldowns_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_cooldowns_select_own" ON "public"."user_cooldowns" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_cooldowns user_cooldowns_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_cooldowns_update_own" ON "public"."user_cooldowns" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_flags user_flags_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_flags_insert_own" ON "public"."user_flags" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_flags user_flags_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_flags_select_own" ON "public"."user_flags" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_flags user_flags_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_flags_update_own" ON "public"."user_flags" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_logos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_logos" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_logos user_logos_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_logos_delete_own" ON "public"."user_logos" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_logos user_logos_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_logos_insert_own" ON "public"."user_logos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_logos user_logos_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_logos_select_own" ON "public"."user_logos" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_logos user_logos_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_logos_update_own" ON "public"."user_logos" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_market_library; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_market_library" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict vMuUPR9JmbFwlAdYgohUKwmknPJZ6HM1O3AVKb5Sywsp4BEfZg2x7yvf5hVxQdN

