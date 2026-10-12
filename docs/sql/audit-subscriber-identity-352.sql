-- Aggregate-only production audit; no invitations, accounts or preferences are changed.
BEGIN TRANSACTION READ ONLY;
WITH sources AS (
 SELECT s.*,u.id AS current_account FROM public.poll_subscriptions s
 LEFT JOIN auth.users u ON public._norm_email(u.email)=public._norm_email(s.subscriber_email)
  AND public._poll_identity_regular(u.id,to_jsonb(u))
 WHERE s.subscriber_user_id IS NULL
)
SELECT status,count(*) AS email_sources,count(*) FILTER(WHERE current_account IS NOT NULL) AS currently_registered
FROM sources GROUP BY status ORDER BY status;
SELECT count(*) AS uid_tasks_without_live_contact
FROM public.poll_tasks t JOIN auth.users u ON u.id=t.recipient_user_id
WHERE t.status IN('pending','opened')
 AND NOT EXISTS(SELECT 1 FROM public.friendships f WHERE f.status='active'
  AND ((f.requester_id=t.owner_id AND f.addressee_id=t.recipient_user_id)
    OR(f.addressee_id=t.owner_id AND f.requester_id=t.recipient_user_id)))
 AND NOT EXISTS(SELECT 1 FROM public.poll_subscriptions s WHERE s.owner_id=t.owner_id AND s.status='active'
  AND(s.subscriber_user_id=t.recipient_user_id OR public._norm_email(s.subscriber_email)=public._norm_email(u.email)));
SELECT count(*) AS email_sources_with_account_pending_or_active
FROM public.poll_subscriptions s WHERE s.subscriber_user_id IS NULL AND s.status IN('pending','active')
 AND EXISTS(SELECT 1 FROM auth.users u WHERE public._norm_email(u.email)=public._norm_email(s.subscriber_email)
  AND public._poll_identity_regular(u.id,to_jsonb(u)));
SELECT g.status AS game_state,(g.share_key_poll IS NOT DISTINCT FROM t.share_key_poll) AS current_key,
 (g.type::text=t.poll_type) AS current_type,
 (owner.email~'^test[0-9]+@familiada[.]online$') AS owner_test,
 (recipient.email~'^test[0-9]+@familiada[.]online$') AS recipient_test,count(*) AS unresolved_tasks
FROM public.poll_tasks t JOIN public.games g ON g.id=t.game_id
JOIN auth.users owner ON owner.id=t.owner_id JOIN auth.users recipient ON recipient.id=t.recipient_user_id
WHERE t.status IN('pending','opened') AND NOT public.are_friends(t.owner_id,t.recipient_user_id)
 AND NOT EXISTS(SELECT 1 FROM public.poll_subscriptions s WHERE s.owner_id=t.owner_id AND s.status='active'
  AND(s.subscriber_user_id=t.recipient_user_id OR public._norm_email(s.subscriber_email)=public._norm_email(recipient.email)))
GROUP BY 1,2,3,4,5;
SELECT (s.declined_at>now()-interval '30 days') AS within_refusal_window,
 (owner.email~'^test[0-9]+@familiada[.]online$') AS owner_test,
 (recipient.email~'^test[0-9]+@familiada[.]online$') AS recipient_test,count(*) AS declined_registered_sources
FROM public.poll_subscriptions s JOIN auth.users owner ON owner.id=s.owner_id
JOIN auth.users recipient ON public._norm_email(recipient.email)=public._norm_email(s.subscriber_email)
 AND public._poll_identity_regular(recipient.id,to_jsonb(recipient))
WHERE s.subscriber_user_id IS NULL AND s.status='declined' GROUP BY 1,2,3;
ROLLBACK;
