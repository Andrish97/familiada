-- E26 po wdrożeniu 473–477: ile usuwanych obiektów jeszcze istnieje (oczekiwane 0)
-- i czy powstał indeks pod zapytanie e2e. B7 osobno: stara funkcja embeddingów
-- zostaje tylko, gdy woła ją zadanie cron (ostrzeżenie w logu migracji).
SELECT
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
     AND proname = ANY (ARRAY['rpc_example','poll_vote','poll_vote_points','poll_vote_by_ids_legacy','poll_text_submit_simple_legacy','poll_results','get_poll_bundle','poll_on_login','polls_action','polls_hub_gc','polls_hub_list_polls','polls_hub_list_open_polls','polls_hub_anon_voters_poll_points','polls_hub_anon_voters_poll_text','poll_admin_preview','poll_admin_delete_vote','poll_admin_can_close','poll_go_task_action','poll_close_and_normalize','poll_points_close_and_normalize','poll_text_close_apply','poll_task_send','poll_points_vote_batch_owner','poll_text_submit_batch_owner','game_action_state','base_has_share','can_access_base','can_edit_base','list_shared_bases','share_base_by_email','base_share_by_email','get_game_by_key','expire_my_device_shares','control_device_instance_status','control_device_slots_for_owner','storage_list_objects','_copy_game_send','_logo_image_path','_poll_text_tally_points','admin_config_get','admin_config_set','enforce_max_answers','set_owner_id_on_games_insert','touch_state_at','update_lead_finder_updated_at','update_marketing_updated_at','game_state_undo','submit_contact_report','find_report_and_append_message','admin_move_message','admin_update_contact_report','e21_data_repair','e21_demo_answer_map','e21_demo_fixed_payload','e21_demo_game_content','e21_demo_repair','e21_demo_template_content','fam_clip_words','submit_contact_report','contact_reports_set_updated_at']::name[])) AS funkcje_zostaly,
  (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
     AND relname = ANY (ARRAY['game_gen_queue','game_state_history','e21_demo_templates_before','e21_repair_runs',
       'shared_devices','contact_reports','contact_report_messages','idx_questions_game','questions_game_idx',
       'questions_game_ord_idx','questions_game_ord_uq','questions_game_ord_unique','poll_votes_by_session',
       'poll_votes_session_idx','poll_votes_game_idx','answers_q_idx','pte_by_session','poll_sessions_game_idx',
       'qb_category_tags_category_id_idx','qb_question_tags_question_id_idx','qb_tags_base_id_idx',
       'user_logos_user_id_idx','games_keys_poll_idx','games_keys_control_idx','games_keys_display_idx',
       'games_keys_host_idx','mail_function_logs_request_idx','mail_function_logs_queue_idx']::name[])) AS relacje_zostaly,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname = 'games_select_by_keys') AS polityka_zostala,
  to_regclass('public.mail_function_logs_recipient_created_idx') IS NOT NULL AS indeks_e2e,
  EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'cron_embed_missing_market_games') AS b7_pominiete,
  pg_total_relation_size('public.marketing_search_logs') AS marketing_search_logs_bajty,
  pg_total_relation_size('public.mail_function_logs') AS mail_function_logs_bajty,
  pg_total_relation_size('public.questions') AS questions_bajty,
  pg_database_size(current_database()) AS rozmiar_bazy
