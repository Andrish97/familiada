// js/core/game-state-subscribe.js
// Odczyt stanu gry dla urządzeń v2 (Display/Host/Buzzer) — WYŁĄCZNIE przez
// game_state_get (RPC, SECURITY DEFINER, sprawdza share_key wewnątrz
// siebie), nigdy przez bezpośredni SELECT ani postgres_changes (świadomie
// zablokowane dla anon, patrz plan sekcja 1 — decyzja końcowa, nie
// tymczasowy fallback). Wspólne dla display2/host2/buzzer2 — parametryzowane
// przez deviceType, żeby nie duplikować identycznej logiki trzy razy.
//
// Mechanizm: (1) bootstrap — jedno wywołanie RPC przy starcie strony;
// (2) "dzwonek" — Control po każdym zapisie wysyła malutki, nieautorytatywny
// broadcast {rev} (control2/js/store.js's ringDoorbell()) na kanale
// `familiada-state:<gameId>`, reużywając już sprawdzony js/core/realtime.js
// bez żadnej zmiany. Na każdy dzwonek z rev > ostatnio znanym — ponowne
// wywołanie tego samego RPC. Zgubiony dzwonek nie jest problemem: kolejna
// prawdziwa zmiana (wyższy rev) i tak dogoni stan; jedyny scenariusz "utknął
// na starym stanie na zawsze" to brak JAKIEJKOLWIEK kolejnej zmiany w grze,
// co i tak nie ma znaczenia (nic nowego do pokazania).

import { sb } from "./supabase.js?v=v2026-09-24T09195";
import { rt } from "./realtime.js?v=v2026-09-24T09195";
import { doorbellTopic } from "./game-state-doorbell.js?v=v2026-09-24T09195";

export function createSubscription({ gameId, deviceType, key, onRow, onError }) {
  let lastRev = -1;
  let fetching = false;
  let pendingRefetch = false;

  async function fetchOnce() {
    const { data, error } = await sb().rpc("game_state_get", {
      p_game_id: gameId,
      p_device_type: deviceType,
      p_key: key,
    });
    if (error) { onError?.(error); return; }
    if (!data) return; // Control jeszcze nigdy nic nie zapisał dla tej gry
    if (data.rev <= lastRev) return; // dzwonek spóźniony/zdublowany — nic nowego
    lastRev = data.rev;
    // await: display2/js/render.js's renderSnapshot()/renderDiff() mają
    // realne animacje trwające setki ms-kilka s (matrix down/right, ANIMOUT
    // przed ANIMIN...) — bez tego await, `fetching` niżej wracał do false
    // (i fetchGuarded() wpuszczał KOLEJNY dzwonek) ZANIM poprzedni render w
    // ogóle skończył malować, więc dwa renderDiff() na tym samym płótnie SVG
    // potrafiły się realnie nałożyć (zgłoszone: "lagi", "podwójny dźwięk
    // przy odsłanianiu" — dwa nakładające się przebiegi renderDiff() to też
    // dwa nakładające się wywołania soundReactor.js's handleTransition() dla
    // RÓŻNYCH par prevRow/nextRow, więc ten sam SOUND_CUE mógł się odtworzyć
    // z dwóch niezależnych, częściowo równoległych przebiegów). Dla
    // urządzeń bez realnych animacji (buzzer2, host2) onRow zwraca
    // undefined/rozwiązaną obietnicę — await na tym jest zerowym kosztem.
    await onRow(data);
  }

  async function fetchGuarded() {
    if (fetching) { pendingRefetch = true; return; }
    fetching = true;
    try {
      await fetchOnce();
    } finally {
      fetching = false;
      if (pendingRefetch) { pendingRefetch = false; fetchGuarded(); }
    }
  }

  function subscribeDoorbell() {
    rt(doorbellTopic(gameId)).onBroadcast("rev", (msg) => {
      const rev = msg?.payload?.rev;
      if (typeof rev === "number" && rev > lastRev) fetchGuarded();
    });
  }

  async function start() {
    await fetchGuarded();
    subscribeDoorbell();

    // Karta w tle (np. Wyświetlacz na monitorze/TV, nie w foreground; albo
    // ekran urządzenia zgaszony) — przeglądarka potrafi po cichu ubić/zamrozić
    // ten WebSocket bez żadnego widocznego błędu po stronie klienta (zwłaszcza
    // po dłuższej nieaktywności). Nic wtedy nie budzi kanału z powrotem — nie
    // ma żadnego heartbeatu ani reconnecta w tym pliku — więc dzwonek milknie
    // NA ZAWSZE, dopóki ktoś ręcznie nie przeładuje strony (zgłoszone: "Display
    // nie pokazuje rund, odświeża dopiero po przeładowaniu, jeśli był w tle").
    // Gdy karta wraca na pierwszy plan / urządzenie znów ma sieć: dociągnij
    // stan OD RAZU (na wypadek zgubionego dzwonka w trakcie przerwy) i
    // bezwarunkowo zbuduj kanał na nowo — nie polegamy na status'ie kanału
    // (po zamrożeniu JS-u status wciąż pokazuje ostatnią znaną, "zdrową"
    // wartość, bo nic nie miało szansy jej zaktualizować w tle).
    const resync = () => {
      fetchGuarded();
      rt(doorbellTopic(gameId)).reset();
      subscribeDoorbell();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resync();
    });
    window.addEventListener("pageshow", resync);
    window.addEventListener("online", resync);
  }

  // Dla Buzzera: game_state_buzzer_press zwraca już świeży wiersz w tej
  // samej odpowiedzi RPC, więc nie ma sensu czekać na własny dzwonek, żeby
  // zobaczyć efekt własnego kliknięcia — ale trzeba to nakarmić do tego
  // samego licznika lastRev, żeby późniejszy (spóźniony) dzwonek z niższym
  // rev nie próbował go nadpisać wstecz.
  function applyRow(row) {
    if (!row || row.rev <= lastRev) return;
    lastRev = row.rev;
    onRow(row);
  }

  // Wywoływane wprost po błędzie already_pressed z game_state_buzzer_press —
  // ktoś inny właśnie wygrał, więc autorytatywny wiersz już to pokazuje;
  // nie czekamy na własny dzwonek, tylko dociągamy od razu.
  function refetchNow() { return fetchGuarded(); }

  return { start, applyRow, refetchNow };
}
