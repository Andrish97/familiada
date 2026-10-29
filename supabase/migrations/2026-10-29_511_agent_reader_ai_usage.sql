-- 511: pomiar zużycia AI Lead Findera i Pytań (decyzja właściciela 2026-10-29).
-- agent_reader czyta tylko liczby (db-read odrzuca tekst): zużycie tokenów
-- i przyrost puli pytań na dzień.
GRANT SELECT ON public.producer_ai_usage, public.producer_question_pool, public.producer_question_jobs TO agent_reader;
