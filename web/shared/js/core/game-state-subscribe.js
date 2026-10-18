// js/core/game-state-subscribe.js
// Devices use a short-lived, lease-scoped JWT for direct postgres_changes.
// Realtime rows are applied directly; RPC bootstrap, Broadcast and polling
// recover missed events whenever the direct channel is unavailable.
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

import { sb, SUPABASE_ANON_KEY } from "./supabase.js?v=v2026-10-18T07140";
import { rt } from "./realtime.js?v=v2026-10-18T07140";
import { doorbellTopic } from "./game-state-doorbell.js?v=v2026-10-18T07140";
import { createRowSync } from "./game-state-sync.js?v=v2026-10-18T07140";

export function createSubscription({ gameId, deviceType, key, onRow, onError, onBroadcast = {}, onDirectTables = {}, pollMs = 5000, sameRevChanged = null, getLeaseArgs = () => ({}) }) {
  let active = false;
  let pollTimer = null;
  let directChannel = null;
  let directConnected = false;
  const directTableChannels = new Map();
  const directTableConnected = new Map();
  let tokenTimer = null;
  let directUnavailableLogged = false;
  // Limit czasu: zawieszone żądanie trzymało `fetching` na zawsze i wszystkie
  // kolejne dzwonki tylko zaznaczały pendingRefetch (urządzenie zostawało na
  // starym stanie). Szczegóły: game-state-sync.js.
  const sync = createRowSync({
    fetchRow: () => sb().rpc("game_state_get", {
      p_game_id: gameId,
      p_device_type: deviceType,
      p_key: key,
      ...getLeaseArgs(),
    }).abortSignal(AbortSignal.timeout(8000)),
    // await onRow: control/display/js/render.js's renderSnapshot()/renderDiff() mają
    // realne animacje trwające setki ms-kilka s — kolejny odczyt nie może się
    // z nimi nakładać (dwa renderDiff() na tym samym płótnie SVG, podwójny
    // dźwięk przy odsłanianiu). Dla urządzeń bez animacji (buzzer, host)
    // onRow zwraca od razu.
    onRow: (...args) => { if (active) return onRow?.(...args); },
    onError: (...args) => { if (active) return onError?.(...args); },
    sameRevChanged,
  });
  const fetchGuarded = sync.fetchGuarded;

  function subscribeDoorbell() {
    const channel = rt(doorbellTopic(gameId));
    channel.onBroadcast("rev", (msg) => {
      const rev = msg?.payload?.rev;
      if (!directConnected && typeof rev === "number" && rev > sync.lastRev) fetchGuarded();
    });
    for (const [event, handler] of Object.entries(onBroadcast)) {
      if (typeof handler === "function") channel.onBroadcast(event, handler);
    }
  }

  async function startDirect() {
    if (!active) return;
    const lease = getLeaseArgs();
    if (!lease?.p_connection_id || !lease?.p_epoch) return;
    try {
      const { data, error } = await sb().functions.invoke("device-realtime-token", {
        body: { game_id: gameId, device_type: deviceType, key,
          connection_id: lease.p_connection_id, epoch: lease.p_epoch },
      });
      if (error || !data?.token || !active) throw error || new Error("Brak tokenu Realtime");
      await sb().realtime.setAuth(data.token);
      if (!active) { try { await sb().realtime.setAuth(SUPABASE_ANON_KEY); } catch {} return; }
      directUnavailableLogged = false;
      if (directChannel) await sb().removeChannel(directChannel);
      for (const channel of directTableChannels.values()) await sb().removeChannel(channel).catch(() => {});
      directTableChannels.clear();
      directTableConnected.clear();
      directChannel = sb().channel(`game-state-direct:${gameId}:${deviceType}:${lease.p_connection_id}`);
      directChannel.on("postgres_changes", {
        event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${gameId}`,
      }, (payload) => {
        const row = payload?.new;
        const rev = Number(row?.rev);
        if (row && Number.isFinite(rev)) sync.applyRow({ ...row, rev });
        else if (payload?.eventType === "DELETE") fetchGuarded();
      }).subscribe((status) => {
        if (status === "SUBSCRIBED" && active) {
          directConnected = true;
          // Close the bootstrap/subscription race, then let direct row events
          // carry subsequent state without an additional RPC per event.
          fetchGuarded();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          directConnected = false;
          if (active) fetchGuarded();
          console.warn(`[device-realtime] ${status}; działa transport awaryjny`);
        }
      });
      for (const [table, handler] of Object.entries(onDirectTables)) {
        if (typeof handler !== "function" || !/^[a-z_]+$/.test(table)) continue;
        const channel = sb().channel(`game-state-direct:${gameId}:${deviceType}:${lease.p_connection_id}:${table}`);
        directTableChannels.set(table, channel);
        channel.on("postgres_changes", {
          event: "*", schema: "public", table, filter: `game_id=eq.${gameId}`,
        }, (payload) => handler({ status: "CHANGE", payload }));
        channel.subscribe((status) => {
          directTableConnected.set(table, status === "SUBSCRIBED");
          handler({ status, payload: null });
        });
      }
      clearTimeout(tokenTimer);
      tokenTimer = setTimeout(() => { if (active) void startDirect(); }, 240_000);
    } catch (error) {
      // No token/config or temporary Realtime failure: RPC + doorbell + poll
      // remain active, so the current transport continues to work.
      if (active) {
        if (!directUnavailableLogged) {
          console.info("[device-realtime] bezpośredni kanał niedostępny; działa transport awaryjny", error);
          directUnavailableLogged = true;
        }
        clearTimeout(tokenTimer);
        tokenTimer = setTimeout(() => { if (active) void startDirect(); }, 15_000);
      }
    }
  }

  async function stopDirect() {
    directConnected = false;
    clearTimeout(tokenTimer);
    tokenTimer = null;
    if (directChannel) {
      const channel = directChannel;
      directChannel = null;
      await sb().removeChannel(channel).catch(() => {});
    }
    for (const [table, channel] of directTableChannels) {
      directTableConnected.set(table, false);
      await sb().removeChannel(channel).catch(() => {});
    }
    directTableChannels.clear();
    try { await sb().realtime.setAuth(SUPABASE_ANON_KEY); } catch {}
  }

  function resync() {
    if (!active) return;
    fetchGuarded();
    rt(doorbellTopic(gameId)).reset();
    subscribeDoorbell();
    void stopDirect().finally(() => { if (active) void startDirect(); });
  }

  async function start() {
    if (active) return;
    active = true;
    sync.reset();
    await fetchGuarded();
    if (!active) return;
    subscribeDoorbell();
    void startDirect();
    // Dzwonek wysłany między bootstrapem a dołączeniem do kanału przepada
    // (broadcast nie ma historii), a bez kolejnego zapisu urządzenie zostałoby
    // na starym stanie. Po SUBSCRIBED dociągnij stan jeszcze raz (tani no-op,
    // gdy rev się nie zmienił).
    rt(doorbellTopic(gameId)).whenReady().then((ok) => { if (ok) fetchGuarded(); }).catch(() => {});

    // Karta mogła zostać zamrożona przez przeglądarkę. Po powrocie na ekran
    // odbuduj kanał i pobierz stan, bo sam status WebSocketu może być nieaktualny.
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", resync);
    window.addEventListener("online", resync);
    // Siatka bezpieczeństwa na zgubiony dzwonek.
    if (pollMs > 0) pollTimer = setInterval(() => {
      if (active && !directConnected) fetchGuarded();
    }, pollMs);
  }

  function onVisibility() {
    if (document.visibilityState === "visible") resync();
  }

  function stop() {
    if (!active) return;
    active = false;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", resync);
    window.removeEventListener("online", resync);
    rt(doorbellTopic(gameId)).reset();
    void stopDirect();
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

  return { start, stop, applyRow, refetchNow,
    isDirectConnected() { return directConnected; },
    isDirectTableConnected(table) { return directTableConnected.get(table) === true; } };
}
