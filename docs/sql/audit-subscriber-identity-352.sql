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
SELECT count(*) AS active_uid_tasks_without_current_friend_or_matching_active_email_source
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
ROLLBACK;
