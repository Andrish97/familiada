-- 490: Lead Finder 3 (docs/lead-finder-nowy-plan.md) — kategorie wyszukiwania
-- edytowane w panelu, kategoria kontaktu i kandydata, jednorazowe dopasowanie
-- starych wysyłek i odpowiedzi. Dodające, zgodne wstecz.
-- - „Użyte” = wysłano ofertę: kontakty z is_used (decyzja właściciela:
--   wysłano wszystkim oznaczonym jako użyte) i adresaci maili marketingowych
--   z historii messages dostają sent_count/last_sent_at;
-- - odpowiedź = wiadomość przychodząca od adresu kontaktu po pierwszej
--   wysyłce (albo oznaczona jako marketingowa) -> reaction 'replied'.

CREATE TABLE IF NOT EXISTS public.marketing_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Rozwinięcie przez AI (usługa): kogo szukamy / kogo nie, frazy, kody PKD.
  description text,
  queries text[] NOT NULL DEFAULT '{}',
  pkd text[] NOT NULL DEFAULT '{}',
  expanded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_categories_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_categories_name_key ON public.marketing_categories (lower(btrim(name)));

ALTER TABLE public.marketing_verified_contacts
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.marketing_categories(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_candidates
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.marketing_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_verified_category ON public.marketing_verified_contacts (category_id);

ALTER TABLE public.marketing_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_categories FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.marketing_categories TO service_role;

-- Stare wysyłki: historia maili marketingowych (adresat = kontakt).
WITH sent AS (
  SELECT lower(btrim(to_email)) AS email, count(*)::int AS n, max(created_at) AS last_at, min(created_at) AS first_at
    FROM public.messages
   WHERE direction = 'outbound' AND is_marketing = true AND deleted_at IS NULL AND to_email IS NOT NULL
   GROUP BY 1
)
UPDATE public.marketing_verified_contacts c
   SET sent_count = greatest(c.sent_count, s.n),
       last_sent_at = greatest(c.last_sent_at, s.last_at),
       is_used = true
  FROM sent s
 WHERE lower(btrim(c.email)) = s.email;

-- Oznaczone jako „użyte” bez historii w messages: wysyłka była (decyzja
-- właściciela), data nieznana.
UPDATE public.marketing_verified_contacts
   SET sent_count = 1
 WHERE is_used = true AND sent_count = 0;

-- Odpowiedzi: wiadomość od adresu kontaktu po pierwszej wysyłce do niego
-- albo oznaczona jako marketingowa (odpowiedź rozpoznana po temacie).
WITH first_sent AS (
  SELECT lower(btrim(to_email)) AS email, min(created_at) AS first_at
    FROM public.messages
   WHERE direction = 'outbound' AND is_marketing = true AND to_email IS NOT NULL
   GROUP BY 1
), replies AS (
  SELECT lower(btrim(m.from_email)) AS email, max(m.created_at) AS at
    FROM public.messages m
    LEFT JOIN first_sent f ON f.email = lower(btrim(m.from_email))
   WHERE m.direction = 'inbound' AND m.from_email IS NOT NULL
     AND (m.is_marketing = true OR (f.first_at IS NOT NULL AND m.created_at > f.first_at))
   GROUP BY 1
)
UPDATE public.marketing_verified_contacts c
   SET reaction = 'replied', reaction_at = r.at
  FROM replies r
 WHERE lower(btrim(c.email)) = r.email AND c.reaction IS NULL AND c.sent_count > 0;
