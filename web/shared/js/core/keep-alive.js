/**
 * keep-alive.js
 * Prevents browser from throttling background tabs.
 * - Flickers document title to keep JS timers alive
 * - Acquires a Web Lock to prevent CPU throttling (Chrome/Edge)
 * - Acquires Screen Wake Lock to prevent screen sleep (display/fullscreen)
 * - Plays silent audio to keep AudioContext alive in background
 */

let _titleInterval = null;
let _originalTitle = document.title;
let _dot = true;
let _wakeLock = null;

function startTitleFlicker() {
  if (_titleInterval) return;
  _titleInterval = setInterval(() => {
    document.title = (_dot ? "● " : "○ ") + _originalTitle;
    _dot = !_dot;
  }, 1000);
}

function stopTitleFlicker() {
  clearInterval(_titleInterval);
  _titleInterval = null;
  document.title = _originalTitle;
}

function acquireWebLock() {
  if (!navigator.locks) return;
  navigator.locks.request("familiada-keep-alive", { mode: "shared" }, () => new Promise(() => {}));
}

// Stan blokady wygaszania ekranu dla diagnostyki sesji (session-log.js):
// zapisujemy tylko zmiany (włączona, odmowa, brak obsługi, zwolnienie przez
// system przy widocznej karcie — np. tryb oszczędzania baterii).
const _wakeListeners = new Set();
let _wakeState = null;
function setWakeState(phase, extra = {}) {
  if (_wakeState?.phase === phase) return;
  _wakeState = { phase, ...extra };
  for (const listener of _wakeListeners) { try { listener(_wakeState); } catch {} }
}
export function onWakeLockChange(listener) {
  _wakeListeners.add(listener);
  if (_wakeState) listener(_wakeState);
  return () => _wakeListeners.delete(listener);
}

// Safari na iOS/iPadOS odmawia blokady bez gestu użytkownika
// (NotAllowedError zaraz po otwarciu strony — eksport 24.10, Prowadzący na
// iPadzie). Odmowę i zwolnienie przez system ponawiamy przy najbliższym
// dotknięciu, kliknięciu lub klawiszu; to te zdarzenia dają aktywację.
const GESTURE_EVENTS = ["pointerup", "touchend", "click", "keydown"];
const _gestureRetries = new Set();
let _gestureArmed = false;
function onUserGesture() {
  for (const retry of [..._gestureRetries]) {
    _gestureRetries.delete(retry);
    try { retry(); } catch {}
  }
  if (!_gestureRetries.size) disarmGestureRetry();
}
function disarmGestureRetry() {
  if (!_gestureArmed) return;
  _gestureArmed = false;
  for (const type of GESTURE_EVENTS) document.removeEventListener(type, onUserGesture, true);
}
function retryOnGesture(retry) {
  _gestureRetries.add(retry);
  if (_gestureArmed) return;
  _gestureArmed = true;
  for (const type of GESTURE_EVENTS) document.addEventListener(type, onUserGesture, { capture: true, passive: true });
}

let _wakeRequest = null;
function wakeLockHeld() {
  return !!_wakeLock && !_wakeLock.released;
}
function requestWakeLock() {
  if (wakeLockHeld() || document.hidden) return Promise.resolve();
  if (_wakeRequest) return _wakeRequest;
  _wakeRequest = (async () => {
    try {
      const lock = await navigator.wakeLock.request("screen");
      _wakeLock = lock;
      setWakeState("granted");
      lock.addEventListener?.("release", () => {
        // Ukrycie karty zwalnia blokadę zawsze (wraca przy widoczności);
        // zwolnienie przy widocznej karcie odnotowujemy i ponawiamy gestem.
        if (document.hidden) return;
        setWakeState("released");
        retryOnGesture(requestWakeLock);
      });
    } catch (error) {
      setWakeState("denied", { error_name: String(error?.name || "Error").slice(0, 40) });
      retryOnGesture(requestWakeLock);
    } finally {
      _wakeRequest = null;
    }
  })();
  return _wakeRequest;
}

async function acquireScreenWakeLock() {
  if (!navigator.wakeLock) { setWakeState("unsupported"); return; }
  // Re-acquire after tab becomes visible again (browser releases it automatically)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void requestWakeLock();
  });
  await requestWakeLock();
}

// Odpowiednik triku znanego z bibliotek typu NoSleep.js, bez osadzania
// żadnego pliku wideo: MediaStream z ukrytego <canvas> (captureStream) jako
// źródło <video muted playsinline loop autoplay>. Odtwarzanie WIDEO to
// historycznie najbardziej niezawodny sposób trzymania ekranu aktywnym na
// iOS/Android, niezależny od wsparcia Screen Wake Lock API — dokładnie
// to, na czym opierają się odtwarzacze wideo, żeby ekran nie gasł w
// trakcie odtwarzania. Działa jako DODATKOWY fallback OBOK
// acquireScreenWakeLock() (nie zamiennik) — tam, gdzie Wake Lock API jest
// dostępne, ekran i tak zostaje aktywny przez tamten mechanizm; to
// pokrywa starsze/niewspierane przeglądarki (np. iOS < 16.4), gdzie
// acquireScreenWakeLock() dziś cicho nic nie robi.
function startVideoWakeLockFallback() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext("2d")?.fillRect(0, 0, 1, 1);
    const stream = canvas.captureStream?.(1);
    if (!stream) return;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.loop = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("aria-hidden", "true");
    Object.assign(video.style, {
      position: "fixed", top: "0", left: "0", width: "1px", height: "1px",
      opacity: "0", pointerEvents: "none",
    });
    document.body.appendChild(video);

    // Bez gestu iOS potrafi odrzucić odtwarzanie — wtedy ponawiamy gestem.
    const play = () => video.play()?.catch?.(() => retryOnGesture(play));
    play();
    // Przeglądarki potrafią wstrzymać odtwarzanie ukrytej karty — tak samo
    // jak acquireScreenWakeLock() wyżej, wznawiamy po powrocie na widoczność.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) play();
    });
  } catch {}
}

function startSilentAudio() {
  try {
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(ctx.destination);
    src.start();
    // Resume after user gesture unlocks AudioContext
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && ctx.state === "suspended") ctx.resume();
    });
  } catch {}
}

export function startKeepAlive({ silentAudio = false, videoWakeLockFallback = true } = {}) {
  acquireWebLock();
  acquireScreenWakeLock();
  if (silentAudio) startSilentAudio();
  if (videoWakeLockFallback) startVideoWakeLockFallback();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) startTitleFlicker();
    else stopTitleFlicker();
  });

  if (document.hidden) startTitleFlicker();
}
