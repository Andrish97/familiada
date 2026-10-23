-- E25: zasób `mail` z 2 do 6 miejsc (decyzja użytkownika 2026-10-23: przepustowość
-- wystarcza, kolejka poczty rozkłada wysyłkę). Wypożyczanie wybiera po
-- purpose = 'mail', więc nowe wiersze działają bez zmian w kodzie.
INSERT INTO public.e2e_identities(name, role, purpose)
SELECT format('resource.mail%s', lpad(n::text, 2, '0')), 'resource', 'mail'
FROM generate_series(3, 6) n
ON CONFLICT (name) DO NOTHING;
