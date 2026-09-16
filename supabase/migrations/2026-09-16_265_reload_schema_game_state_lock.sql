-- 265: Wymuś reload schematu PostgREST po migracji 264.
--
-- Migracja 264 dodała `p_lock_ms` do game_state_write -- to zmienia listę
-- typów parametrów funkcji, więc Postgres traktuje ją jako NOWY, dodatkowy
-- przeciążony wariant (overload), a nie podmianę istniejącej. PostgREST
-- nie widział tego nowego wariantu, dopóki nie odświeży własnego cache'a
-- schematu (dokładnie ten sam mechanizm co migracje 118/120/121/122/123/
-- 172/173-176/203/204/208/210-213/222 w tym repo -- każda zmiana sygnatury
-- funkcji RPC wymaga jawnego NOTIFY, inaczej PostgREST dalej woła stary
-- wariant i zwraca PGRST202 "no matches were found in the schema cache").
--
-- Zaobserwowane na żywo w run #126 (control2.spec.js, 16/16 failed):
-- KAŻDE wywołanie /rpc/game_state_write kończyło się HTTP 404, z
-- podpowiedzią PostgREST wskazującą dokładnie na STARĄ (8-parametrową,
-- sprzed migracji 264) sygnaturę -- to jest właśnie ten objaw.

NOTIFY pgrst, 'reload schema';
