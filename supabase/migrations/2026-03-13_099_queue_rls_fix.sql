-- 099: Fix RLS for game_gen_queue to allow admin access users to see progress
-- Since the panel is protected by Cloudflare Access, we can allow public read access to this technical table.

ALTER TABLE public.game_gen_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to queue" ON public.game_gen_queue;
CREATE POLICY "Allow public read access to queue"
  ON public.game_gen_queue FOR SELECT
  TO anon, authenticated
  USING (true);

-- Ensure we can also insert anonymously if needed (already handled by previous migrations but for safety)
DROP POLICY IF EXISTS "Allow public insert to queue" ON public.game_gen_queue;
CREATE POLICY "Allow public insert to queue"
  ON public.game_gen_queue FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
