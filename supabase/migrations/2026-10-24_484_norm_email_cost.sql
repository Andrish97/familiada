-- 484: _norm_email jest tania (lower + btrim), ale przez SET search_path nie
-- jest wstawiana w zapytanie i dostawała domyślny koszt 100 -- tyle co
-- _poll_identity_regular. Planner sprawdzał więc drogą tożsamość konta dla
-- każdego wiersza auth.users zamiast najpierw odsiać po adresie. Skutek:
-- _poll_registered_uid przechodziło całą tabelę kont z drogim warunkiem,
-- a friends_invite po e-mailu (kilka takich wyszukań) trwało ok. 7 s na
-- produkcji (e2e friends.spec: wiersz zaproszenia nie pojawiał się w 5 s).
-- Zmiana tylko planu zapytań, bez zmiany wyniku. Lokalnie, 1200 kont:
-- wyszukanie 96 -> 5 ms, friends_invite po e-mailu 633 -> 53 ms.
alter function public._norm_email(text) cost 1;
