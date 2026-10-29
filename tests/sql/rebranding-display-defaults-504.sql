\set ON_ERROR_STOP 1
-- 504: domyślny wygląd (stare i nowe kolory, przypięty Klasyczny) i zastrzeżony prefiks.
BEGIN;
DO $$
BEGIN
 IF NOT public._display_is_default(NULL) OR NOT public._display_is_default('{}') THEN RAISE EXCEPTION 'empty_not_default'; END IF;
 IF NOT public._display_is_default('{"colors":{"A":"#FF8C1A","B":"#138A50","BACKGROUND":"#152238","DOT":"#D7FF3D"}}') THEN RAISE EXCEPTION 'new_defaults'; END IF;
 IF NOT public._display_is_default('{"theme":"classic","colors":{"A":"#c4002f","B":"#2a62ff","BACKGROUND":"#d21180","DOT":"#d7ff3d"}}') THEN RAISE EXCEPTION 'pinned_classic'; END IF;
 IF public._display_is_default('{"theme":"wings","colors":{"A":"#ff8c1a","B":"#138a50","BACKGROUND":"#152238","DOT":"#d7ff3d"}}') THEN RAISE EXCEPTION 'chosen_theme_is_custom'; END IF;
 IF public._display_is_default('{"colors":{"A":"#111111","B":"#138a50","BACKGROUND":"#152238","DOT":"#d7ff3d"}}') THEN RAISE EXCEPTION 'custom_color'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.reserved_username_prefixes WHERE prefix = 'familijna' AND kind = 'system') THEN RAISE EXCEPTION 'prefix'; END IF;
 IF has_function_privilege('authenticated', 'public._display_is_default(jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'helper_exposed'; END IF;
 RAISE NOTICE 'rebranding-display-defaults-504 OK';
END $$;
ROLLBACK;
