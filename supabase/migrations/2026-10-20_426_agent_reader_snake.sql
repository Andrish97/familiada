-- 426: odczyt tabel ukrytej gry w węża dla roli agent_reader (414) -- liczby
-- do diagnozy (czy zdarzenia zalogowanych mają konto, wykluczenia). Bez
-- danych osobowych: visitor to losowy identyfikator przeglądarki.
GRANT SELECT ON public.snake_events, public.snake_progress TO agent_reader;
