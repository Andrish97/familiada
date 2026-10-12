-- E19: Zadania i dzwonek wyłącznie ankiety; bazy/urządzenia przy własnych stronach.
BEGIN;
CREATE OR REPLACE FUNCTION "public"."tasks_list"("p_kind" "text" DEFAULT NULL::"text") RETURNS TABLE("kind" "text", "id" "uuid", "state" "text", "title" "text", "owner_label" "text", "created_at" timestamp with time zone, "done_at" timestamp with time zone, "token" "uuid", "poll_type" "text", "role" "text", "device_type" "text", "game_id" "uuid", "expires_at" timestamp with time zone)
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
CREATE OR REPLACE FUNCTION "public"."badges_get"() RETURNS "jsonb"
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
  WHERE f.addressee_id = v_uid AND f.status = 'pending';

  RETURN jsonb_build_object('tasks_pending', v_polls, 'friends_pending', v_friends);
END;
$$;
COMMIT;
