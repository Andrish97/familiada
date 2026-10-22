-- E25: usunięcie starych kont testowych test1…test17 (decyzja użytkownika
-- 2026-10-22: „usuń konta od razu”; reguły poczty testN@ usunięte w Cloudflare).
-- Każde konto usuwa delete_user_everything (te same dane i pliki co przy
-- zwykłym usunięciu konta); gry Społeczności tych kont usuwane wcześniej, żeby
-- nie zostały bez autora. Konta testowe e2e (e2e_identities) nie są ruszane.
DO $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT u.id FROM auth.users u
    WHERE lower(u.email) ~ '^test[0-9]+@familiada\.online$'
      AND NOT EXISTS (SELECT 1 FROM public.e2e_identities i WHERE i.user_id = u.id)
  LOOP
    DELETE FROM public.market_games WHERE author_user_id = r.id;
    PERFORM public.delete_user_everything(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE '463: usunięto % starych kont testowych', n;
END $$;
