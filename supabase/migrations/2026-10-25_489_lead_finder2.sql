-- 489: Lead Finder 2 (docs/lead-finder-nowy-plan.md) — migracja dodająca,
-- zgodna wstecz ze starym Lead Finderem (stare tabele i funkcje bez zmian).
-- - marketing_candidates: kandydaci z wyszukiwarki i CEIDG przed oceną AI;
-- - marketing_run_stats: liczniki lejka na przebieg (same liczby, odczyt
--   agent_reader przez db-read);
-- - marketing_verified_contacts: źródło, ocena jakości (przegląd starych
--   kontaktów — nic nie jest kasowane), wysyłki i reakcje odbiorców;
-- - funkcje dla Workera: zapis wysyłki, reakcji i lista adresów do pominięcia.
-- Wszystko tylko dla service_role (jak inne marketing_*, migracje 446/447).

CREATE TABLE IF NOT EXISTS public.marketing_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid,
  source text NOT NULL CHECK (source IN ('search', 'ceidg')),
  source_ref text NOT NULL,
  name text,
  url text,
  domain text,
  emails text[] NOT NULL DEFAULT '{}',
  snippet text,
  pkd text[] NOT NULL DEFAULT '{}',
  region text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'classifying', 'accepted', 'rejected')),
  reject_reason text,
  UNIQUE (source, source_ref)
);
CREATE INDEX IF NOT EXISTS marketing_candidates_status_idx ON public.marketing_candidates (status, created_at);
CREATE INDEX IF NOT EXISTS marketing_candidates_domain_idx ON public.marketing_candidates (domain);

CREATE TABLE IF NOT EXISTS public.marketing_run_stats (
  run_id uuid PRIMARY KEY,
  kind text NOT NULL DEFAULT 'search' CHECK (kind IN ('search', 'review')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  target int NOT NULL DEFAULT 0,
  search_queries int NOT NULL DEFAULT 0,
  search_results int NOT NULL DEFAULT 0,
  search_engine_errors int NOT NULL DEFAULT 0,
  ceidg_records int NOT NULL DEFAULT 0,
  candidates int NOT NULL DEFAULT 0,
  dropped_no_email int NOT NULL DEFAULT 0,
  dropped_duplicate int NOT NULL DEFAULT 0,
  dropped_public int NOT NULL DEFAULT 0,
  dropped_rule int NOT NULL DEFAULT 0,
  pages_fetched int NOT NULL DEFAULT 0,
  sent_to_ai int NOT NULL DEFAULT 0,
  ai_calls int NOT NULL DEFAULT 0,
  ai_accepted int NOT NULL DEFAULT 0,
  ai_rejected int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0
);

ALTER TABLE public.marketing_verified_contacts
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS quality text,
  ADD COLUMN IF NOT EXISTS quality_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reaction text,
  ADD COLUMN IF NOT EXISTS reaction_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_verified_contacts_quality_check') THEN
    ALTER TABLE public.marketing_verified_contacts
      ADD CONSTRAINT marketing_verified_contacts_quality_check CHECK (quality IS NULL OR quality IN ('good', 'junk'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_verified_contacts_reaction_check') THEN
    ALTER TABLE public.marketing_verified_contacts
      ADD CONSTRAINT marketing_verified_contacts_reaction_check CHECK (reaction IS NULL OR reaction IN ('replied', 'declined', 'bounced'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_verified_email_lower ON public.marketing_verified_contacts (lower(email));

-- Wysyłka z panelu: kontakt oznaczony jako użyty, licznik i data wysyłki.
CREATE OR REPLACE FUNCTION public.marketing_mark_sent(p_emails text[])
RETURNS int LANGUAGE sql SET search_path = public, pg_temp AS $$
  WITH u AS (
    UPDATE public.marketing_verified_contacts
       SET sent_count = sent_count + 1, last_sent_at = now(), is_used = true
     WHERE lower(email) = ANY (SELECT lower(e) FROM unnest(p_emails) e)
    RETURNING 1)
  SELECT count(*)::int FROM u;
$$;

-- Reakcja odbiorcy (poczta przychodząca). Odmowa i odbicie są ostateczne:
-- późniejsza zwykła odpowiedź ich nie nadpisuje.
CREATE OR REPLACE FUNCTION public.marketing_mark_reaction(p_email text, p_reaction text)
RETURNS int LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  IF p_reaction NOT IN ('replied', 'declined', 'bounced') THEN
    RAISE EXCEPTION 'marketing_mark_reaction: nieznana reakcja %', p_reaction;
  END IF;
  UPDATE public.marketing_verified_contacts
     SET reaction = p_reaction, reaction_at = now()
   WHERE lower(email) = lower(trim(p_email))
     AND (p_reaction <> 'replied' OR reaction IS NULL OR reaction = 'replied');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Adresy, do których kolejna wysyłka ma nie iść (odmowa, odbicie).
CREATE OR REPLACE FUNCTION public.marketing_send_blocked(p_emails text[])
RETURNS SETOF text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT DISTINCT lower(email) FROM public.marketing_verified_contacts
   WHERE reaction IN ('declined', 'bounced')
     AND lower(email) = ANY (SELECT lower(e) FROM unnest(p_emails) e);
$$;

-- Liczby do kontroli przez db-read (bez adresów i treści).
CREATE OR REPLACE FUNCTION public.marketing_contact_counts()
RETURNS TABLE (total int, unreviewed int, good int, junk int, sent int, replied int, declined int, bounced int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::int,
         count(*) FILTER (WHERE quality IS NULL)::int,
         count(*) FILTER (WHERE quality = 'good')::int,
         count(*) FILTER (WHERE quality = 'junk')::int,
         count(*) FILTER (WHERE sent_count > 0)::int,
         count(*) FILTER (WHERE reaction = 'replied')::int,
         count(*) FILTER (WHERE reaction = 'declined')::int,
         count(*) FILTER (WHERE reaction = 'bounced')::int
    FROM public.marketing_verified_contacts;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_candidates', 'marketing_run_stats'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.marketing_mark_sent(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_mark_reaction(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_send_blocked(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_contact_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_mark_sent(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_mark_reaction(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_send_blocked(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_contact_counts() TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_reader') THEN
    GRANT SELECT ON public.marketing_run_stats TO agent_reader;
    GRANT EXECUTE ON FUNCTION public.marketing_contact_counts() TO agent_reader;
  END IF;
END $$;
