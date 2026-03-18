// base-explorer/js/mobile.js
// Obsługa mobilna: drawer lewego panelu + długie tapnięcie jako zamiennik PPM

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10; // px — anuluj long press jeśli palec się przesunął

/* ================= Drawer ================= */

export function initDrawer() {
  const btn = document.getElementById("btnDrawerToggle");
  const panel = document.getElementById("explorerLeft");
  const overlay = document.getElementById("drawerOverlay");
  if (!btn || !panel || !overlay) return;

  function open() {
    panel.classList.add("is-open");
    overlay.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function close() {
    panel.classList.remove("is-open");
    overlay.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  btn.addEventListener("click", () => {
    panel.classList.contains("is-open") ? close() : open();
  });

  overlay.addEventListener("click", close);

  // Zamknij drawer po wyborze folderu/tagu (klik w lewy panel)
  panel.addEventListener("click", (e) => {
    if (!panel.classList.contains("is-open")) return;
    // zamknij tylko jeśli kliknięto w wiersz (folder/tag), nie w scrollbar
    if (e.target?.closest?.(".row")) close();
  });
}

/* ================= Long press → context menu ================= */

/**
 * Dodaje obsługę długiego tapnięcia na elemencie.
 * Wywołuje callback(x, y, target) po LONG_PRESS_MS ms bez ruchu.
 * Nie blokuje normalnych kliknięć.
 */
export function addLongPress(el, callback) {
  if (!el) return;

  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
    fired = false;
  }

  el.addEventListener("pointerdown", (e) => {
    // tylko dotyk lub stylus (nie mysz — mysz ma contextmenu)
    if (e.pointerType === "mouse") return;

    cancel();
    fired = false;
    startX = e.clientX;
    startY = e.clientY;

    timer = setTimeout(() => {
      fired = true;
      timer = null;
      // wibracja jeśli dostępna
      try { navigator.vibrate?.(40); } catch {}
      callback(e.clientX, e.clientY, e.target);
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD) cancel();
  }, { passive: true });

  el.addEventListener("pointerup", cancel, { passive: true });
  el.addEventListener("pointercancel", cancel, { passive: true });

  // Zablokuj natywne context menu na touch (iOS/Android)
  el.addEventListener("contextmenu", (e) => {
    if (fired) {
      e.preventDefault();
      e.stopPropagation();
      fired = false;
    }
  });
}

/* ================= DnD — wyłącz na touch ================= */

/**
 * Na urządzeniach dotykowych HTML5 DnD nie działa poprawnie.
 * Wyłączamy atrybut draggable na wszystkich wierszach listy/drzewa.
 */
export function disableDragOnTouch() {
  if (!isTouchDevice()) return;

  // Obserwuj zmiany DOM (render.js dynamicznie buduje wiersze)
  const observer = new MutationObserver(() => {
    document.querySelectorAll('[draggable="true"]').forEach(el => {
      el.setAttribute("draggable", "false");
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Też od razu dla już istniejących
  document.querySelectorAll('[draggable="true"]').forEach(el => {
    el.setAttribute("draggable", "false");
  });
}

export function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches;
}
