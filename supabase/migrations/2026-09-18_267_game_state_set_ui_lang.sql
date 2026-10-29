-- 267: dedykowane, lekkie RPC do zmiany detail.settings.uiLang --
-- celowo BEZ sprawdzania locked_until (migracja 264).
--
-- Zgłoszone: e2e "zmiana języka w Control propaguje się do Hosta" gubiła
-- zmianę w 100% deterministyczny sposób, gdy operator przełączał język tuż
-- po akcji gry (np. "Rozpocznij rundę") -- game_state_write odrzucał zapis
-- wyjątkiem 'locked', dopóki trwało okno locked_until ustawione dla
-- dźwięku/animacji TEJ akcji. Poprzednia łatka (control2/js/app.js: czekaj
-- na busy(), złap LockedError, spróbuj ponownie) naprawiała objaw, ale nie
-- przyczynę -- właściciel projektu słusznie zauważył, że język operatora
-- jest metadaną niezależną od przebiegu rozgrywki i NIE POWINIEN w ogóle
-- czekać w kolejce na koniec cudzego dźwięku/animacji.
--
-- locked_until (patrz komentarz w migracji 264) ma chronić TREŚĆ gry --
-- game_state_write nadpisuje CAŁY wiersz `detail` naraz z pełnego,
-- lokalnego snapshotu klienta (control2/js/store.js's commit()), więc musi
-- być serializowany względem trwającego dźwięku/animacji poprzedniego
-- przejścia. Ta funkcja tego problemu nie ma -- jsonb_set modyfikuje
-- WYŁĄCZNIE detail.settings.uiLang, nigdy nie dotyka reszty `detail`, więc
-- nie ma czego chronić przed nadpisaniem: może bezpiecznie wyprzedzić albo
-- wejść w sam środek dowolnej innej, równoległej operacji na tym wierszu.

CREATE FUNCTION "public"."game_state_set_ui_lang"(
    "p_game_id" "uuid",
    "p_ui_lang" "text"
) RETURNS "public"."game_state"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
  v_row public.game_state;
begin
  if p_ui_lang not in ('pl', 'en', 'uk') then
    raise exception 'invalid_lang';
  end if;

  select owner_id into v_owner from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.game_state
  set detail = jsonb_set(detail, '{settings,uiLang}', to_jsonb(p_ui_lang)),
      rev = rev + 1,
      updated_at = now()
  where game_id = p_game_id
  returning * into v_row;

  if not found then raise exception 'game_state not found'; end if;

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."game_state_set_ui_lang" IS 'Zmienia WYŁĄCZNIE detail.settings.uiLang, przez jsonb_set (nie dotyka reszty detail) -- świadomie z pominięciem sprawdzania locked_until (migracja 264), bo język operatora jest metadaną niezależną od trwającego dźwięku/animacji akcji gry, nie treścią wymagającą serializacji.';

NOTIFY pgrst, 'reload schema';
