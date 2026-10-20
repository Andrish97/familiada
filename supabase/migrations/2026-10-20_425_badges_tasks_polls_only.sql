-- 425: licznik Zadań (badges_get.tasks_pending) liczy tylko ankiety.
-- Decyzja E19: Zadania to wyłącznie ankiety, zaproszenia do baz są w Bazach
-- (własny licznik bases_count_incoming_share_invites). Od 389 tasks_pending
-- dodawał oczekujące zaproszenia do baz, więc plakietka „Zadania” w Moich
-- grach pokazywała za dużo (e2e tasks.spec.js „baza … nie powiela się w
-- Zadaniach ani ich plakietce”).

CREATE OR REPLACE FUNCTION public.badges_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  identity jsonb;
  polls integer;
  friends integer;
BEGIN
  SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id = uid;
  IF NOT public._account_is_registered(uid, identity) THEN
    RETURN jsonb_build_object('tasks_pending', 0, 'friends_pending', 0);
  END IF;

  PERFORM public.poll_claim_email_records();
  SELECT count(*) INTO polls
  FROM public.poll_tasks t
  WHERE t.recipient_user_id = uid
    AND t.done_at IS NULL AND t.declined_at IS NULL AND t.cancelled_at IS NULL;
  SELECT count(*) INTO friends
  FROM public.friendships f
  WHERE f.decision_user_id = uid AND f.status = 'pending' AND f.cancelled_at IS NULL;

  RETURN jsonb_build_object('tasks_pending', polls, 'friends_pending', friends);
END;
$function$;
