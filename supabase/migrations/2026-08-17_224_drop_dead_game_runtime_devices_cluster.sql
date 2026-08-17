-- Czyszczenie porzuconej architektury "v2" (game_runtime / game_devices).
--
-- Tabele public.game_runtime i public.game_devices nigdy nie zostały
-- utworzone (brak CREATE TABLE w schema.sql/baseline), mimo że kilkanaście
-- funkcji się do nich odwołuje. Każde ich wywołanie kończyłoby się błędem
-- "relation does not exist". Zweryfikowano, że żadna z poniższych funkcji
-- nie jest wołana z klienta (grep po całym repo .js oraz supabase/functions),
-- więc usunięcie jest bezpieczne i niczego nie zmienia w działającej appce
-- (ta korzysta z public.device_state / public.device_presence + realtime,
-- co zostaje bez zmian).
--
-- public.device_kind NIE jest usuwany — jest nadal używany przez
-- public.device_state_set_admin(uuid, public.device_kind, jsonb),
-- która operuje na realnej tabeli public.device_state.

DROP FUNCTION IF EXISTS public.buzzer_press_v2(uuid, text, text);
DROP FUNCTION IF EXISTS public.control_set_devices_v2(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.control_set_runtime_v2(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.control_set_state(uuid, public.game_fsm_state, jsonb);
DROP FUNCTION IF EXISTS public.device_ping_v2(uuid, public.device_kind, text);
DROP FUNCTION IF EXISTS public.get_public_snapshot_v2(uuid, public.device_kind, text);
DROP FUNCTION IF EXISTS public.get_device_snapshot(uuid, text, text);
DROP FUNCTION IF EXISTS public.set_device_state(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.fsm_can_transition(public.game_fsm_state, public.game_fsm_state);
DROP FUNCTION IF EXISTS public.ensure_game_rows(uuid);
DROP FUNCTION IF EXISTS public.ensure_runtime_and_devices(uuid);
DROP FUNCTION IF EXISTS public.ensure_game_runtime(uuid);
DROP FUNCTION IF EXISTS public.touch_game_devices_updated_at();
DROP FUNCTION IF EXISTS public.touch_game_runtime_updated_at();

DROP TYPE IF EXISTS public.game_fsm_state;
DROP TYPE IF EXISTS public.buzzer_ui_state;
DROP TYPE IF EXISTS public.team_code;
DROP TYPE IF EXISTS public.display_app_mode;
DROP TYPE IF EXISTS public.display_scene_mode;
