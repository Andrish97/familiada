import { renderAndConfirm } from "../../../shared/js/gameplay/renderCompletion.js?v=v2026-10-19T10585";

// control/display/js/main.js
// Punkt wejścia Display v2. Napisane od zera (nie kopia control/display/js/main.js)
// — inna orkiestracja: zamiast kanału komend + snapshotu z device_state,
// jest jedno wywołanie RPC na start (game_state_get, przez subscribe.js)
// i "dzwonek" broadcastowy zamiast kanału DISPLAY_CMD. Ping obecności
// (device_ping) i walidacja klucza (display_auth) to te same, generyczne,
// niezwiązane z komendami RPC co dziś — reużyte bez zmian.

import { initFullscreenButton } from "../../../shared/js/display/fullscreen.js?v=v2026-10-19T10585";
import { initI18n, setUiLang, t } from "../../../shared/translation/translation.js?v=v2026-10-19T10585";
import { startKeepAlive } from "../../../shared/js/core/keep-alive.js?v=v2026-10-19T10585";
import { guardViewportWidth } from "../../../shared/js/core/device-guard.js?v=v2026-10-19T10585";
import { getDevicePresenceMeta } from "../../../shared/js/core/device-context.js?v=v2026-10-19T10585";
import { sb } from "../../../shared/js/core/supabase.js?v=v2026-10-19T10585";
import { createScene } from "./scene.js?v=v2026-10-19T10585";
import { createQRController } from "./qr.js?v=v2026-10-19T10585";
import { createSubscription } from "../../../shared/js/core/game-state-subscribe.js?v=v2026-10-19T10585";
import { rt } from "../../../shared/js/core/realtime.js?v=v2026-10-19T10585";
import { doorbellTopic } from "../../../shared/js/core/game-state-doorbell.js?v=v2026-10-19T10585";
import { createRenderer } from "./render.js?v=v2026-10-19T10585";
import { createDisplaySoundReactor } from "./soundReactor.js?v=v2026-10-19T10585";
import { loadSfxManifest, initSfx, setCurrentGameId, applySfxGameSettings, unlockAudio, getSfxDurationAccurate as getSfxDuration, isAnySfxPlaying, onSfxPlayback, setSfxMuted } from "../../../shared/js/core/sfx.js?v=v2026-10-19T10585";
import { createDeviceLease, updateDeviceLeaseOverlay } from "../../../shared/js/core/device-lease.js?v=v2026-10-19T10585";


const $ = (id) => document.getElementById(id);

function enterFullscreen() {
  if (!/Smart[- ]?TV|HbbTV|NetCast|Web[O0]S|Tizen|Android[ /_-]?TV|Google[ /_-]?TV|BRAVIA|Viera|AFT\w+|AppleTV|CrKey|Roku|TV Safari/i.test(navigator.userAgent)) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const root = document.documentElement;
  try {
    const result = root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen?.();
    result?.catch?.(() => {});
  } catch {}
}

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

async function authDisplayOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");
  const { data, error } = await sb().rpc("display_auth", { p_game_id: gameId, p_key: key }).abortSignal(AbortSignal.timeout(6500));
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");
  return row;
}

function startPresenceHeartbeat({ gameId, key }, pingMs = 3000) {
  const DEVICE_ID_KEY = "familiada:deviceId:display";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
  let meta = getDevicePresenceMeta(gameId, { audio_unlocked: false, audio_unlock_nonce: null });
  let metaVersion = 0;
  let pingWork = null;
  const ping = async () => {
    // Heartbeaty nie mogą się wyprzedzać: wolna odpowiedź ze starym
    // audio_unlocked:false nie może nadpisać nowszego potwierdzenia true.
    if (pingWork) {
      await pingWork;
      return ping();
    }
    pingWork = (async () => {
      let version;
      let ok;
      do {
        version = metaVersion;
        const { data, error } = await sb().rpc("device_ping", {
          p_game_id: gameId, p_device_type: "display", p_key: key, p_device_id: deviceId, p_meta: getDevicePresenceMeta(gameId, meta),
        }).abortSignal(AbortSignal.timeout(6500));
        if (!error && data?.device_id && !deviceId) {
          deviceId = data.device_id;
          localStorage.setItem(DEVICE_ID_KEY, deviceId);
        }
        ok = !error && !!data?.device_id;
      } while (version !== metaVersion);
      return ok;
    })();
    try { return await pingWork; }
    catch { return false; }
    finally { pingWork = null; }
  };
  ping();
  setInterval(ping, pingMs);
  document.addEventListener("visibilitychange", () => { void ping(); });
  for (const event of ["focus", "blur", "pageshow", "pagehide"]) {
    window.addEventListener(event, () => { void ping(); });
  }
  return {
    setMeta(patch) { meta = { ...meta, ...patch }; metaVersion++; return ping(); },
  };
}

function createDisplayEventLog(gameId, key, lease) {
  let initialPageStateReported = false;
  let stopped = false;
  let sessionActive = false;
  let pending = Promise.resolve();
  const report = (event) => {
    if (stopped || !sessionActive) return;
    const eventId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = { ...event, event_id: eventId };
    pending = pending.catch(() => {}).then(async () => {
      let lastError = null;
      for (const delayMs of [0, 500, 1500, 3500]) {
        if (stopped && delayMs > 0) return;
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        try {
          const { data, error } = await sb().rpc("control2_display_event", {
            p_game_id: gameId, p_key: key, p_event: payload, ...lease.actionArgs(),
          }).abortSignal(AbortSignal.timeout(4000));
          if (error) throw error;
          if (data === true) return;
          lastError = new Error("Zdarzenie nie zostało przypisane do aktywnej rozgrywki.");
        } catch (error) { lastError = error; }
      }
      console.warn("[display2 diagnostics] nie udało się zapisać zdarzenia:", payload.event_type, lastError?.message || lastError);
    }).catch(error => {
      console.warn("[display2 diagnostics] kolejka zapisu przerwana:", error?.message || error);
    });
  };
  const reportInitialPageState = () => {
    if (!sessionActive || initialPageStateReported) return;
    initialPageStateReported = true;
    report({
      event_type: "page_state", reason: "initial",
      visibility: document.visibilityState || "unknown",
      focused: !!document.hasFocus?.(), was_discarded: !!document.wasDiscarded,
      online: navigator.onLine !== false,
    });
  };
  return {
    report,
    setSessionActive(active) {
      sessionActive = !!active;
      if (sessionActive) reportInitialPageState();
    },
    stop() {
      stopped = true;
    },
  };
}

function showBlack() {
  $("blackScreen")?.classList.remove("hidden");
  $("qrScreen")?.classList.add("hidden");
  $("gameScreen")?.classList.add("hidden");
}

function monitorVisibleFrameGaps() {
  if (document.visibilityState !== "visible" || typeof requestAnimationFrame !== "function") return () => null;
  let active = true;
  let previous = performance.now();
  let maxGapMs = 0;
  let stalledFrames = 0;
  let frameId = 0;
  // RAF may be paused while a tab is hidden and resume with a large gap.
  // That gap belongs to background suspension, not a visible rendering stall.
  const resetWindow = () => {
    previous = performance.now();
    stalledFrames = 0;
    maxGapMs = 0;
  };
  document.addEventListener("visibilitychange", resetWindow);
  const tick = now => {
    if (!active) return;
    if (document.visibilityState !== "visible") {
      previous = now;
      frameId = requestAnimationFrame(tick);
      return;
    }
    const gap = Math.max(0, now - previous);
    previous = now;
    if (gap >= 150) { stalledFrames += 1; maxGapMs = Math.max(maxGapMs, gap); }
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
  return () => {
    active = false;
    cancelAnimationFrame(frameId);
    document.removeEventListener("visibilitychange", resetWindow);
    // Report only obvious visible stalls; background-tab throttling is excluded.
    return document.visibilityState === "visible" && stalledFrames && maxGapMs >= 250
      ? { maxGapMs: Math.round(maxGapMs), stalledFrames }
      : null;
  };
}

// Instrumentacja WYŁĄCZNIE do obserwacji w E2E (tests/e2e/control.spec.js).
// Display maluje na SVG dot-matrix, bez żadnego tekstu w DOM (w
// odróżnieniu od Hosta, gdzie zwykły .textContent wystarcza) — bez tego
// zapisu nie dałoby się z Playwrighta zweryfikować, co render.js FAKTYCZNIE
// kazał narysować scene.js (dokładny tekst/punkty/animacja), tylko czy
// strona się nie wywaliła. Zero wpływu na realne rysowanie — owija wywołania
// przezroczyście, oryginalna funkcja i tak się wykonuje.
function instrumentSceneApi(api) {
  window.__displayLog = [];
  const wrap = (obj, path) => {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "function") {
        out[k] = (...args) => {
          const call = `${path}.${k}`;
          window.__displayLog.push({ call, args });
          const perf = window.__displayPerf;
          if (!perf) return v.apply(obj, args);
          const start = performance.now();
          const findMs = (value) => {
            if (!value || typeof value !== "object") return 0;
            if (Number.isFinite(value.ms)) return value.ms;
            return findMs(value.animOut) + findMs(value.animIn);
          };
          const targetMs = args.reduce((sum, arg) => sum + findMs(arg), 0);
          perf.active++;
          let syncMs;
          const finish = () => {
            perf.active--;
            if (targetMs > 0) perf.animations.push({ call, startedAt: performance.timeOrigin + start, targetMs, actualMs: performance.now() - start, syncMs });
          };
          try {
            const result = v.apply(obj, args);
            syncMs = performance.now() - start;
            if (result && typeof result.then === "function") return result.finally(finish);
            finish();
            return result;
          } catch (error) { syncMs = performance.now() - start; finish(); throw error; }
        };
      } else if (v && typeof v === "object") {
        out[k] = wrap(v, `${path}.${k}`);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  return wrap(api, "api");
}

// Tryb podglądu dla D3 w Control (plan, sekcja 3a pkt 5: "Podgląd kolorów/
// motywu/logo w małej miniaturce w panelu Control" — Control osadza tę samą
// stronę w iframe zamiast montować scene.js osobno, prościej i bez
// duplikowania kodu rysującego). Zero autoryzacji/subskrypcji real
// game_state — Control (jedyne, co go osadza) sam zna aktualne ustawienia i
// przesyła gotowy, spreparowany wiersz przez postMessage; nie ma potrzeby
// przekazywać do iframe klucza dostępu do prawdziwej gry.
async function bootPreview() {
  const scene = await createScene();
  scene.api = instrumentSceneApi(scene.api);
  const qrCtrl = createQRController({
    qrScreen: $("qrScreen"), gameScreen: $("gameScreen"),
    hostCard: $("qrHostCard"), buzzerCard: $("qrBuzzerCard"),
    hostImg: $("qrHostImg"), buzzerImg: $("qrBuzzerImg"),
    hostCodeEl: $("qrHostCode"), buzzerCodeEl: $("qrBuzzerCode"),
  });
  const qr = { show() {}, hide() { qrCtrl.hide(); } };
  const renderer = createRenderer({ scene, qr });

  $("blackScreen")?.classList.add("hidden");
  $("qrScreen")?.classList.add("hidden");
  // Preview is a passive renderer, not a device session: reveal its surface
  // directly instead of waiting for the live-game skeleton/auth flow.
  $("gameScreen")?.classList.add("skel-step-ready");
  $("gameScreen")?.classList.remove("hidden");

  // ZAWSZE renderSnapshot, nigdy renderDiff — w odróżnieniu od prawdziwej
  // gry, tu nie ma czego animować płynnie (to formularz ustawień, nie mecz),
  // a co ważniejsze: web/js/gameplay/deriveEvents.js w ogóle nie ma zdarzenia na
  // zmianę kolorów/motywu (bo w prawdziwej grze te pola nigdy się nie
  // zmieniają w trakcie rozgrywki — blokada ustawień po starcie) — gdyby
  // korzystać z renderDiff() tutaj, KAŻDA kolejna wiadomość po pierwszej
  // zgubiłaby zmianę koloru/motywu (deriveEvents nie ma jak jej wykryć),
  // mimo że sam wiersz niesie już nową wartość.
  let previewAppearance = null;
  let previewTeams = {};
  let previewQueue = Promise.resolve();
  window.addEventListener("message", (e) => {
    if (e.data?.type !== "familiada:preview-row") return;
    const row = e.data.row;
    previewQueue = previewQueue.then(async () => {
    const appearance = JSON.stringify(row.detail?.display);
    const rawTeams = row.detail?.teams || {};
    const teams = {
      teamA: rawTeams.defaultA === true || !rawTeams.teamA ? t("control.teamADefault") : rawTeams.teamA,
      teamB: rawTeams.defaultB === true || !rawTeams.teamB ? t("control.teamBDefault") : rawTeams.teamB,
    };
    if (previewAppearance === appearance) {
      if (previewTeams.teamA !== teams.teamA) scene.api.small.long1(teams.teamA || "");
      if (previewTeams.teamB !== teams.teamB) scene.api.small.long2(teams.teamB || "");
      previewTeams = { ...teams };
      return;
    }
    // logoPreview (wyłącznie w wierszu podglądu — nigdy w prawdziwym
    // game_state) to jeszcze NIEZAPISANY wybór logo w formularzu ustawień —
    // bindGame/reload czytają logo z bazy, więc nie zobaczyłyby tego wcale.
    // Musi się wykonać PRZED renderSnapshot, żeby paintForStep's
    // api.logo.show() (step==="r_intro") narysował już właściwe logo, a nie
    // stare/domyślne z poprzedniej klatki.
    if ("logoPreview" in (row.detail?.display || {})) {
      scene.api.logo.setPreview(row.detail.display.logoPreview);
    } else {
      const logoId = row.detail?.display?.logoId;
      let logoPreview = null;
      if (logoId) {
        try {
          const { data, error } = await sb()
            .from("user_logos")
            .select("type,payload")
            .eq("id", logoId)
            .maybeSingle();
          if (error) throw error;
          if (data?.type && data?.payload) logoPreview = data;
        } catch (error) {
          console.warn("[display2] preview logo lookup failed:", error);
        }
      }
      scene.api.logo.setPreview(logoPreview);
    }
    await renderer.renderSnapshot(row);
    // Podgląd formularza jest statyczny; intro prawdziwej gry pozostaje osobne.
    if (!row.detail?.display?.suppressLogoDraw) scene.api.logo.draw();
    previewAppearance = appearance;
    previewTeams = { ...teams };
    // Reszta tego układu (plan podglądu: prawo/góra/lewo = przykładowe
    // cyfry, wskaźnik wyłączony) nie odpowiada ŻADNEMU prawdziwemu stanowi
    // gry — to czysto demonstracyjne wypełnienie "small" (płótno niezależne
    // od "big", gdzie jest logo), więc idzie bezpośrednio przez scene.api,
    // nie przez wspólny (z prawdziwą grą) render.js's paintForStep.
    const previewNumbers = row.detail?.display?.previewNumbers;
    if (previewNumbers) {
      scene.api.small.rightDigits(String(previewNumbers.right ?? ""));
      scene.api.small.topDigits(String(previewNumbers.top ?? ""));
      scene.api.small.leftDigits(String(previewNumbers.left ?? ""));
      const xPositions = row.detail?.display?.previewXPositions || {};
      for (const side of ["A", "B"]) {
        const active = new Set(xPositions[side] || []);
        for (let position = 1; position <= 3; position++) {
          scene.api.rounds.setX(`${position}${side}`, active.has(position));
        }
      }
    } else {
      scene.api.small.rightDigits("123");
      scene.api.small.topDigits("456");
      scene.api.small.leftDigits("789");
    }
    scene.api.indicator.set("OFF");
    window.dispatchEvent(new CustomEvent("familiada:preview-rendered", { detail: { rev: row.rev } }));
    }).catch((error) => console.warn("[display2] preview render failed", error));
  });

  document.documentElement.classList.remove("page-loading");
  parent.postMessage({ type: "familiada:preview-ready" }, "*");
}

window.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: false });
  const params = new URL(location.href).searchParams;
  const preview = params.get("preview") === "1";
  const controlTestFrame = window.parent !== window
    && window.frameElement?.dataset.controlTestMode === "true";
  const deviceGate = preview || controlTestFrame ? null : guardViewportWidth({ minWidth: 980, minScreenShortSide: 800, minTvResolution: true, formFactors: ["desktop", "tablet", "tv"] });
  document.documentElement.removeAttribute("data-device-guard-pending");
  if (deviceGate && deviceGate.state() !== "ok") await deviceGate.ready;

  if (preview) {
    await bootPreview();
    return;
  }
  startKeepAlive();
  initFullscreenButton();
  enterFullscreen();
  document.addEventListener("keydown", (event) => {
    const screen = $("audioUnlockScreen");
    if (screen && !screen.classList.contains("hidden") && (event.key === "Enter" || event.key === " " || event.key === "Select" || event.keyCode === 23)) {
      event.preventDefault();
      $("btnAudioUnlock")?.click();
    }
  });
  document.addEventListener("pointerdown", enterFullscreen, { once: true });
  document.addEventListener("keydown", enterFullscreen, { once: true });

  try {
    const { gameId, key } = parseParams();
    const game = await authDisplayOrThrow(gameId, key);
    let subscription = null;
    let rendererInstance = null;
    let soundReactorInstance = null;
    let audioSessionRegistration = Promise.resolve(false);
    const lease = createDeviceLease({ gameId: game.id, deviceType: "display", key, onState: ({ state }) => {
      updateDeviceLeaseOverlay(state);
      if (subscription) {
        if (state === "primary") {
          audioSessionRegistration = registerAudioSession();
          void subscription.start();
        } else {
          subscription.stop();
          rendererInstance?.cancel?.();
          soundReactorInstance?.cancel?.();
          setSfxMuted(true);
          $("audioUnlockScreen")?.classList.add("hidden");
          showBlack();
        }
      }
    } });
    await lease.start();
    updateDeviceLeaseOverlay(lease.state);
    const displayEventLog = createDisplayEventLog(game.id, key, lease);
    window.addEventListener("pagehide", displayEventLog.stop, { once: true });
    const audioSessionNonce = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Every Display page load starts a fresh atomic unlock generation. This
    // catches reloads even when the 6.5 s presence timeout never elapsed.
    function registerAudioSession() {
      return sb().rpc("begin_display_audio_session", {
        p_game_id: game.id, p_key: key, p_session_nonce: audioSessionNonce, ...lease.actionArgs(),
      }).then(({ error }) => {
      if (error) console.warn("[display2 audio unlock] session registration failed:", error.message);
      return !error;
    }).catch((error) => {
      console.warn("[display2 audio unlock] session registration failed:", error?.message || error);
      return false;
    });
    }
    if (lease.state === "primary") audioSessionRegistration = registerAudioSession();
    const displayPresence = startPresenceHeartbeat({ gameId: game.id, key });

    // Dźwięk "ze źródła Wyświetlacz" (zgłoszone) — ten sam js/core/sfx.js co
    // Control, wczytany niezależnie tutaj. Głośności/warianty (BEZ własnych
    // plików — patrz web/js/gameplay/gameStateShape.js) dociągane niżej z pierwszego
    // wiersza game_state, gdzie control/js/app.js je zdenormalizowało.
    setCurrentGameId(game.id);
    await loadSfxManifest();
    await initSfx();
    const soundReactor = createDisplaySoundReactor();
    soundReactorInstance = soundReactor;
    let displayWasStarted = false;

    const audioUnlockScreen = $("audioUnlockScreen");
    const btnAudioUnlock = $("btnAudioUnlock");
    let audioUnlockReported = false;
    let audioUnlockRequestNonce = audioSessionNonce;
    let displaySoundSelected = false;
    let activeGameStep = null;
    let lastFrameDiagnosticAt = 0;
    const stopAudioDiagnostics = onSfxPlayback(event => {
      if (!displaySoundSelected || !activeGameStep || /^(devices_|setup_)/.test(activeGameStep)) return;
      if (!event.failed && event.delayMs < 500) return;
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      void displayPresence.setMeta({ audio_diagnostic: {
        id, sound: String(event.key || "unknown").slice(0, 80),
        delayMs: Math.max(0, Number(event.delayMs) || 0), failed: !!event.failed,
        error: String(event.error || "").slice(0, 160),
      } });
    });
    window.addEventListener("pagehide", stopAudioDiagnostics, { once: true });
    function syncAudioUnlockScreen(row = null) {
      if (!audioUnlockScreen) return;
      const soundSource = row?.detail?.settings?.soundSource;
      if (soundSource === "display" || soundSource === "control") {
        displaySoundSelected = soundSource === "display";
      }
      if (typeof row?.step === "string") activeGameStep = row.step;
      // Odblokowanie przeglądarki jest potrzebne tylko wtedy, gdy dźwięk ma
      // grać z tego urządzenia. Nie zasłaniaj Display, gdy gra dźwięk z Control.
      // Po wejściu Display w trakcie rozgrywki poczekaj na nonce żądania od
      // Control. Sam nonce sesji powstaje wcześniej przy ładowaniu Display;
      // pokazanie go od razu ścigałoby się z żądaniem ponownego odblokowania
      // po powrocie Control. W kroku Urządzenia przycisk pojawia się od razu.
      const inGameplay = !!activeGameStep && !/^(devices_|setup_)/.test(activeGameStep);
      const hasCurrentGameplayRequest = !inGameplay || audioUnlockRequestNonce !== audioSessionNonce;
      const visible = displaySoundSelected && !audioUnlockReported && hasCurrentGameplayRequest;
      const wasHidden = audioUnlockScreen.classList.contains("hidden");
      audioUnlockScreen.classList.toggle("hidden", !visible);
      audioUnlockScreen.setAttribute("aria-hidden", String(!visible));
      if (visible && wasHidden) btnAudioUnlock?.focus({ preventScroll: true });
    }
    syncAudioUnlockScreen();
    btnAudioUnlock?.addEventListener("click", async () => {
      enterFullscreen();
      if (!await unlockAudio()) return;
      // Nie chowaj przycisku przed potwierdzeniem serwera. Jeśli połączenie
      // chwilowo nie działa, operator może ponowić kliknięcie zamiast zostać
      // zablokowanym bez widocznego sposobu odblokowania.
      btnAudioUnlock.disabled = true;
      let reported = false;
      try {
        const sessionRegistered = await audioSessionRegistration;
        if (audioUnlockRequestNonce && sessionRegistered) {
          const { data, error } = await sb().rpc("acknowledge_display_audio_unlock", {
            p_game_id: game.id, p_key: key, p_nonce: audioUnlockRequestNonce, ...lease.actionArgs(),
          }).abortSignal(AbortSignal.timeout(6500));
          if (!error) reported = data === true;
          else {
            // Compatibility fallback for a rolling deploy where migration
            // 312 is not installed yet. Once installed, the dedicated row is
            // authoritative and heartbeat writes cannot clear this ack.
            reported = await displayPresence.setMeta({
              audio_unlocked: true,
              audio_unlock_nonce: audioUnlockRequestNonce,
            });
          }
        } else {
          reported = await displayPresence.setMeta({ audio_unlocked: true, audio_unlock_nonce: null });
        }
      }
      catch { /* pozostaw widoczny przycisk, aby można było ponowić */ }
      if (reported) {
        audioUnlockReported = true;
        audioUnlockScreen?.classList.add("hidden");
        audioUnlockScreen?.setAttribute("aria-hidden", "true");
        if (audioUnlockRequestNonce) {
          rt(doorbellTopic(game.id)).sendBroadcast("audio_unlock_completed", {
            nonce: audioUnlockRequestNonce,
          }, { mode: "http" }).catch(() => {});
        }
      } else {
        btnAudioUnlock.disabled = false;
      }
    });

    const scene = await createScene();
    scene.api = instrumentSceneApi(scene.api);
    const qrCtrl = createQRController({
      qrScreen: $("qrScreen"), gameScreen: $("gameScreen"),
      hostCard: $("qrHostCard"), buzzerCard: $("qrBuzzerCard"),
      hostImg: $("qrHostImg"), buzzerImg: $("qrBuzzerImg"),
      hostCodeEl: $("qrHostCode"), buzzerCodeEl: $("qrBuzzerCode"),
    });
    await scene.api.logo.bindGame?.(game.id);

    // Host/buzzer NIEZALEŻNE — jeden LUB oba naraz (plan, korekta po
    // feedbacku: pierwszy przebieg pokazywał tylko jeden na raz, źle).
    const qr = {
      show(qrDetail) {
        $("blackScreen")?.classList.add("hidden");
        const host = qrDetail?.host || {};
        const buzzer = qrDetail?.buzzer || {};
        qrCtrl.setHost(host.show ? host.url || "" : "");
        qrCtrl.setHostCode(host.show ? host.code || "" : "");
        qrCtrl.setBuzzer(buzzer.show ? buzzer.url || "" : "");
        qrCtrl.setBuzzerCode(buzzer.show ? buzzer.code || "" : "");
        qrCtrl.setSingle(!!host.show !== !!buzzer.show);
        qrCtrl.show();
      },
      hide() {
        qrCtrl.hide();
      },
    };

    const renderer = createRenderer({ scene, qr, getSfxDuration });
    rendererInstance = renderer;
    async function warmCueTiming(row, previous) {
      const keys = new Set();
      const key = row?.sound_cue_key;
      if (key) keys.add(key);
      if (key === "round_transition" || key === "show_intro") keys.add("reveal");
      if (key === "final_theme" && row.step === "f_end") keys.add("reveal");
      if (key === "final_theme" && previous?.step === "f_start" && row.step === "f_p1_entry") {
        keys.add("round_transition");
        keys.add("reveal");
      }
      const pressed = row.detail?.rounds?.duel?.lastPressed;
      if (row.step === "r_duel" && pressed && !previous?.detail?.rounds?.duel?.lastPressed
        && !row.detail?.settings?.physicalBuzzer) keys.add("buzzer_press");
      // Resolve the exact shared timings before either side starts. Otherwise
      // Display audio can start immediately while renderDiff waits for MP3
      // decoding, making the animation finish after the sound.
      await Promise.all([...keys].map(getSfxDuration));
    }
    let prevRow = null;
    let renderQueue = Promise.resolve();
    let renderGeneration = 0;
    let appliedLang = null;

    let completedRenderRev = -1;
    let reportedRenderRev = -1;
    let loggedCompletionErrorRev = -1;
    let reportingCompletion = false;
    async function reportCompletion() {
      if (reportingCompletion || completedRenderRev <= 0 || completedRenderRev <= reportedRenderRev || isAnySfxPlaying()) return;
      reportingCompletion = true;
      const revision = completedRenderRev;
      try {
        const { error } = await sb().rpc("game_state_display_complete", { p_game_id: gameId, p_key: key, p_rev: revision, ...lease.actionArgs() }).abortSignal(AbortSignal.timeout(6500));
        if (!error) {
          reportedRenderRev = revision;
          lease.setProgress({ renderedRev: revision });
        }
        else if (loggedCompletionErrorRev !== revision) {
          loggedCompletionErrorRev = revision;
          displayEventLog.report({ event_type: "runtime_error", phase: "completion_ack", error_name: error.code || error.name || "RPCError", state_rev: revision });
        }
      } catch (error) {
        if (loggedCompletionErrorRev !== revision) {
          loggedCompletionErrorRev = revision;
          displayEventLog.report({ event_type: "runtime_error", phase: "completion_ack", error_name: error?.name || "NetworkError", state_rev: revision });
        }
      } finally { reportingCompletion = false; }
    }
    // Retry a lost acknowledgment without replaying any animation.
    setInterval(() => { void reportCompletion().catch(() => {}); }, 500);
    subscription = createSubscription({
      gameId: game.id,
      deviceType: "display",
      key,
      getLeaseArgs: () => lease.actionArgs(),
      onBroadcast: {
        audio_unlock_required: (message) => {
          const nonce = message?.payload?.nonce;
          if (typeof nonce !== "string" || !nonce || nonce === audioUnlockRequestNonce) return;
          audioUnlockRequestNonce = nonce;
          audioUnlockReported = false;
          // Przycisk został wyłączony na czas potwierdzania poprzedniego
          // kliknięcia. Nowe żądanie (np. po powrocie Control) musi znów
          // pozwalać na gest użytkownika.
          if (btnAudioUnlock) btnAudioUnlock.disabled = false;
          syncAudioUnlockScreen();
          void displayPresence.setMeta({ audio_unlocked: false, audio_unlock_nonce: nonce }).catch(() => {});
        },
      },
      onRow: async (row) => {
        lease.setProgress({ receivedRev: Number(row.rev) || 0 });
        const gameIsActive = !!row.detail?.locks?.gameStarted && !row.detail?.locks?.gameEnded;
        if (gameIsActive && !displayWasStarted) {
          displayWasStarted = true;
          displayEventLog.setSessionActive(true);
        } else if (!gameIsActive) {
          displayWasStarted = false;
          displayEventLog.setSessionActive(false);
        }
        setSfxMuted(row.detail?.settings?.soundMuted);
        // Język idzie za operatorem w Control (control/js/app.js's
        // LANG-push, dawniej osobna komenda `LANG <code>` — dziś zwykłe
        // pole w game_state, patrz web/js/gameplay/gameStateShape.js).
        const lang = row.detail?.settings?.uiLang;
        if (lang && lang !== appliedLang) {
          // appliedLang ustawiane DOPIERO po sukcesie -- patrz identyczny
          // komentarz w control/host/js/main.js i control/buzzer/js/main.js: appliedLang=lang
          // PRZED zapisem wyniku setUiLang() + .catch(()=>{}) łykający błąd
          // bez retry zostawiałby stronę trwale w starym języku po
          // przejściowym błędzie przy dynamicznym imporcie słownika.
          try {
            if (await setUiLang(lang, { persist: true, updateUrl: true, apply: true })) appliedLang = lang;
          } catch (e) {
            console.warn("[display2] setUiLang nie powiodło się, spróbuję ponownie przy kolejnym wierszu:", e);
          }
        }

        // Nazwy korzystają z bieżącego słownika, poza kolejką animacji
        // i bez oczekiwania na przygotowanie lub zakończenie dźwięku.
        renderer.updateTeamNames(row);

        // Dźwięk — patrz komentarz przy setCurrentGameId() wyżej. Reaplikowane
        // na KAŻDY wiersz (tanie — kilka localStorage.setItem), nie tylko raz:
        // operator może zmienić głośność w modalu ustawień PO tym, jak Display
        // już dostał pierwszy (pusty) wiersz `sound` — "raz" zamroziłoby
        // ustawienia sprzed realnej konfiguracji (złapane przy pisaniu testu
        // E2E, nie w prawdziwej grze — ale ten sam mechanizm tam też obowiązuje).
        if (row.detail?.settings?.sound) {
          applySfxGameSettings(row.detail.settings.sound);
        }
        const prev = prevRow;
        const displayOwnsSound = row.detail?.settings?.soundSource === "display";
        const cueTimingReady = warmCueTiming(row, prev);
        if (displayOwnsSound) await cueTimingReady;
        else void cueTimingReady;
        soundReactor.onRow(row);
        lease.setProgress({ startedSoundCueSeq: Number(row.sound_cue_seq) || 0 });
        syncAudioUnlockScreen(row);

        // Widoczność kontenerów zależy wyłącznie od trybu — samo malowanie
        // planszy/QR/czarnego to render.js.
        const mode = row.detail?.display?.mode || "BLACK";
        if (mode === "GAME" && !["devices_display", "setup_finish"].includes(row.step)) {
          $("blackScreen")?.classList.add("hidden");
          $("qrScreen")?.classList.add("hidden");
          $("gameScreen")?.classList.remove("hidden");
        } else if (mode === "QR") {
          $("gameScreen")?.classList.add("hidden");
        } else {
          $("qrScreen")?.classList.add("hidden");
          $("gameScreen")?.classList.add("hidden");
          $("blackScreen")?.classList.remove("hidden");
        }

        // Rendering is serialized separately from RPC reads. A new restart
        // can cancel the current animation without waiting for its sound.
        prevRow = row;
        const restarting = row.top_card === "devices" && prev?.top_card !== "devices";
        if (restarting) { renderGeneration++; renderer.cancel(); }
        const token = renderGeneration;
        renderQueue = renderQueue.then(async () => {
          if (token !== renderGeneration) return;
          // For Control as the sound source, let its sound reactor start the
          // cue only after this Display has prepared timing and is about to
          // render the matching revision. The signal is keyed by cue sequence
          // so repeated identical sounds remain distinct.
          await cueTimingReady;
          if (token !== renderGeneration) return;
          if (lease.state === "primary" && prev && row.sound_cue_seq !== prev.sound_cue_seq
            && row.detail?.settings?.soundSource === "control") {
            rt(doorbellTopic(game.id)).sendBroadcast("display_transition_started", {
              sound_cue_seq: row.sound_cue_seq,
            }, { mode: "http" }).catch(() => {});
          }
          await renderAndConfirm(
            async () => {
              const stopFrameMonitor = monitorVisibleFrameGaps();
              try {
                return await (!prev || restarting ? renderer.renderSnapshot(row) : renderer.renderDiff(prev, row));
              } finally {
                const gap = stopFrameMonitor();
                const now = Date.now();
                if (gap && now - lastFrameDiagnosticAt >= 15_000) {
                  lastFrameDiagnosticAt = now;
                  displayEventLog.report({
                    event_type: "render_stall",
                    max_frame_gap_ms: gap.maxGapMs,
                    stalled_frames: gap.stalledFrames,
                    visibility: document.visibilityState || "unknown",
                    state_rev: row.rev,
                  });
                }
              }
            },
            async () => {
              completedRenderRev = Math.max(completedRenderRev, row.rev);
              await reportCompletion();
            },
            () => token === renderGeneration,
          );
          if (token === renderGeneration) {
            document.querySelectorAll("[data-skel-step]").forEach((step) => step.classList.add("skel-step-ready"));
          }
        }).catch(error => {
          if (error?.name !== "AbortError") {
            displayEventLog.report({ event_type: "runtime_error", phase: "render", error_name: error?.name || "Error", state_rev: row.rev });
            console.warn("[display2] render failed", error);
          }
        });
      },
      onError: (error) => {
        console.warn("[display2] game_state_get failed:", error);
        showBlack();
        document.querySelectorAll("[data-skel-step]").forEach((step) => step.classList.add("skel-step-ready"));
      },
    });

    document.documentElement.classList.remove("page-loading");
    if (lease.state === "primary") await subscription.start();
  } catch (e) {
    console.warn("[display2]", e?.message || e);
    showBlack();
    document.querySelectorAll("[data-skel-step]").forEach((step) => step.classList.add("skel-step-ready"));
  }
});
