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
  _originalTitle = document.title;
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

export function startKeepAlive({ silentAudio = false } = {}) {
  acquireWebLock();
  acquireScreenWakeLock();
  if (silentAudio) startSilentAudio();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) startTitleFlicker();
    else stopTitleFlicker();
  });

  if (document.hidden) startTitleFlicker();
}
