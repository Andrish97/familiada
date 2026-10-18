// control/buzzer/js/main.js
// Napisane od zera (nie kopia js/pages/buzzer.js). Wysyłka kliknięcia to
// najważniejsza różnica architektoniczna z całego planu (sekcja 1/4):
// zamiast broadcastu do Control ("BUZZER_EVT CLICK A", wyścig po stronie
// klienta), Buzzer sam woła atomowy RPC game_state_buzzer_press — pierwszy
// zapis wygrywa w bazie, drugi dostaje jawny błąd already_pressed. Trzy
// możliwe wyniki, wszystkie jawne dla kontestanta (plan, sekcja 4):
// sukces (przycisk pokazuje PUSHED_x od razu, przez applyRow), already_pressed
// (przycisk natychmiast pokazuje, kto był pierwszy, przez refetchNow —
// autorytatywny wiersz już to wie), błąd sieci (przycisk wraca do ON,
// można spróbować ponownie).

import { initI18n, setUiLang } from "../../../shared/translation/translation.js?v=v2026-10-18T16284";
import { startKeepAlive } from "../../../shared/js/core/keep-alive.js?v=v2026-10-18T16284";
import { guardViewportWidth } from "../../../shared/js/core/device-guard.js?v=v2026-10-18T16284";
import { sb } from "../../../shared/js/core/supabase.js?v=v2026-10-18T16284";
import { createSubscription } from "../../../shared/js/core/game-state-subscribe.js?v=v2026-10-18T16284";
import { createButtonRenderer, isLockedRow } from "./render.js?v=v2026-10-18T16284";
import { ringDoorbell } from "../../../shared/js/core/game-state-doorbell.js?v=v2026-10-18T16284";
import { createPressController } from "./press.js?v=v2026-10-18T16284";
import { icon } from "../../../shared/js/core/icons.js?v=v2026-10-18T16284";
import { getDevicePresenceMeta } from "../../../shared/js/core/device-context.js?v=v2026-10-18T16284";
import { createDeviceLease, updateDeviceLeaseOverlay } from "../../../shared/js/core/device-lease.js?v=v2026-10-18T16284";

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

function startPresenceHeartbeat({ gameId, key }, pingMs = 3000) {
  const DEVICE_ID_KEY = "familiada:deviceId:buzzer";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
  let pingInFlight = false;
  const ping = async () => {
    if (pingInFlight) return;
    pingInFlight = true;
    try {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId, p_device_type: "buzzer", p_key: key, p_device_id: deviceId, p_meta: getDevicePresenceMeta(gameId),
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    } catch { /* Presence diagnostics must never interrupt the Buzzer. */ }
    finally { pingInFlight = false; }
  };
  ping();
  setInterval(ping, pingMs);
  document.addEventListener("visibilitychange", () => { void ping(); });
  for (const event of ["focus", "blur", "pageshow", "pagehide"]) {
    window.addEventListener(event, () => { void ping(); });
  }
}

// js/pages/buzzer.js's isIOSSafari()/setPseudoFS()/toggleFullscreen() — na
// iPhone/iPad w zwykłej karcie Safari (nie zainstalowane jako aplikacja)
// prawdziwy Fullscreen API nie istnieje wcale (celowe ograniczenie
// przeglądarki), więc bez tego fallbacku kliknięcie przycisku po prostu nic
// by nie robiło (catch połyka błąd w ciszy) — kontestant zostaje bez żadnej
// informacji, dlaczego "pełny ekran" nie działa. Naprawiona luka: pierwszy
// przebieg buzzer2 miał tylko goły requestFullscreen(), bez tego wykrywania.
function isIOSSafari() {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function isStandalone() {
  return !!(window.navigator.standalone || window.matchMedia?.("(display-mode: standalone)").matches);
}

function setupFullscreenButton() {
  const btn = document.getElementById("btnFS");
  const hint = document.getElementById("buzzerA2HS");
  const close = document.getElementById("buzzerA2HSClose");
  const ico = document.getElementById("fsIco");
  let pseudoFS = false;

  function syncIcon() { if (ico) ico.innerHTML = icon((document.fullscreenElement || pseudoFS) ? "fullscreen-exit" : "fullscreen-enter"); }

  function closeHint() {
    document.documentElement.classList.remove("showA2HS");
    hint?.setAttribute("aria-hidden", "true");
    btn?.focus();
  }

  function openHint() {
    document.documentElement.classList.add("showA2HS");
    hint?.setAttribute("aria-hidden", "false");
    close?.focus();
  }

  close?.addEventListener("click", closeHint);
  hint?.addEventListener("click", (event) => { if (event.target === hint) closeHint(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.documentElement.classList.contains("showA2HS")) closeHint();
  });

  function setPseudoFS(on) {
    pseudoFS = !!on;
    document.documentElement.classList.toggle("pseudoFS", pseudoFS);
    setTimeout(() => window.scrollTo(0, 1), 50); // iOS: próba schowania paska adresu
    syncIcon();
  }

  btn?.addEventListener("click", async () => {
    if (isIOSSafari() && !isStandalone()) {
      // W Safari nie zrobimy prawdziwego FS — pokaż instrukcję "dodaj do ekranu głównego".
      openHint();
      return;
    }
    try {
      if (document.fullscreenElement) { await document.exitFullscreen?.(); syncIcon(); return; }
      if (pseudoFS) { setPseudoFS(false); return; }
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) throw new Error("fullscreen unavailable");
      await req.call(el, { navigationUI: "hide" });
      syncIcon();
    } catch (e) {
      // iOS / blokady / iframe => pseudo-fullscreen
      setPseudoFS(true);
      console.warn("[buzzer2] fullscreen fallback:", e);
    }
  });
  document.addEventListener("fullscreenchange", syncIcon);

  if (isStandalone()) document.documentElement.classList.add("webapp");
}

async function main() {
  await initI18n({ withSwitcher: false });
  const controlTestFrame = window.parent !== window
    && window.frameElement?.dataset.controlTestMode === "true";
  const deviceGate = guardViewportWidth({
    minWidth: 0,
    formFactors: controlTestFrame ? null : ["phone", "tablet"],
    requiresTouch: !controlTestFrame,
    allowPhoneLandscape: true,
    requirePhoneLandscape: !controlTestFrame,
    rotateMessageKey: "buzzer.rotateMessage",
  });
  document.documentElement.removeAttribute("data-touch-guard-pending");
  if (deviceGate.state() !== "ok") await deviceGate.ready;
  // Utrzymujemy ekran aktywny dopiero po przejściu wspólnego guarda.
  startKeepAlive();
  setupFullscreenButton();
  document.documentElement.classList.remove("page-loading");

  const { gameId, key } = parseParams();
  const loadError = document.getElementById("deviceLoadError");
  const offScreen = document.getElementById("offScreen");
  const revealStep = (element) => {
    if (!element) return;
    element.hidden = false;
    element.classList.add("skel-step-ready");
  };
  document.querySelector("[data-retry-device]")?.addEventListener("click", () => location.reload());
  if (!gameId || !key) {
    revealStep(loadError);
    return;
  }

  let subscription = null;
  const lease = createDeviceLease({ gameId, deviceType: "buzzer", key, onState: ({ state }) => {
    updateDeviceLeaseOverlay(state);
    if (subscription) {
      if (state === "primary") void subscription.start();
      else subscription.stop();
    }
  } });
  await lease.start();
  updateDeviceLeaseOverlay(lease.state);

  const renderer = createButtonRenderer();
  let lastRow = null;
  let appliedLang = null;
  let lockTimer = null;
  let displayReadyKey = null;
  let displayCheckPendingKey = null;
  const requestKeyOf = (row) => `${row?.step || ""}:${row?.sound_cue_seq ?? ""}`;
  const isDisplayReady = (row) => Boolean(row && displayReadyKey === requestKeyOf(row));
  async function checkDisplayReady() {
    if (!lastRow) return;
    const row = lastRow;
    const requestKey = requestKeyOf(row);
    if (displayReadyKey === requestKey || displayCheckPendingKey === requestKey) return;
    // A pending RPC for an older transition must not delay the current one.
    // Keep one in-flight request per transition; late replies are ignored.
    displayCheckPendingKey = requestKey;
    try {
      const { data, error } = await sb().rpc("game_state_display_is_ready", { p_game_id: gameId, p_key: key, p_device_type: "buzzer", ...lease.actionArgs() }).abortSignal(AbortSignal.timeout(6500));
      // Completion is requested only when step or sound_cue_seq changes
      // (migration 305). Unrelated revisions, including a buzzer press or
      // locked_until update, must not invalidate an acknowledgment already
      // received for this visual/audio transition.
      if (!error && requestKey === requestKeyOf(lastRow) && data === true) {
        displayReadyKey = requestKey;
        presses.render(lastRow);
      }
    } finally { if (displayCheckPendingKey === requestKey) displayCheckPendingKey = null; }
  }
  setInterval(() => {
    // A live Realtime channel does not prove this client received every ACK.
    // Retry while the current transition is pending so one dropped
    // display_rendered_rev event cannot leave the Buzzer disabled indefinitely.
    if (lastRow && !isDisplayReady(lastRow)) void checkDisplayReady();
  }, 500);

  // Migracja 264 -- game_state_set_lock (control/js/store.js) NIE dzwoni
  // dzwonkiem i NIE podbija rev (patrz komentarz tam) -- więc bez własnego
  // zegarka Buzzer nigdy by się nie dowiedział, że blokada, którą sam
  // widzi w row.locked_until, naturalnie minęła, dopóki nie przyjdzie
  // KOLEJNY, niepowiązany zapis w grze. Re-render tą samą, już posiadaną
  // treścią (lastRow) wystarczy -- deriveButtonState/isLockedRow przeliczą
  // się na nowo względem aktualnego Date.now().
  function scheduleUnlockRerender(row) {
    clearTimeout(lockTimer);
    lockTimer = null;
    if (!isLockedRow(row)) return;
    const msLeft = new Date(row.locked_until).getTime() - Date.now();
    lockTimer = setTimeout(() => presses.render(lastRow), Math.max(0, msLeft) + 20);
  }

  let initialStateReady = false;
  subscription = createSubscription({
    gameId, deviceType: "buzzer", key,
    getLeaseArgs: () => lease.actionArgs(),
    // Bez podbicia rev powiadamiamy też o wygaśnięciu blokady i potwierdzeniu
    // renderowania Wyświetlacza; oba pola są dostarczane tym samym strumieniem.
    sameRevChanged: (prev, next) => prev.locked_until !== next.locked_until
      || prev.display_rendered_rev !== next.display_rendered_rev,
    onRow: (row) => {
      lease.setProgress({ receivedRev: Number(row.rev) || 0 });
      // Język idzie za operatorem w Control — patrz control/display/js/main.js.
      const lang = row.detail?.settings?.uiLang;
      if (lang && lang !== appliedLang) {
        // appliedLang ustawiane DOPIERO po sukcesie -- patrz identyczny
        // komentarz w control/host/js/main.js: appliedLang=lang PRZED zapisem
        // wyniku setUiLang() + .catch(()=>{}) łykający błąd bez retry
        // zostawiałby stronę trwale w starym języku po przejściowym błędzie
        // (np. sieciowym) przy dynamicznym imporcie słownika.
        setUiLang(lang, { persist: true, updateUrl: true, apply: true })
          .then(() => { appliedLang = lang; })
          .catch((e) => console.warn("[buzzer2] setUiLang nie powiodło się, spróbuję ponownie przy kolejnym wierszu:", e));
      }
      lastRow = row;
      presses.render(row);
      lease.setProgress({ renderedRev: Number(row.rev) || 0 });
      initialStateReady = true;
      if (loadError) loadError.hidden = true;
      document.getElementById("arena")?.classList.add("skel-step-ready");
      offScreen?.classList.add("skel-step-ready");
      void checkDisplayReady();
      scheduleUnlockRerender(row);
    },
    onError: (error) => {
      console.warn("[buzzer2] game_state_get failed:", error);
      if (!initialStateReady) revealStep(loadError);
    },
  });

  const presses = createPressController({
    getRow: () => lastRow ? { ...lastRow, display_animation_pending: !isDisplayReady(lastRow) } : null,
    render: (row, team) => renderer.render(row ? { ...row, display_animation_pending: !isDisplayReady(row) } : row, team),
    send: (team) => sb().rpc("game_state_buzzer_press", {
      p_game_id: gameId, p_key: key, p_team: team,
      ...lease.actionArgs(),
    }),
    applyRow: (row) => subscription.applyRow(row),
    refetch: () => subscription.refetchNow(),
    onAccepted: (data) => {
      // game_state_buzzer_press idzie z pominięciem control/js/store.js,
      // więc nic INNEGO nie zadzwoni dzwonkiem po tym zapisie — bez tego
      // Control (i Display/Host) nigdy by się nie dowiedzieli, że ktoś
      // nacisnął (znalezione na żywo przez control2-full-game.spec.js:
      // Buzzer widział własne wciśnięcie, ale Control — nie).
      ringDoorbell(gameId, data.rev);
    },
    onError: (error) => console.warn("[buzzer2] press failed, spróbuj ponownie:", error),
  });
  const press = presses.press;

  document.getElementById("btnA")?.addEventListener("click", () => press("A"));
  document.getElementById("btnB")?.addEventListener("click", () => press("B"));
  document.getElementById("btnA")?.addEventListener("touchstart", (e) => { e.preventDefault(); press("A"); }, { passive: false });
  document.getElementById("btnB")?.addEventListener("touchstart", (e) => { e.preventDefault(); press("B"); }, { passive: false });

  startPresenceHeartbeat({ gameId, key });
  if (lease.state === "primary") await subscription.start();
}

main();
