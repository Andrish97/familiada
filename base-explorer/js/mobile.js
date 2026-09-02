// base-explorer/js/mobile.js
// Obsługa mobilna: drawer lewego panelu + długie tapnięcie jako zamiennik PPM

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10; // px — anuluj long press jeśli palec się przesunął
const DOUBLE_TAP_MS = 300; // max ms między tapnięciami

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
    console.log("[longpress-diag] cancel() called, timer was:", !!timer);
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
    // DIAGNOSTYKA TYMCZASOWA (run #78/#79 -- test "long-press anulowany
    // przez ruch palca" nadal pada mimo dwóch prób naprawy w samym teście;
    // statyczna analiza tego pliku nie znalazła buga, więc sprawdzamy na
    // żywo w CI, gdzie dokładnie się rozjeżdża). Usunąć po zdiagnozowaniu.
    console.log("[longpress-diag] pointerdown", { x: e.clientX, y: e.clientY, target: e.target?.className });

    timer = setTimeout(() => {
      fired = true;
      timer = null;
      console.log("[longpress-diag] TIMER FIRED -- callback wywołany mimo (ewentualnego) ruchu");
      callback(e.clientX, e.clientY, e.target);
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.hypot(dx, dy);
    console.log("[longpress-diag] pointermove", { dx, dy, dist, willCancel: dist > MOVE_THRESHOLD, timerActive: !!timer });
    if (dist > MOVE_THRESHOLD) cancel();
  }, { passive: true });

  el.addEventListener("pointerup", (e) => {
    console.log("[longpress-diag] pointerup, timerActive:", !!timer);
    cancel();
  }, { passive: true });
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

/* ================= Double tap ================= */

/**
 * Emuluje dblclick dla urządzeń dotykowych.
 * Wywołuje callback(target) przy dwóch tapnięciach w DOUBLE_TAP_MS ms.
 */
export function addDoubleTap(el, callback) {
  if (!el) return;
  let lastTap = 0;
  let lastTarget = null;

  el.addEventListener("touchend", (e) => {
    const now = Date.now();
    const target = e.target;
    if (now - lastTap < DOUBLE_TAP_MS && lastTarget === target) {
      e.preventDefault();
      callback(target);
      lastTap = 0;
    } else {
      lastTap = now;
      lastTarget = target;
    }
  }, { passive: false });
}

/**
 * Na urządzeniach dotykowych HTML5 DnD nie działa poprawnie.
 * Wyłączamy przez CSS — bez dotykania atrybutu draggable (żeby desktop działał normalnie).
 */
export function disableDragOnTouch() {
  if (!isTouchDevice()) return;

  const style = document.createElement("style");
  style.textContent = `[draggable="true"] { -webkit-user-drag: none; }`;
  document.head.appendChild(style);
}

export function isTouchDevice() {
  // coarse = dotyk/rysik, fine = mysz/touchpad
  // any-pointer:fine oznacza że jest też mysz — wtedy traktujemy jako desktop
  return window.matchMedia("(pointer: coarse) and (hover: none)").matches;
}
