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

async function acquireScreenWakeLock() {
  if (!navigator.wakeLock) return;
  try {
    _wakeLock = await navigator.wakeLock.request("screen");
    // Re-acquire after tab becomes visible again (browser releases it automatically)
    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden && _wakeLock?.released) {
        try { _wakeLock = await navigator.wakeLock.request("screen"); } catch {}
      }
    });
  } catch {}
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

    const play = () => video.play().catch(() => {});
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

export function startKeepAlive({ silentAudio = false, videoWakeLockFallback = false } = {}) {
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
