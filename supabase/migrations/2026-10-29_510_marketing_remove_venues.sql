-- 510: kontakty Marketingu spoza grupy docelowej (decyzja właściciela 2026-10-29):
-- sale, restauracje, hotele, pałace, pensjonaty, florystyka, dekoracje, catering --
-- sami nie prowadzą zabawy dla gości. Lista przejrzana przez właściciela; tylko
-- identyfikatory (bez nazw i adresów w publicznym repo). Lead Finder nie doda
-- ich ponownie: domeny zostają w marketing_candidates, a ocena odrzuca takie firmy.
DELETE FROM public.marketing_verified_contacts WHERE id IN (
  '528d1656-00d7-4507-8181-5000a7ebf931', 'fe69d603-0500-4c29-ba22-56d457ce8681',
  '928e49b7-b4d9-4d97-86e8-e822af3cddaa', '7afdf210-5aa4-460f-97b6-4a2f081cf2e3',
  '1d80fe02-9007-46f0-b763-0099bc3baa78', '65e0adfd-99d0-46a7-932e-8d80aa13878a',
  '5952418b-ffc7-448d-aca5-265580b8f76a', 'c54ef4cf-e2c3-46c6-bacd-a6c14eb4195b',
  'f2926974-1ae7-4eeb-8c63-6b9fe16565c6', '6e853e31-226f-461c-80d7-66204e90187d',
  '240199e3-e6d0-4311-8b11-7564c0f346cd', '367081c9-eaeb-42b7-9ac4-be49e4366221',
  '505f2330-a334-4876-bf69-c3b0df90cea8', '90e73636-d79c-48fb-8b06-51101534dbdc',
  'a95c8daa-8881-4242-94b6-b3d7fc4d0372', '2f07d8d0-5d5a-4d7d-8fa9-797c090bcd8c',
  '028192cc-8f9f-4d8b-8f8c-9c5f1c2de45a', '288addf6-ebf8-444f-9585-27ebc909c7eb',
  '643c0cae-683e-440b-adca-6c100e28fb4b', '989fd3b4-81c1-4d4c-b00f-1c4557ef5385',
  '6d8c6236-8057-42d1-868a-c1c7c3057f13', '6559b31e-e070-4b38-b82d-2490c56ce53f',
  '83230519-2c9c-4cdf-9ae3-602946b73f73', '392ba4d9-e7c8-40cc-b6f6-2444f0192e3b'
);
