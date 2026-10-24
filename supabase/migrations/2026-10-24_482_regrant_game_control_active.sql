-- 482: cofnięcie części 481. _game_control_active woła też wyzwalacz
-- guard_game_content (SECURITY INVOKER, pytania/odpowiedzi zapisywane wprost
-- z przeglądarki) — bez EXECUTE dodanie pytania kończyło się
-- „permission denied for function _game_control_active”.
grant execute on function public._game_control_active(uuid) to anon, authenticated;
