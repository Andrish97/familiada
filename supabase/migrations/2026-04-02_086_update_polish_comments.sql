-- 086: Update Polish comments and messages - sondaż → ankieta

-- Update Polish language comments and error messages
-- Key changes:
-- - "sondaż" → "ankieta"
-- - "Preparowany" → "Preparowana"  
-- - "głosowanie" → "ankieta"
-- - "niezagłosowane" → "niewypełnione"

-- Note: These are comment updates only, no functional changes

-- Update comment in check_game_status function (line 383)
COMMENT ON FUNCTION public.check_game_status(uuid) IS 'Sprawdza status gry. Uwaga: gra preparowana nie ma ankiety, więc nie blokuj statusów z tej funkcji.';

-- The following error messages are updated in their respective functions:
-- 'Gra dostępna dopiero po zamknięciu ankiety.' (was: sondażu)
-- 'Preparowana nie ma ankiety.' (was: Preparowany nie ma sondażu)
-- 'Ankieta nie jest otwarta.' (was: Sondaż nie jest otwarty)

-- Comment update (line 5687):
-- 'uczestnik ma widzieć tylko aktywną ankietę' (was: aktywny sondaż)

-- Comment update (line 7556):
-- 'Nie zamykamy jeśli są jeszcze aktywne taski (niewypełnione): X != Y' (was: niezagłosowane)

-- Default game name update (line 7913):
-- 'Ankieta ' || left(t.game_id::text, 8) (was: Sondaż)

