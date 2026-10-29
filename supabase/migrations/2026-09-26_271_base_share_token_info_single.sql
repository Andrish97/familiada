-- Migration 271: base_share_token_info -- jedna wersja zamiast dwóch
--
-- W bazie były dwie przeciążone funkcje: base_share_token_info(p_token text)
-- i base_share_token_info(p_token uuid), z identyczną nazwą parametru.
-- PostgREST (sb().rpc) nie potrafi wybrać między nimi i każde wywołanie
-- kończyło się błędem PGRST203 ("Could not choose the best candidate
-- function") -- więc sprawdzanie linku z maila (?share=<token>) na stronie
-- /bases nigdy nie działało (patrz e2e/bases.spec.js, audyt bases).
--
-- Zostaje wersja TEXT: porównuje t.token::text = p_token, więc niepoprawny
-- token (np. ucięty link) daje po prostu pusty wynik zamiast błędu rzutowania
-- na uuid. Jedynym wołającym jest js/pages/bases.js.

DROP FUNCTION IF EXISTS public.base_share_token_info(uuid);
