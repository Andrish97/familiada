-- 200: Przemianowanie mailerlite na mailersend oraz aktualizacja limitu (100/dzień)

UPDATE public.email_providers
SET name = 'mailersend',
    label = 'MailerSend',
    daily_limit = 100,
    rem_worker = 80,
    rem_immediate = 20
WHERE name = 'mailerlite';

UPDATE public.mail_settings
SET provider_order = REPLACE(provider_order, 'mailerlite', 'mailersend')
WHERE provider_order LIKE '%mailerlite%';
