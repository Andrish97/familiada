// rename-gesture.js
// Desktop: dblclick → callback
// Mobile:  double-tap (two taps within 300ms) → callback

const DOUBLE_TAP_MS = 300;

export function addRenameGesture(el, callback) {
  // desktop
  el.addEventListener("dblclick", callback);

  // mobile double-tap
  let lastTap = 0;
  el.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTap < DOUBLE_TAP_MS) {
      e.preventDefault(); // zapobiega zoom na double-tap (iOS/Android)
      callback(e);
      lastTap = 0;
    } else {
      lastTap = now;
    }
  }, { passive: false });
}
