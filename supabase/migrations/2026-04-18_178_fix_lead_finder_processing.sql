-- Migration: Fix lead-finder processing race condition and missing columns
-- 1. Add missing column for processing timestamp
-- 2. Add atomic RPC to claim next pending lead with SKIP LOCKED

-- Add column if not exists
ALTER TABLE IF EXISTS marketing_raw_contacts 
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- RPC to safely claim lead
CREATE OR REPLACE FUNCTION "public"."claim_next_pending_lead"()
RETURNS SETOF "public"."marketing_raw_contacts" AS $$
DECLARE
  target_id uuid;
BEGIN
  -- FOR UPDATE SKIP LOCKED is exactly what we need for concurrency
  SELECT id INTO target_id
  FROM "public"."marketing_raw_contacts"
  WHERE "status" = 'pending'
  ORDER BY "id" ASC  -- process oldest first
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF target_id IS NOT NULL THEN
    UPDATE "public"."marketing_raw_contacts"
    SET "status" = 'processing', "processing_started_at" = now()
    WHERE "id" = target_id;
    
    RETURN QUERY SELECT * FROM "public"."marketing_raw_contacts" WHERE "id" = target_id;
  END IF;

  RETURN;
END;
$$ LANGUAGE "plpgsql" SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."claim_next_pending_lead"() TO anon;
GRANT EXECUTE ON FUNCTION "public"."claim_next_pending_lead"() TO service_role;
GRANT EXECUTE ON FUNCTION "public"."claim_next_pending_lead"() TO authenticated;
