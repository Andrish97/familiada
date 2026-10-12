-- Isolated only: replay historical migrations after a future355 schema export.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('fam','fam353reset','fam355reset') THEN RAISE EXCEPTION 'isolated database only'; END IF;
END $$;
DROP TRIGGER IF EXISTS friend_source_closed ON public.poll_subscriptions;
DROP TRIGGER IF EXISTS friend_source_delete ON public.poll_subscriptions;
ALTER TABLE public.friendships DROP COLUMN IF EXISTS source_subscription_id CASCADE;
DROP FUNCTION IF EXISTS public._friend_source_closed();
CREATE OR REPLACE FUNCTION "public"."_friend_locked"("p_id" "uuid") RETURNS "public"."friendships"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE f public.friendships%rowtype; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN (requester_id,addressee_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM public._poll_identity_refs(ARRAY[f.requester_id,f.addressee_id]);
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,f.addressee_id)::text||':'||GREATEST(f.requester_id,f.addressee_id)::text,329));
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN (requester_id,addressee_id) FOR UPDATE;
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
COMMIT;
