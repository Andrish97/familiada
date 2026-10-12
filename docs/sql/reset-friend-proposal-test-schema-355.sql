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
COMMIT;
