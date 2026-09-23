// control2/js/store.js
// Ten sam kształt co dzisiejszy control/js/store.js (state + emit()/
// subscribe()), ale hydrate() NAPRAWDĘ wznawia stan z public.game_state
// zamiast bezwarunkowo go kasować (control/js/store.js:338-343 — "Stan gry
// nie jest przywracany między sesjami"). To jest dokładnie ta luka, którą
// cała przebudowa ma zamknąć.
//
// Obecność urządzeń (kto jest online) celowo NIE wchodzi do tego stanu —
// zostaje w public.device_presence (osobny, częsty polling), reużyty bez
// zmian przez control2/js/presence.js. Ten store trzyma wyłącznie to, co
// jest decyzją/faktem o samej grze (plan, sekcja 2 "0.").
//
// gameRounds.js/gameFinal.js NIE importują tego pliku — dostają store przez
// wstrzyknięcie zależności (ten sam wzorzec co dzisiejsze createRounds/
// createFinal), więc dają się testować w gołym Node z atrapą store.

import { sb } from "../../js/core/supabase.js?v=v2026-09-23T19413";
import { ringDoorbell } from "../../js/core/game-state-doorbell.js?v=v2026-09-23T19413";
import { createPersist, StaleWriteError } from "./persist.js?v=v2026-09-23T19413";
import { makeDefaultState, DEFAULT_SETTINGS, PERSISTED_KEYS } from "../../shared/gameStateShape.js?v=v2026-09-23T19413";
import { expiredTimerOnHydrate } from "./timerResume.js?v=v2026-09-23T19413";

// Kanał broadcastowy "dzwonek" (plan, sekcja 1 — decyzja końcowa: anon nie
// ma bezpośredniego dostępu do odczytu game_state wcale, więc postgres_changes
// nigdy nie zadziała dla Display/Host/Buzzer, i to jest świadome, nie
// fallback). Niesie WYŁĄCZNIE {rev} — nieautorytatywne, samo w sobie nic nie
// znaczy poza "coś się zmieniło, dogoń przez game_state_get". Nazwa kanału +
// wysyłka wydzielone do js/core/game-state-doorbell.js, bo dzwonić musi
// KAŻDY zapis do game_state, nie tylko te stąd — patrz buzzer2/js/main.js
// (game_state_buzzer_press idzie z pominięciem tego store).

export { StaleWriteError, makeDefaultState, DEFAULT_SETTINGS };

function buildDetail(state) {
  const detail = {};
  for (const key of PERSISTED_KEYS) detail[key] = state[key];
  return detail;
}

export { expiredTimerOnHydrate };

export function createStore(gameId) {
  const listeners = new Set();
  const state = makeDefaultState(gameId);
  const persist = createPersist(gameId);

  function emit() {
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function applyRow(row) {
    if (!row) return;
    // Surowy wiersz z bazy (rev/step/phase/... w snake_case), obok stanu
    // camelCase powyżej — soundReactor.js diffuje TO pole przez
    // shared/deriveEvents.js (które oczekuje kształtu wiersza game_state,
    // nie zrzutowanego camelCase stanu). Prywatne, nie część PERSISTED_KEYS.
    state.__row = row;
    state.rev = row.rev ?? 0;
    state.topCard = row.top_card;
    state.step = row.step;
    state.phase = row.phase ?? null;
    state.controlTeam = row.control_team ?? null;
    state.soundCueKey = row.sound_cue_key ?? null;
    state.soundCueSeq = row.sound_cue_seq ?? 0;

    const d = row.detail || {};
    for (const key of PERSISTED_KEYS) {
      if (d[key] !== undefined) state[key] = d[key];
    }
  }

  // ---- prawdziwe wznowienie ----
  async function hydrate() {
    const { data, error } = await sb()
      .from("game_state")
      .select("*")
      .eq("game_id", gameId)
      .maybeSingle();
    if (error) {
      console.warn("[store] hydrate: nie udało się odczytać game_state", error);
      return null;
    }
    if (!data) return null; // nowa gra, Control jeszcze nigdy nic nie zapisał
    applyRow(data);
    emit();
    return expiredTimerOnHydrate(state);
  }

  // Zserializowane — engine.js's dispatch() serializuje WŁASNE wywołania, ale
  // to nie jedyny wywołujący commit(): app.js's proste ustawienia (checkboxy
  // "Bez tabletu prowadzącego"/"Fizyczny przycisk", QR na Wyświetlaczu,
  // wyciszenie...) wołają store.commit() WPROST, z pominięciem tej kolejki —
  // zgłoszony na żywo dowód (szybkie odznaczanie/zaznaczanie checkboxa
  // urządzeń): "Błąd: stale_write" wyskakujący operatorowi jako goły alert.
  // Dwa (albo więcej) commit() wystrzelone bez odczekania na siebie ścigają
  // się o ten sam `rev` — retry-po-stale_write niżej jest tylko JEDNORAZOWY,
  // więc trzeci nakładający się zapis i tak by przegrał. Kolejka tutaj (ten
  // sam wzorzec co engine.js's dispatch()) gwarantuje, że KAŻDY zapis do
  // game_state — z dowolnego miejsca w appce, nie tylko z silnika reguł gry —
  // w pełni się kończy, zanim zacznie się następny, więc dwa commit() nigdy
  // nie widzą tego samego `rev` naraz.
  //
  // Payload budowany TU, SYNCHRONICZNIE, od razu przy wywołaniu commit() —
  // NIE leniwie dopiero w commitNow() (które czeka w kolejce, czasem setki
  // ms). Bez tego dwa commit() wystrzelone blisko siebie z RÓŻNYCH źródeł
  // (np. dwa checkboxy urządzeń, dwa suwaki głośności, "Losuj ponownie" dla
  // rund i finału) mogły złapać się nawzajem w locie: payload budowany
  // leniwie, dopiero gdy przyszła kolej w kolejce, czytał state.settings/
  // rounds/final PO TYM, jak applyRow() z WCZEŚNIEJSZEGO, już potwierdzonego
  // zapisu zdążyło nadpisać state TYMI SAMYMI polami z serwera (które go
  // jeszcze nie znały) — co bezpowrotnie kasowało nowszą, jeszcze
  // niewysłaną lokalną zmianę, zanim ten drugi zapis w ogóle zdążył ją
  // wysłać. Zgłoszone na żywo (control2.spec.js's test "physicalBuzzer +
  // noHostTablet"): oba checkboxy zaznaczone szybko po sobie, druga flaga
  // nigdy nie docierała do bazy — bez żadnego błędu, wyglądało jak "nic się
  // nie odświeża". `detail` musi być PRAWDZIWĄ, głęboką kopią
  // (structuredClone) — PERSISTED_KEYS to zagnieżdżone obiekty (settings/
  // rounds/final/...), płytkie przypisanie (buildDetail sam w sobie) dzieli
  // te same referencje z `state`, więc późniejsza mutacja i tak przeciekałaby
  // do już "zbudowanego" payloadu, unieważniając cały ten fix.
  let _writeQueue = Promise.resolve();
  function commit({ soundCueKey } = {}) {
    const payload = {
      step: state.step,
      topCard: state.topCard,
      phase: state.phase,
      controlTeam: state.controlTeam,
      soundCueKey: soundCueKey ?? null,
      detail: structuredClone(buildDetail(state)),
    };
    const run = () => commitNow(payload);
    const result = _writeQueue.then(run, run);
    _writeQueue = result.catch(() => {});
    return result;
  }

  // ---- zapis: pełny wiersz, synchronicznie potwierdzony (plan, sekcja 4) ----
  // payload: zbudowany i zamrożony PRZEZ commit() wyżej, synchronicznie, w
  // momencie wywołania -- nie tutaj (patrz komentarz przy commit()).
  async function commitNow(payload) {
    // Dźwięk (soundReactor.js) i "dzwonek" budzący Wyświetlacz siedziały
    // dotąd za TYM SAMYM emit() — dopiero po pełnym network round-tripie
    // niżej. Dzwonek zostaje tam (Wyświetlacz i tak musi doczytać
    // POTWIERDZONY wiersz przez RPC, wcześniejszy dzwonek byłby pusty),
    // ale dźwięk grał zauważalnie później niż plansza na Wyświetlaczu —
    // zgłoszone, zaakceptowane świadomie jako kompromis: rozgłoś OD RAZU
    // (emit() niżej, PRZED await) optymistyczny wiersz zbudowany z już
    // zmutowanego lokalnie stanu (reducer w engine.js's dispatchNow()
    // ustawia store.state.step/phase/... PRZED wywołaniem commit() —
    // "optymistyczny" znaczy tu wyłącznie "jeszcze niepotwierdzony przez
    // serwer", nie "zgadywany"). sound_cue_seq liczony 1:1 wg tej samej
    // reguły co SQL (game_state_write, migracja 263: rośnie przy KAŻDYM
    // zapisie z niepustym soundCueKey, NIE tylko gdy klucz różni się od
    // poprzedniego — dwa różne zdarzenia w grze, np. dwa trafienia z rzędu,
    // często dzielą ten sam klucz "answer_correct"/"answer_wrong", a mimo to
    // każde z nich ma zagrać dźwięk osobno; migracja 260 tego nie robiła,
    // co gubiło dźwięk przy drugim z pary — patrz komentarz w migracji 263)
    // — więc druga, prawdziwa notyfikacja po potwierdzeniu zwykle nie
    // znajdzie już nic nowego (ten sam seq) i nie zagra drugi raz. W rzadkim
    // przegranym wyścigu z Buzzerem (StaleWriteError niżej) ten wiersz
    // zostanie skorygowany przez hydrate() — zaakceptowane ryzyko, nie błąd.
    const newKey = payload.soundCueKey;
    const optimisticKey = newKey ?? state.soundCueKey;
    const optimisticSeq = newKey != null ? (state.soundCueSeq || 0) + 1 : (state.soundCueSeq || 0);
    state.__row = {
      ...state.__row,
      top_card: payload.topCard,
      step: payload.step,
      phase: payload.phase,
      control_team: payload.controlTeam,
      sound_cue_key: optimisticKey,
      sound_cue_seq: optimisticSeq,
      detail: payload.detail,
    };
    state.soundCueKey = optimisticKey;
    state.soundCueSeq = optimisticSeq;
    emit();

    async function attempt() {
      const row = await persist.write({ ...payload, expectedRev: state.rev });
      applyRow(row);
      emit();
      ringDoorbell(gameId, row.rev);
      return row;
    }

    try {
      return await attempt();
    } catch (e) {
      if (!(e instanceof StaleWriteError)) throw e;
      // Warstwa 2 (docs/plan-testy-i-poprawki.md) zrobiła dokładnie to, co
      // powinna — ktoś inny zdążył podbić rev pierwszy, zanim nasz zapis
      // dotarł. Odkąd commit() (wyżej) serializuje WSZYSTKIE własne
      // wywołania niezależnie od tego, skąd przyszły, jedyny realny "ktoś
      // inny" to Buzzer (game_state_buzzer_press, zapis z pominięciem tego
      // store'a — patrz plan, sekcja 1/4). Zamiast twardego błędu operatorowi: doczytaj
      // świeży wiersz (hydrate aktualizuje state.rev, w tym wszystko inne co
      // się zmieniło) i spróbuj RAZ jeszcze DOKŁADNIE tę samą, zamierzoną
      // zmianę z nowym rev — dokładnie ten "bezpieczny retry" z planu,
      // wcześniej opisany ale nigdy nie zaimplementowany.
      await hydrate();
      return await attempt();
    }
  }

  // Migracja 264 — ustawia game_state.locked_until w bazie, PO
  // potwierdzeniu głównego zapisu (wołający liczy `ms` z POTWIERDZONEGO
  // sound_cue_key, dokładnie jak dziś dla klienckiego lockedUntil w
  // control2/js/app.js). Przez tę samą kolejkę co commit() — żeby nigdy
  // nie wyścigał się z kolejnym, prawdziwym zapisem treści.
  function setLock(ms) {
    const run = () => setLockNow(ms);
    const result = _writeQueue.then(run, run);
    _writeQueue = result.catch(() => {});
    return result;
  }

  async function setLockNow(ms) {
    try {
      // p_lock_ms jest w bazie typu integer -- realny czas dźwięku (z
      // metadanych pliku mp3, control2/js/actionGate.js's timing.dur())
      // przychodzi jako float z ułamkiem ms (np. 19751.995), co Postgres
      // odrzuca (22P02 invalid input syntax for type integer). Zaokrąglenie
      // o ~1ms nie ma znaczenia dla samej blokady.
      const row = await persist.setLock({ expectedRev: state.rev, lockMs: Math.round(ms) });
      applyRow(row);
      emit();
    } catch (e) {
      // Najlepszy wysiłek — treść stanu jest już poprawnie zapisana przez
      // wcześniejszy commit(), tylko serwerowa blokada się nie ustawiła
      // (np. rev już nieaktualny, bo coś innego zdążyło napisać pierwsze).
      // Klencki lockedUntil (control2/js/app.js) działa niezależnie, więc
      // to nie jest błąd, który operator musi widzieć jako alert.
      console.warn("[store] setLock nie powiodło się (nieszkodliwe):", e);
    }
  }

  // Migracja 267 — WYŁĄCZNIE detail.settings.uiLang, przez osobne, lekkie
  // RPC (persist.setUiLang), celowo NIE przez _writeQueue/commit(): język
  // operatora jest metadaną niezależną od reszty rozgrywki (zgłoszone: nie
  // ma czekać w kolejce na koniec dźwięku/animacji trwającej akcji gry —
  // w przeciwieństwie do commit()/setLock() ta funkcja świadomie omija
  // zarówno kolejkę, jak i serwerowy locked_until, patrz komentarz w
  // migracji i w persist.js).
  async function setUiLang(lang) {
    state.settings.uiLang = lang;
    emit();
    const row = await persist.setUiLang(lang);
    applyRow(row);
    emit();
    ringDoorbell(gameId, row.rev);
  }

  // Migracja 268 -- ten sam wzorzec co setUiLang() wyżej, dla
  // detail.settings.soundMuted (patrz komentarz w persist.js/migracji).
  async function setSoundMuted(muted) {
    state.settings.soundMuted = muted;
    emit();
    const row = await persist.setSoundMuted(muted);
    applyRow(row);
    emit();
    ringDoorbell(gameId, row.rev);
  }

  return { state, subscribe, emit, hydrate, commit, setLock, setUiLang, setSoundMuted, applyRow };
}
