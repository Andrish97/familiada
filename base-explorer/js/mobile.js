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
// el -> timestamp ostatniego pointerdown dotykiem/rysikiem (do
// isTouchContextMenuWindow, patrz niżej).
const touchDownAt = new WeakMap();

export function addLongPress(el, callback) {
  if (!el) return;

  let timer = null;
  let startX = 0;
  let startY = 0;

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  el.addEventListener("pointerdown", (e) => {
    // tylko dotyk lub stylus (nie mysz — mysz ma contextmenu)
    if (e.pointerType === "mouse") return;

    cancel();
    startX = e.clientX;
    startY = e.clientY;
    touchDownAt.set(el, Date.now());

    timer = setTimeout(() => {
      timer = null;
      console.warn("[lp-diag] TIMER FIRED -- callback(showContextMenu) wywołany mimo ruchu/upu");
      callback(e.clientX, e.clientY, e.target);
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist > MOVE_THRESHOLD) {
      console.warn(`[lp-diag] pointermove cancel: dist=${dist} timerWas=${!!timer}`);
      cancel();
    }
  }, { passive: true });

  el.addEventListener("pointerup", cancel, { passive: true });
  el.addEventListener("pointercancel", cancel, { passive: true });
}

/**
 * Czy dany element jest w oknie czasowym tuż po dotykowym pointerdown, w
 * którym przeglądarka może sama wygenerować NATYWNE zdarzenie "contextmenu"
 * (własna, niezależna od tego JS-a detekcja przytrzymania dotyku — nasz
 * `fired`/`timer` z addLongPress() bywa w tym momencie już poprawnie
 * anulowany przez ruch palca, a natywne menu i tak przychodzi, patrz run
 * #81). Wołający (desktopowy listener "contextmenu" w actions.js) ma
 * ZAWSZE ignorować menu w tym oknie, niezależnie od tego czy nasz
 * long-press "się udał" czy został anulowany — w obu przypadkach jest
 * niechciane. Świadomie zaimplementowane jako WCZESNY GUARD wewnątrz
 * JEDYNEGO listenera "contextmenu" na danym elemencie, a nie jako osobny,
 * konkurujący listener (jak w poprzedniej wersji, run #82's poprawka
 * capture-phase) — dwa listenery tego samego typu zdarzenia na tym samym
 * elemencie potrafią odpalić się w kolejności REJESTRACJI zamiast
 * kolejności faz (capture/bubble) zawsze wtedy, gdy element jest
 * bezpośrednim `target`-em zdarzenia (tzw. AT_TARGET), więc capture-phase
 * nie dawało twardej gwarancji pierwszeństwa. Jeden listener eliminuje ten
 * wyścig całkowicie.
 */
export function isTouchContextMenuWindow(el) {
  const t = touchDownAt.get(el);
  const result = typeof t === "number" && (Date.now() - t) < LONG_PRESS_MS + 300;
  console.warn(`[lp-diag] isTouchContextMenuWindow: hasTimestamp=${typeof t === "number"} elapsed=${typeof t === "number" ? Date.now() - t : "n/a"} result=${result}`);
  return result;
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
