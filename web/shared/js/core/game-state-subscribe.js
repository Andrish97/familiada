// js/core/game-state-subscribe.js
// Odczyt stanu gry dla urządzeń v2 (Display/Host/Buzzer) — WYŁĄCZNIE przez
// game_state_get (RPC, SECURITY DEFINER, sprawdza share_key wewnątrz
// siebie), nigdy przez bezpośredni SELECT ani postgres_changes (świadomie
// zablokowane dla anon, patrz plan sekcja 1 — decyzja końcowa, nie
// tymczasowy fallback). Wspólne dla display/host/buzzer — parametryzowane
// przez deviceType, żeby nie duplikować identycznej logiki trzy razy.
//
// Mechanizm: (1) bootstrap — jedno wywołanie RPC przy starcie strony;
// (2) "dzwonek" — Control po każdym zapisie wysyła malutki, nieautorytatywny
// broadcast {rev} (control/js/store.js's ringDoorbell()) na kanale
// `familiada-state:<gameId>`, reużywając już sprawdzony js/core/realtime.js
// bez żadnej zmiany. Na każdy dzwonek z rev > ostatnio znanym — ponowne
// wywołanie tego samego RPC. Zgubiony dzwonek nie jest problemem: kolejna
// prawdziwa zmiana (wyższy rev) i tak dogoni stan; jedyny scenariusz "utknął
// na starym stanie na zawsze" to brak JAKIEJKOLWIEK kolejnej zmiany w grze,
// co i tak nie ma znaczenia (nic nowego do pokazania).

import { sb } from "./supabase.js?v=v2026-10-09T19310";
import { rt } from "./realtime.js?v=v2026-10-09T19310";
import { doorbellTopic } from "./game-state-doorbell.js?v=v2026-10-09T19310";
import { createRowSync } from "./game-state-sync.js?v=v2026-10-09T19310";

export function createSubscription({ gameId, deviceType, key, onRow, onError, onBroadcast = {}, pollMs = 5000, sameRevChanged = null }) {
  // Limit czasu: zawieszone żądanie trzymało `fetching` na zawsze i wszystkie
  // kolejne dzwonki tylko zaznaczały pendingRefetch (urządzenie zostawało na
  // starym stanie). Szczegóły: game-state-sync.js.
  const sync = createRowSync({
    fetchRow: () => sb().rpc("game_state_get", {
      p_game_id: gameId,
      p_device_type: deviceType,
      p_key: key,
    }).abortSignal(AbortSignal.timeout(8000)),
    // await onRow: control/display/js/render.js's renderSnapshot()/renderDiff() mają
    // realne animacje trwające setki ms-kilka s — kolejny odczyt nie może się
    // z nimi nakładać (dwa renderDiff() na tym samym płótnie SVG, podwójny
    // dźwięk przy odsłanianiu). Dla urządzeń bez animacji (buzzer, host)
    // onRow zwraca od razu.
    onRow,
    onError,
    sameRevChanged,
  });
  const fetchGuarded = sync.fetchGuarded;

  function subscribeDoorbell() {
    const channel = rt(doorbellTopic(gameId));
    channel.onBroadcast("rev", (msg) => {
      const rev = msg?.payload?.rev;
      if (typeof rev === "number" && rev > sync.lastRev) fetchGuarded();
    });
    for (const [event, handler] of Object.entries(onBroadcast)) {
      if (typeof handler === "function") channel.onBroadcast(event, handler);
    }
  }

  async function start() {
    await fetchGuarded();
    subscribeDoorbell();
    // Dzwonek wysłany między bootstrapem a dołączeniem do kanału przepada
    // (broadcast nie ma historii), a bez kolejnego zapisu urządzenie zostałoby
    // na starym stanie. Po SUBSCRIBED dociągnij stan jeszcze raz (tani no-op,
    // gdy rev się nie zmienił).
    rt(doorbellTopic(gameId)).whenReady().then((ok) => { if (ok) fetchGuarded(); }).catch(() => {});

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

    // Siatka bezpieczeństwa na zgubiony dzwonek (patrz game-state-sync.js):
    // tani odczyt, który i tak jest no-opem, gdy rev się nie zmienił.
    if (pollMs > 0) setInterval(() => { fetchGuarded(); }, pollMs);
  }

  // Dla Buzzera: game_state_buzzer_press zwraca już świeży wiersz w tej
  // samej odpowiedzi RPC, więc nie ma sensu czekać na własny dzwonek, żeby
  // zobaczyć efekt własnego kliknięcia — ale trzeba to nakarmić do tego
  // samego licznika lastRev, żeby późniejszy (spóźniony) dzwonek z niższym
  // rev nie próbował go nadpisać wstecz.
  const applyRow = sync.applyRow;

  // Wywoływane wprost po błędzie already_pressed z game_state_buzzer_press —
  // ktoś inny właśnie wygrał, więc autorytatywny wiersz już to pokazuje;
  // nie czekamy na własny dzwonek, tylko dociągamy od razu.
  function refetchNow() { return fetchGuarded(); }

  return { start, applyRow, refetchNow };
}
