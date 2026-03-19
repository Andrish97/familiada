-- 116: Usuń kolumnę ios_webapp_prompt_dismissed z user_flags (przeniesiono do localStorage)
ALTER TABLE public.user_flags DROP COLUMN IF EXISTS ios_webapp_prompt_dismissed;
