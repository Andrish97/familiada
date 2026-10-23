-- E26 (audyt sprzątania 2026-10-23, docs/audyt-sprzatania-bazy.md): część A
-- oraz B5, B6, B7, B8. Usuwa tylko obiekty bez wywołującego w kodzie i w bazie
-- (sprawdzone ponownie po „zaczynaj”); zachowanie strony się nie zmienia.

-- A1. Zduplikowane indeksy (każdy zastępuje indeks/constraint o tym samym
-- albo dłuższym kluczu z tą samą pierwszą kolumną).
DROP INDEX public.idx_questions_game;              -- = questions_game_idx
DROP INDEX public.questions_game_idx;              -- ⊂ questions_game_ord_uniq
DROP INDEX public.questions_game_ord_idx;          -- = questions_game_ord_uniq
DROP INDEX public.questions_game_ord_uq;           -- = questions_game_ord_uniq
ALTER TABLE public.questions DROP CONSTRAINT questions_game_ord_unique;  -- = questions_game_ord_uniq
DROP INDEX public.poll_votes_by_session;           -- ⊂ poll_votes_unique_per_q
DROP INDEX public.poll_votes_session_idx;          -- ⊂ poll_votes_unique_per_q
DROP INDEX public.poll_votes_game_idx;             -- ⊂ poll_votes_game_q_idx
DROP INDEX public.answers_q_idx;                   -- ⊂ answers_q_ord_uniq
DROP INDEX public.pte_by_session;                  -- ⊂ pte_unique_per_q
DROP INDEX public.poll_sessions_game_idx;          -- ⊂ poll_sessions_game_open_idx
DROP INDEX public.qb_category_tags_category_id_idx; -- ⊂ qb_category_tags_pk
DROP INDEX public.qb_question_tags_question_id_idx; -- ⊂ qb_question_tags_pkey
DROP INDEX public.qb_tags_base_id_idx;             -- ⊂ qb_tags_base_id_name_key
DROP INDEX public.user_logos_user_id_idx;          -- ⊂ user_logos_user_name_uniq
DROP INDEX public.games_keys_poll_idx;             -- ⊂ games_share_keys_unique

-- A2. Martwe funkcje: stare RPC ankiet (ankiety-refaktor.md §4 pkt 6).
DROP FUNCTION public.rpc_example(integer);
DROP FUNCTION public.poll_vote("text", integer, integer, "text");
DROP FUNCTION public.poll_vote_points("uuid", "text", "uuid", "uuid", "text");
DROP FUNCTION public.poll_vote_by_ids_legacy("uuid", "text", "uuid", "uuid", "text");
DROP FUNCTION public.poll_text_submit_simple_legacy("uuid", "text", "uuid", "text", "text");
DROP FUNCTION public.poll_results("text");
DROP FUNCTION public.get_poll_bundle("text");
DROP FUNCTION public.poll_on_login();
DROP FUNCTION public.polls_action("text", "uuid", "text");
DROP FUNCTION public.polls_hub_gc(integer);
DROP FUNCTION public.polls_hub_list_polls();
DROP FUNCTION public.polls_hub_list_open_polls();
DROP FUNCTION public.polls_hub_anon_voters_poll_points("uuid");
DROP FUNCTION public.polls_hub_anon_voters_poll_text("uuid");
DROP FUNCTION public.poll_admin_preview("uuid");
DROP FUNCTION public.poll_admin_delete_vote("uuid", "text");
DROP FUNCTION public.poll_admin_can_close("uuid");
DROP FUNCTION public.poll_go_task_action("uuid", "text", "text");
DROP FUNCTION public.poll_close_and_normalize("uuid", "text");
DROP FUNCTION public.poll_points_close_and_normalize("uuid", "text");
DROP FUNCTION public.poll_text_close_apply("uuid", "text", "jsonb");
DROP FUNCTION public.poll_task_send("uuid", "text", "text"[]);
DROP FUNCTION public.poll_points_vote_batch_owner("uuid", "jsonb", "text");
DROP FUNCTION public.poll_text_submit_batch_owner("uuid", "jsonb", "text");
DROP FUNCTION public.game_action_state("uuid");

-- A2. Stare udostępnianie baz.
DROP FUNCTION public.base_has_share("uuid", "uuid");
DROP FUNCTION public.can_access_base("uuid");
DROP FUNCTION public.can_edit_base("uuid");
DROP FUNCTION public.list_shared_bases();
DROP FUNCTION public.share_base_by_email("uuid", "text", "public"."base_share_role");
DROP FUNCTION public.base_share_by_email("uuid", "text", "public"."base_share_role");

-- A2. Różne bez wywołującego.
DROP FUNCTION public.get_game_by_key("text");
DROP FUNCTION public.expire_my_device_shares();
DROP FUNCTION public.control_device_instance_status("uuid", "text", "text", "uuid");
DROP FUNCTION public.control_device_slots_for_owner("uuid");
DROP FUNCTION public.storage_list_objects("text", "text", integer);
DROP FUNCTION public._copy_game_send("uuid", "uuid", "jsonb", "uuid");
DROP FUNCTION public._logo_image_path("jsonb", "uuid");
DROP FUNCTION public._poll_text_tally_points("jsonb");
DROP FUNCTION public.admin_config_get("text");
DROP FUNCTION public.admin_config_set("text", "text", "text");

-- A2. Funkcje triggerów bez triggera.
DROP FUNCTION public.enforce_max_answers();
DROP FUNCTION public.set_owner_id_on_games_insert();
DROP FUNCTION public.touch_state_at();
DROP FUNCTION public.update_lead_finder_updated_at();
DROP FUNCTION public.update_marketing_updated_at();

-- A3. Kolejka generatora gier (proces usunięty w 112).
DROP TABLE public.game_gen_queue;

-- B8. Polityka po claimie share_key (żaden token go nie niesie) i indeksy,
-- które obsługiwały tylko ją oraz usunięte wyżej get_game_by_key/poll_results.
DROP POLICY games_select_by_keys ON public.games;
DROP INDEX public.games_keys_control_idx;
DROP INDEX public.games_keys_display_idx;
DROP INDEX public.games_keys_host_idx;

-- B5. Logi poczty: retencja 30 dni bez zmian. Bez zapytań po request_id /
-- queue_id; e2e czyta po odbiorcy i dacie (/_e2e_api, dostarczenie maila).
DROP INDEX public.mail_function_logs_request_idx;
DROP INDEX public.mail_function_logs_queue_idx;
CREATE INDEX mail_function_logs_recipient_created_idx
  ON public.mail_function_logs (recipient_email, created_at);

-- B6. Rozdęta sterta (12 wierszy na 3,5 MB). VACUUM FULL nie działa
-- w transakcji migracji; CLUSTER z nazwą tabeli przepisuje ją tak samo.
CLUSTER public.marketing_search_logs USING marketing_search_logs_pkey;

-- B7. Stara ścieżka embeddingów Marketplace (od 111 cron woła
-- invoke_embed_missing_market_games z sekretami w Vault). Gdyby jakieś
-- zadanie cron nadal ją wołało — zostaje (ostrzeżenie w logu migracji).
DO $$
DECLARE v_jobs integer := 0;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job WHERE command ILIKE ''%cron_embed_missing_market_games%'''
      INTO v_jobs;
  END IF;
  IF v_jobs > 0 THEN
    RAISE WARNING 'E26 B7: % zadanie(a) cron wołają cron_embed_missing_market_games — funkcja i klucze app_config zostają', v_jobs;
  ELSE
    DROP FUNCTION public.cron_embed_missing_market_games();
    DELETE FROM public.app_config WHERE key IN ('edge_url', 'edge_service_role_jwt');
  END IF;
END $$;
