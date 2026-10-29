-- Bug znaleziony na żywo przy audycie login/reset/confirm/account: RPC
-- auth_clear_email_change() (wołane przez cancel_my_email_change() —
-- przycisk "Anuluj zmianę" na /account — i przez guest_cancel_migration() —
-- przycisk "Anuluj" przy migracji gościa) ustawiał kolumny tekstowe
-- auth.users (new_email, email_change, email_change_token_current,
-- email_change_token_new) na SQL NULL.
--
-- Ten self-hosted GoTrue skanuje te kolumny do zwykłego string (nie
-- sql.NullString) — NULL powoduje:
--   error finding user: sql: Scan error on column index 8, name
--   "email_change": converting NULL to string is unsupported
-- Raz ustawione na NULL, KAŻDE kolejne zapytanie GoTrue o tego użytkownika
-- (łącznie ze zwykłym POST /token grant_type=password, czyli zwykłym
-- logowaniem hasłem) zaczyna wywalać się 500 "Database error querying
-- schema" — użytkownik traci możliwość zalogowania się, dopóki coś (np.
-- kolejna realna próba zmiany e-maila) nie nadpisze kolumny prawdziwą
-- wartością.
--
-- Naprawa: te kolumny mają być pustym stringiem, nie NULL (email_change_
-- sent_at to timestamp, email_change_confirm_status to int — te zostają
-- bez zmian, null/0 im nie przeszkadza). Backfill: konta już utknięte w tym
-- stanie z przeszłości dostają '' zamiast NULL od razu.

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

  RETURN true;
END;
$_$;

-- Backfill: konta już utknięte w złym stanie z przeszłości (ktoś kiedyś
-- kliknął "Anuluj zmianę"/"Anuluj" migracji, zanim ta poprawka istniała).
-- Dynamicznie, tak jak funkcja wyżej -- auth.users nie jest w tym dumpie
-- (schema.sql nie obejmuje schematu auth), więc nie zakładamy z góry,
-- które z tych kolumn istnieją w tej wersji GoTrue.
DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['new_email', 'email_change', 'email_change_token_current', 'email_change_token_new']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = col
    ) THEN
      EXECUTE format('UPDATE auth.users SET %I = '''' WHERE %I IS NULL', col, col);
    END IF;
  END LOOP;
END;
$$;
