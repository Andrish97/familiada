-- Anulowanie zmiany e-maila / migracji gościa usuwa też tokeny z auth.one_time_tokens.
-- Wykryte e2e (2026-10-22): po guest_cancel_migration link z maila nadal przenosił konto.
CREATE OR REPLACE FUNCTION "public"."auth_clear_email_change"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  sets text[] := array[]::text[];
  q    text;
  has_col boolean;
BEGIN
  -- new_email (legacy GoTrue)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'new_email'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'new_email = '''''); END IF;

  -- email_change (current GoTrue)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change = '''''); END IF;

  -- email_change_token_current
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_current'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_token_current = '''''); END IF;

  -- email_change_token_new
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_new'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_token_new = '''''); END IF;

  -- email_change_sent_at
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_sent_at'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_sent_at = null'); END IF;

  -- email_change_confirm_status
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_confirm_status'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_confirm_status = 0'); END IF;

  IF array_length(sets, 1) IS NULL THEN
    RETURN false; -- unknown GoTrue layout
  END IF;

  q := format('UPDATE auth.users SET %s WHERE id = $1', array_to_string(sets, ', '));
  EXECUTE q USING p_user_id;

  -- Nowszy GoTrue trzyma tokeny także w auth.one_time_tokens; bez tego link
  -- z maila działał po anulowaniu (migracja gościa).
  IF to_regclass('auth.one_time_tokens') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.one_time_tokens WHERE user_id = $1 AND token_type::text LIKE ''email_change%''' USING p_user_id;
  END IF;

  RETURN true;
END;
$_$;

