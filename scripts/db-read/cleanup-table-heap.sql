-- Audyt sprzątania (2026-10-23): sterta bez indeksów i TOAST, estymata
-- reltuples (-1 = nigdy nieanalizowana), martwe wiersze, plus dokładne
-- liczności i ostatnie daty tabel E21 (jedyne z SELECT dla agent_reader).
SELECT n.ord::int AS ord,
       pg_relation_size(c.oid) AS sterta,
       pg_indexes_size(c.oid) AS indeksy,
       CASE WHEN c.reltoastrelid <> 0 THEN pg_total_relation_size(c.reltoastrelid) ELSE 0 END AS toast,
       c.reltuples::bigint AS reltuples,
       s.n_dead_tup AS martwe,
       CASE n.name WHEN 'e21_repair_runs' THEN (SELECT count(*) FROM public.e21_repair_runs)
                   WHEN 'e21_demo_templates_before' THEN (SELECT count(*) FROM public.e21_demo_templates_before) END AS dokladnie,
       CASE n.name WHEN 'e21_repair_runs' THEN (SELECT max(r.ran_at) FROM public.e21_repair_runs r) END AS ostatni_wpis
FROM unnest(ARRAY['answers','app_config','app_ratings','base_share_tasks','contact_report_messages','contact_reports','control2_session_diag','control2_session_events','control_device_connections','control_device_link_tokens','control_device_shares','control_device_slots','control_runtime_sessions','demo_template_data','device_connect_codes','device_presence','e21_demo_templates_before','e21_repair_runs','e2e_emails','e2e_identities','e2e_leases','edit_locks','email_cooldowns','email_intents','email_providers','email_unsub_tokens','friendships','game_gen_queue','game_import_receipts','game_session_active','game_sessions','game_sessions_effective','game_state','game_state_display_completion','game_state_history','games','guest_migration_staging','mail_center_links','mail_center_request_events','mail_center_sessions','mail_cooldown_policies','mail_cooldowns','mail_function_logs','mail_notification_allocations','mail_queue','mail_settings','market_game_ratings','market_games','marketing_ai_providers','marketing_cities','marketing_raw_contacts','marketing_search_logs','marketing_search_queries_log','marketing_verified_contacts','message_attachments','messages','poll_anonymous_limits','poll_mail_budget_events','poll_sessions','poll_subscriptions','poll_tally_drafts','poll_tasks','poll_text_entries','poll_votes','profiles','public_kv','qb_categories','qb_category_tags','qb_question_tags','qb_questions','qb_tags','qb_trash','question_base_shares','question_bases','questions','reports','reserved_username_accounts','reserved_username_prefixes','resource_clone_assets','resource_clone_jobs','resource_clone_receipts','resource_copy_history','resource_copy_offers','resource_demo_origins','schema_migrations','shared_devices','site_activity','site_activity_hours','snake_events','snake_progress','stats_excluded_users','stats_exclusions_effective','storage_cleanup_queue','user_cooldowns','user_flags','user_logos','user_market_library']::text[]) WITH ORDINALITY AS n(name, ord)
LEFT JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = n.name
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
ORDER BY n.ord
