-- Usunięcie sendgrid z email_providers (używamy tylko brevo, mailgun, sendpulse, mailerlite)
DELETE FROM public.email_providers WHERE name = 'sendgrid';
DELETE FROM public.email_providers WHERE name = 'ses';