-- Porządki po audycie E24 (B1, 2026-10-21): tabele bez użycia w kodzie,
-- funkcjach i widokach -- example_table (przykład z migracji 010) oraz
-- konta_do_stworzenia (jednorazowy import kont, kolumna z hasłami). Od 446
-- tylko service_role. Przed usunięciem liczba wierszy (same liczby) do logu
-- migracji.

DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.example_table') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.example_table' INTO n;
    RAISE NOTICE 'drop_unused_tables: example_table wierszy=%', n;
  ELSE
    RAISE NOTICE 'drop_unused_tables: example_table brak';
  END IF;
  IF to_regclass('public.konta_do_stworzenia') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.konta_do_stworzenia' INTO n;
    RAISE NOTICE 'drop_unused_tables: konta_do_stworzenia wierszy=%', n;
  ELSE
    RAISE NOTICE 'drop_unused_tables: konta_do_stworzenia brak';
  END IF;
END $$;

DROP TABLE IF EXISTS public.example_table;
DROP TABLE IF EXISTS public.konta_do_stworzenia;
