-- 057: Fix gen_share_key — brak uprawnień do schema extensions
--
-- Rola `authenticated` nie ma USAGE na schema `extensions`,
-- więc trigger games_fill_share_keys failował z "permission denied for schema extensions"
-- przy każdym INSERT do games (import, tworzenie nowej gry itp.)
--
-- Rozwiązanie: SECURITY DEFINER — funkcja uruchamia się z prawami właściciela (postgres),
-- który ma dostęp do extensions.gen_random_bytes.

CREATE OR REPLACE FUNCTION "public"."gen_share_key"("n_bytes" integer DEFAULT 24)
RETURNS "text"
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
AS $$
  SELECT encode(gen_random_bytes(n_bytes), 'hex');
$$;
