-- 268: dedykowane, lekkie RPC do zmiany detail.settings.soundMuted --
-- celowo BEZ sprawdzania locked_until (migracja 264), dokładnie ten sam
-- wzorzec co migracja 267 (game_state_set_ui_lang).
--
-- Zgłoszone: e2e "dźwięk ze źródła Wyświetlacz" -- kliknięcie #btnMute w
-- środku rundy (tuż po odsłonięciu odpowiedzi, gdy locked_until z tej akcji
-- jeszcze trwa) kończyło się LockedError('locked') -> control2/js/app.js's
-- handle() pokazywał operatorowi goły window.alert("Błąd: locked"), a
-- przycisk wyciszenia zostawał bezużyteczny przez cały czas trwania blokady.
-- Wyciszenie dźwięku jest, tak jak język operatora, metadaną niezależną od
-- przebiegu rozgrywki (control2/js/app.js's komentarz przy
-- "settings.toggleSoundMuted": współdzielone celowo, żeby działało
-- niezależnie od tego, które urządzenie faktycznie gra dźwięk -- patrz
-- soundReactor.js) -- NIE POWINNO czekać w kolejce na koniec cudzego
-- dźwięku/animacji, a tym bardziej nie powinno dać się zablokować PRZEZ
-- WŁASNE odtwarzanie dźwięku, które operator akurat próbuje wyciszyć.
--
-- jsonb_set modyfikuje WYŁĄCZNIE detail.settings.soundMuted, nigdy nie
-- dotyka reszty `detail`, więc -- tak jak uiLang -- nie ma czego chronić
-- przed nadpisaniem: może bezpiecznie wyprzedzić albo wejść w sam środek
-- dowolnej innej, równoległej operacji na tym wierszu.

CREATE FUNCTION "public"."game_state_set_sound_muted"(
    "p_game_id" "uuid",
    "p_muted" boolean
) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_row public.game_state;
begin
  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_state
  set detail = jsonb_set(detail, '{settings,soundMuted}', to_jsonb(p_muted)),
      rev = rev + 1,
      updated_at = now()
  where game_id = p_game_id
  returning * into v_row;

  if not found then raise exception 'game_state not found'; end if;

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."game_state_set_sound_muted" IS 'Zmienia WYŁĄCZNIE detail.settings.soundMuted, przez jsonb_set (nie dotyka reszty detail) -- świadomie z pominięciem sprawdzania locked_until (migracja 264), bo wyciszenie dźwięku jest metadaną niezależną od trwającego dźwięku/animacji akcji gry, nie treścią wymagającą serializacji.';

NOTIFY pgrst, 'reload schema';
