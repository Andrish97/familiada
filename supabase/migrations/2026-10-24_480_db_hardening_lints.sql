-- 480: utwardzenie bazy wg ostrzeżeń Supabase (docs/utwardzenie-bazy-plan.md).
-- 1) GraphQL nieużywany: rozszerzenie wyłączone (Supabase zostawia zaślepkę
--    graphql_public.graphql). Tabele przestają być widoczne przez /graphql/v1.
-- 2) Stała ścieżka wyszukiwania dla funkcji bez niej (wcześniej ścieżka
--    wywołującego): public + extensions jak dotąd w sesjach API, pg_temp na końcu.
-- 3) homepage-screenshots: bez polityki listowania (publiczne adresy działają
--    bez niej; kod bucketu nie czyta).

drop extension if exists pg_graphql;

do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public'
      and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and p.proname in (
        '_logo_clone_image_refs', '_logo_url_path', '_norm_email', '_poll_points_close_unchecked',
        '_poll_share', '_poll_text_close_unchecked', '_qb_tag_key', '_resource_clone_send_allowed',
        '_transfer_points', 'bases_count_incoming_share_invites', 'claim_next_pending_lead',
        'cooldown_get', 'cooldown_release', 'cooldown_reserve', 'decrement_provider_immediate',
        'decrement_provider_worker', 'edit_lock_absent_grace', 'edit_lock_ttl',
        'email_intents_set_updated_at', 'fam_answer_clean', 'fam_answer_invalid_chars',
        'fam_display_glyph_chars', 'fam_display_has_glyph', 'game_state_set_lock',
        'game_state_set_sound_muted', 'game_state_set_ui_lang', 'game_state_write',
        'games_fill_share_keys', 'gen_connect_code', 'gen_contact_ticket_number', 'gen_random_bytes',
        'get_available_ai_providers', 'get_message', 'get_poll_game', 'is_base_owner',
        'list_base_shares', 'list_messages', 'list_shared_bases_ext', 'mark_message_read',
        'market_games_build_questions_text', 'market_games_compute_fingerprint',
        'market_games_set_questions_fields', 'poll_points_vote_batch', 'poll_task_voter_token',
        'poll_tasks_touch_status_ts', 'poll_text_submit_batch', 'poll_vote_game', 'reset_email_limits',
        'set_ai_provider_cooldown', 'set_poll_qr_lang', 'set_updated_at', 'sync_market_game_rating_stats',
        'touch_game_updated_at', 'touch_updated_at', 'touch_user_flags_updated_at',
        'trg_touch_game_from_answers', 'trg_touch_game_from_questions',
        'trg_touch_market_games_updated_at', 'update_updated_at_column'
      )
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
    n := n + 1;
  end loop;
  raise notice 'search_path ustawiony: % funkcji', n;
end
$$;

drop policy if exists "Public can view homepage screenshots" on storage.objects;
