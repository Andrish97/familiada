-- Control 2: sprzątanie po atomowym stanie urządzeń (migracja 397).
-- Odblokowanie dźwięku Wyświetlacza i obecność urządzeń jadą heartbeatem
-- lease (control_device_instance_heartbeat), a Control czyta je jednym
-- control_devices_snapshot. Stare ścieżki nie mają już klientów:
--  - nonce'y odblokowania (display_audio_unlock + trzy RPC),
--  - osobny ping obecności device_ping.

-- Funkcje, które czyściły tabelę display_audio_unlock, dostają tę samą
-- definicję bez tego DELETE (bierzemy aktualną z bazy, bez kopiowania ciała).
DO $$
DECLARE
  v_fn text;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.control_game_cancel_for_settings(uuid)',
    'public.control_runtime_expire_one(uuid)'
  ] LOOP
    v_def := pg_get_functiondef(v_fn::regprocedure);
    IF v_def !~ 'DELETE FROM public\.display_audio_unlock WHERE game_id ?= ?[a-z_.]+;' THEN
      RAISE EXCEPTION '% nie zawiera oczekiwanego DELETE display_audio_unlock', v_fn;
    END IF;
    EXECUTE regexp_replace(v_def,
      '\n[ \t]*DELETE FROM public\.display_audio_unlock WHERE game_id ?= ?[a-z_.]+;', '', 'g');
  END LOOP;
END;
$$;

DROP FUNCTION public.begin_display_audio_session(uuid, text, text, uuid, bigint);
DROP FUNCTION public.acknowledge_display_audio_unlock(uuid, text, text, uuid, bigint);
DROP FUNCTION public.request_display_audio_unlock(uuid, text);
DROP FUNCTION public.device_ping(uuid, public.device_type, text, text, jsonb);
DROP TABLE public.display_audio_unlock;

NOTIFY pgrst, 'reload schema';
