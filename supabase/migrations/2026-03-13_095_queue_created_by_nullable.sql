-- 095: Make game_gen_queue.created_by nullable
-- This avoids 500 errors in Edge Functions when called with service_role 
-- or when auth context is not automatically propagated.

ALTER TABLE public.game_gen_queue ALTER COLUMN created_by DROP NOT NULL;

-- Update policies to handle null created_by (only service_role should see them if null)
-- Existing policies already handle auth.uid() = created_by, which works for null too (null != null in SQL usually, but here we want it to be private)
