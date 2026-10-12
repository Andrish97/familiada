-- Isolated restore only: schema export omits ACL and policy table data.
-- Preserve current function bodies, including the newer Go resolver.
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('fam','fam357reset') THEN RAISE EXCEPTION 'isolated database only'; END IF; END $$;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce) VALUES
 ('base:share','pair',86400,true),('base:share_after_reject','pair',2592000,true) ON CONFLICT DO NOTHING;
REVOKE ALL ON FUNCTION public._base_share_pair_lock(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._base_share_refusal_until(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.leave_shared_base(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.leave_shared_base(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_base_share_role(uuid,uuid,public.base_share_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_base_share_role(uuid,uuid,public.base_share_role) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_base_share(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_base_share(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.base_share_resend(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_resend(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.base_share_undo_decline(uuid),public.base_declines_list_mine() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_undo_decline(uuid),public.base_declines_list_mine() TO authenticated;
REVOKE ALL ON FUNCTION public.base_share_tasks_cleanup() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.base_share_decline(uuid),public.base_share_accept(uuid),public.base_share_cancel_task(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_decline(uuid),public.base_share_accept(uuid),public.base_share_cancel_task(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.base_share_by_user(uuid,uuid,public.base_share_role),public.base_share_by_email(uuid,text,public.base_share_role),
 public.base_share_update_invite_role(uuid,public.base_share_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_by_user(uuid,uuid,public.base_share_role),public.base_share_by_email(uuid,text,public.base_share_role),
 public.base_share_update_invite_role(uuid,public.base_share_role) TO authenticated;
REVOKE ALL ON FUNCTION public.base_share_panel(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_panel(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.share_base_by_email(uuid,text,public.base_share_role) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.base_share_accept(uuid),public.base_share_decline(uuid),public.base_share_cancel_task(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.base_share_accept(uuid),public.base_share_decline(uuid),public.base_share_cancel_task(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.base_share_tasks_cleanup() FROM PUBLIC,anon,authenticated;
COMMIT;
