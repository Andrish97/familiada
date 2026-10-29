-- 075: Reset is_marketing flag - no auto-detection, manual only

-- Reset all is_marketing flags to false
-- Marketing emails should only be marked:
-- 1. Manually via the megaphone button in message view
-- 2. Automatically when sending from marketing panel
UPDATE public.messages SET is_marketing = false WHERE is_marketing = true;

