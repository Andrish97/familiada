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

  // #toolbar zajmuje realną, zmienną wysokość (1 wiersz na szerszym mobile,
  // 2 wiersze gdy przyciski się zawiną) -- drawer/overlay w CSS doliczają
  // to do --topbar-h, żeby nie zasłaniać toolbara. Mierzymy przy każdym
  // otwarciu (nie raz przy init), bo wysokość może się zmienić między
  // otwarciami (obrót ekranu, dojście do innej szerokości viewportu).
  function updateToolbarOffset() {
    const toolbarEl = document.getElementById("toolbar");
    const h = toolbarEl ? Math.ceil(toolbarEl.getBoundingClientRect().height) : 0;
    document.body.style.setProperty("--be-toolbar-h", `${h}px`);
  }

  function open() {
    updateToolbarOffset();
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
}

/**
 * Czy dany element jest w oknie czasowym tuż po dotykowym pointerdown, w
 * którym przeglądarka MOGŁABY sama wygenerować natywne zdarzenie
 * "contextmenu" niezależne od naszego JS-a (teoretyczne ryzyko na
 * prawdziwym touchscreenie, którego e2e -- oparte na syntetycznych
 * PointerEventach -- nie odtwarza). Wołający (desktopowy listener
 * "contextmenu" w actions.js) ma ignorować menu w tym oknie niezależnie od
 * tego czy nasz long-press "się udał" czy został anulowany ruchem.
 * Zaimplementowane jako WCZESNY GUARD wewnątrz JEDYNEGO listenera
 * "contextmenu" na danym elemencie (a nie jako osobny, konkurujący
 * listener) -- prostsze i odporne na kolejność rejestracji z
 * `wireActions()`, niezależnie od tego czy realny wyścig kiedykolwiek się
 * materializuje.
 */
export function isTouchContextMenuWindow(el) {
  const t = touchDownAt.get(el);
  return typeof t === "number" && (Date.now() - t) < LONG_PRESS_MS + 300;
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
