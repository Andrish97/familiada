-- E26 B2 (decyzja użytkownika 2026-10-23): naprawa danych E21 zakończona
-- (jeden przebieg 2026-10-21 01:30, zadanie cron samo się wyrejestrowało),
-- kopia szablonów sprzed poprawki niepotrzebna. Funkcje naprawy, ich pomocnicza
-- fam_clip_words (używana tylko przez e21_data_repair) i obie tabele znikają.
-- Granty dla agent_reader (414) znikają razem z obiektami.
-- Najwyżej 3 s czekania na blokadę tabel używanych przez graczy: inaczej
-- migracja wycofuje się w całości (bez zmian) i jest ponawiana później.
SET LOCAL lock_timeout = '3s';

DROP FUNCTION public.e21_data_repair();

DROP FUNCTION public.e21_demo_repair("uuid"[]);

DROP FUNCTION public.e21_demo_fixed_payload("text", "jsonb");

DROP FUNCTION public.e21_demo_game_content("uuid");

DROP FUNCTION public.e21_demo_template_content("jsonb");

DROP FUNCTION public.e21_demo_answer_map();

DROP FUNCTION public.fam_clip_words("text", integer);

DROP TABLE public.e21_demo_templates_before;
DROP TABLE public.e21_repair_runs;

DO $$
DECLARE v_job bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''e21-data-repair'' LIMIT 1' INTO v_job;
    IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
  END IF;
END $$;
