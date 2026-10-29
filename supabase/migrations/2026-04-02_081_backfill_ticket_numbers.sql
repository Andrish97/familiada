-- 081: Backfill ticket_number for existing contact_reports

-- Generate ticket numbers for reports without them
-- Format: TICKET-YYYY-NNNN (using id converted to sequential number)
WITH numbered AS (
  SELECT 
    id,
    'TICKET-' || EXTRACT(YEAR FROM created_at)::text || '-' || 
    LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 4, '0') AS new_ticket_number
  FROM public.contact_reports
  WHERE ticket_number IS NULL
)
UPDATE public.contact_reports cr
SET ticket_number = n.new_ticket_number
FROM numbered n
WHERE cr.id = n.id;

-- Log how many were updated
DO $$
DECLARE
  updated_count integer;
BEGIN
  SELECT COUNT(*) INTO updated_count 
  FROM public.contact_reports 
  WHERE ticket_number IS NOT NULL;
  
  RAISE NOTICE 'Updated % contact_reports with ticket_number', updated_count;
END $$;
