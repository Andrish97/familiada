-- 210: Fix auth_clear_email_change — replace sets || 'text' with array_append()
-- PostgreSQL (newer Supabase version) interprets 'string_literal' on the right side
-- of text[] || as a text[] array literal, causing "malformed array literal" error.
-- Fix: use array_append(sets, 'text') which unambiguously appends a single text element.

CREATE OR REPLACE FUNCTION public.auth_clear_email_change(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF has_col THEN sets := array_append(sets, 'new_email = null'); END IF;

  -- email_change (current GoTrue)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change = null'); END IF;

  -- email_change_token_current
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_current'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_token_current = null'); END IF;

  -- email_change_token_new
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_new'
  ) INTO has_col;
  IF has_col THEN sets := array_append(sets, 'email_change_token_new = null'); END IF;

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

  RETURN true;
END;
$$;
