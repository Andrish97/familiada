-- Aggregate-only production audit for the current email subscription model.
-- No invitations, accounts or preferences are changed and no identities are exposed.
BEGIN TRANSACTION READ ONLY;

WITH email_sources AS (
 SELECT s.status,
        s.registered_user_id,
        u.id AS current_account
 FROM public.poll_subscriptions s
 LEFT JOIN auth.users u
   ON public._norm_email(u.email)=public._norm_email(s.subscriber_email)
  AND public._poll_identity_regular(u.id,to_jsonb(u))
 WHERE s.subscriber_email IS NOT NULL
)
SELECT status,
       count(*) AS email_sources,
       count(*) FILTER (WHERE current_account IS NOT NULL) AS currently_registered,
       count(*) FILTER (WHERE registered_user_id IS NOT NULL) AS bound_to_account,
       count(*) FILTER (WHERE registered_user_id IS NOT NULL
                         AND current_account IS DISTINCT FROM registered_user_id) AS binding_email_mismatch
FROM email_sources
GROUP BY status ORDER BY status;

-- Actionable registered tasks should still have an active friendship or an
-- active email subscription for the same owner and recipient account.
SELECT count(*) AS uid_tasks_without_live_contact
FROM public.poll_tasks t
JOIN auth.users u ON u.id=t.recipient_user_id
WHERE t.status IN ('pending','opened')
 AND NOT EXISTS (
   SELECT 1 FROM public.friendships f WHERE f.status='active'
    AND ((f.requester_id=t.owner_id AND f.addressee_id=t.recipient_user_id)
      OR (f.addressee_id=t.owner_id AND f.requester_id=t.recipient_user_id))
 )
 AND NOT EXISTS (
   SELECT 1 FROM public.poll_subscriptions s
   WHERE s.owner_id=t.owner_id AND s.status='active'
    AND (s.registered_user_id=t.recipient_user_id
      OR public._norm_email(s.subscriber_email)=public._norm_email(u.email))
 );

-- Keep the existing aggregate breakdown for actionable tasks without a
-- currently valid contact, without exposing game names or user identifiers.
SELECT g.status AS game_state,
       (g.share_key_poll IS NOT DISTINCT FROM t.share_key_poll) AS current_key,
       (g.type::text=t.poll_type) AS current_type,
       (owner.email~'^test[0-9]+@familiada[.]online$') AS owner_test,
       (recipient.email~'^test[0-9]+@familiada[.]online$') AS recipient_test,
       count(*) AS unresolved_tasks
FROM public.poll_tasks t
JOIN public.games g ON g.id=t.game_id
JOIN auth.users owner ON owner.id=t.owner_id
JOIN auth.users recipient ON recipient.id=t.recipient_user_id
WHERE t.status IN ('pending','opened')
 AND NOT public.are_friends(t.owner_id,t.recipient_user_id)
 AND NOT EXISTS (
   SELECT 1 FROM public.poll_subscriptions s
   WHERE s.owner_id=t.owner_id AND s.status='active'
    AND (s.registered_user_id=t.recipient_user_id
      OR public._norm_email(s.subscriber_email)=public._norm_email(recipient.email))
 )
GROUP BY 1,2,3,4,5;

SELECT (s.declined_at>now()-interval '30 days') AS within_refusal_window,
       (owner.email~'^test[0-9]+@familiada[.]online$') AS owner_test,
       (recipient.email~'^test[0-9]+@familiada[.]online$') AS recipient_test,
       count(*) AS declined_registered_sources
FROM public.poll_subscriptions s
JOIN auth.users owner ON owner.id=s.owner_id
JOIN auth.users recipient ON recipient.id=s.registered_user_id
WHERE s.status='declined'
GROUP BY 1,2,3;

ROLLBACK;
