-- 510: kontakty Marketingu spoza grupy docelowej (decyzja właściciela 2026-10-29):
-- florystyka, dekoracje, catering oraz sale i hotele z samym wynajmem i przyjęciem,
-- bez rozrywki dla gości. Lokale organizujące eventy z własną rozrywką zostają.
-- Tylko identyfikatory (bez nazw i adresów w publicznym repo). Lead Finder nie
-- doda ich ponownie: domeny zostają w marketing_candidates.
DELETE FROM public.marketing_verified_contacts WHERE id IN (
  '528d1656-00d7-4507-8181-5000a7ebf931', 'c54ef4cf-e2c3-46c6-bacd-a6c14eb4195b',
  '6e853e31-226f-461c-80d7-66204e90187d', '028192cc-8f9f-4d8b-8f8c-9c5f1c2de45a',
  '83230519-2c9c-4cdf-9ae3-602946b73f73', '392ba4d9-e7c8-40cc-b6f6-2444f0192e3b',
  '928e49b7-b4d9-4d97-86e8-e822af3cddaa', 'fe69d603-0500-4c29-ba22-56d457ce8681',
  '7afdf210-5aa4-460f-97b6-4a2f081cf2e3', '5952418b-ffc7-448d-aca5-265580b8f76a',
  '240199e3-e6d0-4311-8b11-7564c0f346cd', '505f2330-a334-4876-bf69-c3b0df90cea8'
);
