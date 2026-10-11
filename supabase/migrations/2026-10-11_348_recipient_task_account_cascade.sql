-- Graf pkt7: usunięcie konta odbiorcy usuwa zależne zaproszenia.
-- SET NULL blokował usunięcie auth.users przez poll_tasks_one_recipient_chk.
-- Trigger347 usuwa niepełne głosy; komplet pozostaje anonimowym agregatem.
BEGIN;
-- Rodzic przed dziećmi, również podczas równoległego usuwania konta.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.base_share_tasks,public.poll_subscriptions,public.poll_tasks IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.base_share_tasks DROP CONSTRAINT base_share_tasks_recipient_user_id_fkey;
ALTER TABLE public.base_share_tasks ADD CONSTRAINT base_share_tasks_recipient_user_id_fkey
 FOREIGN KEY(recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.poll_subscriptions DROP CONSTRAINT poll_subscriptions_subscriber_user_id_fkey;
ALTER TABLE public.poll_subscriptions ADD CONSTRAINT poll_subscriptions_subscriber_user_id_fkey
 FOREIGN KEY(subscriber_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.poll_tasks DROP CONSTRAINT poll_tasks_recipient_user_id_fkey;
ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_recipient_user_id_fkey
 FOREIGN KEY(recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
COMMIT;
NOTIFY pgrst,'reload schema';
