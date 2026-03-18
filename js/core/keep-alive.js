/**
 * keep-alive.js
 * Prevents browser from throttling background tabs.
 * - Flickers document title to keep JS timers alive
 * - Acquires a Web Lock to prevent CPU throttling (Chrome/Edge)
 */

let _titleInterval = null;
let _originalTitle = document.title;
let _dot = true;

function startTitleFlicker() {
  if (_titleInterval) return;
  _originalTitle = document.title;
  _titleInterval = setInterval(() => {
    document.title = _dot ? "● " + _originalTitle : "  " + _originalTitle;
    _dot = !_dot;
  }, 1000);
}

function stopTitleFlicker() {
  clearInterval(_titleInterval);
  _titleInterval = null;
  document.title = _originalTitle;
}

function acquireWakeLock() {
  if (!navigator.locks) return;
  // Holds an infinite lock – released only when page unloads
  navigator.locks.request("familiada-keep-alive", { mode: "shared" }, () => new Promise(() => {}));
}

export function startKeepAlive() {
  acquireWakeLock();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      startTitleFlicker();
    } else {
      stopTitleFlicker();
    }
  });

  // Start immediately if already hidden (e.g. opened in background tab)
  if (document.hidden) startTitleFlicker();
}
