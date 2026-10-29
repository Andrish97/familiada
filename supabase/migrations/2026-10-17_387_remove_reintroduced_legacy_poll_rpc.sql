BEGIN;

-- Migration 368 retired this compatibility endpoint; migration 382 must not
-- restore it while wrapping the current sharing RPCs.
DROP FUNCTION IF EXISTS public.polls_hub_share_poll(uuid,uuid[]);

COMMIT;
