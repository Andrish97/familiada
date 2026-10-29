// Rodzaj urządzenia na <html> (E23, silnik-stylow-projekt.md §3.3): jedno
// źródło dla CSS i JS zamiast zapytań udających wykrywanie urządzenia.
//   data-device      phone | tablet | desktop | tv  (getDeviceProfile)
//   data-input       touch | pointer
//   data-orientation portrait | landscape
//   data-compact     układ telefonu: telefon albo okno do 600 px
//   data-sheet       okna od dołu: dotyk (bez TV) albo okno do 600 px
//   data-keyboard    klawiatura ekranowa otwarta (dotyk, aktywne pole);
//                    --keyboard-h: jej wysokość (zapas pod treścią długiej
//                    strony, żeby dało się podnieść pole z samego dołu)
// Początkowe atrybuty ustawia klasyczny page-boot.js; ten moduł je aktualizuje.
import "./page-layout.js?v=v2026-10-29T13493";
import { editableFocused } from "./device-guard.js?v=v2026-10-29T13493";

export const { NARROW_MAX, deviceLayout } = globalThis.FamilijnaDevice;

let current = null;

function apply() {
  const root = document.documentElement;
  const next = deviceLayout();
  root.dataset.device = next.device;
  root.dataset.input = next.input;
  root.dataset.orientation = next.orientation;
  root.toggleAttribute("data-compact", next.compact);
  root.toggleAttribute("data-sheet", next.sheet);
  const changed = !current || Object.keys(next).some((key) => next[key] !== current[key]);
  current = next;
  if (changed) document.dispatchEvent(new CustomEvent("device:change", { detail: next }));
}

// Klawiatura zasłania stronę, nie zmienia układu (decyzja użytkownika
// 2026-10-29): meta viewport interactive-widget=resizes-visual. Tam, gdzie
// jest VirtualKeyboard API (Chrome na Androidzie), przejmujemy ustawienie
// widoku (overlaysContent): przeglądarka nic nie przesuwa, a strona jednym
// płynnym ruchem stawia aktywne pole tuż nad klawiaturą — tylko gdy
// klawiatura by je zasłoniła. Bez API (np. Safari) przesuwa przeglądarka.
const vk = typeof navigator !== "undefined" ? navigator.virtualKeyboard : null;
const KEYBOARD_MIN = 120;
const FIELD_GAP = 12; // odstęp pola od klawiatury
let fullHeight = { width: 0, height: 0 };

function viewHeight() {
  return Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
}

/** Wysokość klawiatury w px (0, gdy zamknięta). */
function keyboardHeight() {
  if (vk?.overlaysContent) return Math.round(vk.boundingRect?.height || 0);
  const h = viewHeight();
  if (window.innerWidth !== fullHeight.width) fullHeight = { width: window.innerWidth, height: h };
  if (!editableFocused() || h > fullHeight.height) fullHeight.height = Math.max(fullHeight.height, h);
  const covered = fullHeight.height - h;
  return covered > KEYBOARD_MIN ? covered : 0;
}

const scrollable = (node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight;

/** Przesuń pole tuż nad klawiaturę, jeśli je zasłania: kontenery, okno od
 * dołu (podjeżdża, gdy treść nie ma dokąd się przewinąć), potem strona. */
function revealAboveKeyboard(el, kb) {
  const rect = el.getBoundingClientRect();
  const topbarBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
  // Pole wyższe niż widoczna część: jego górny brzeg zostaje pod paskiem.
  let delta = Math.min(rect.bottom - (window.innerHeight - kb - FIELD_GAP), rect.top - topbarBottom - FIELD_GAP);
  if (delta <= 0) return;
  for (let node = el.parentElement; node && node !== document.body && delta > 0; node = node.parentElement) {
    if (!scrollable(node)) continue;
    const step = Math.min(delta, node.scrollHeight - node.clientHeight - node.scrollTop);
    if (step > 0) { node.scrollBy({ top: step, behavior: "smooth" }); delta -= step; }
  }
  if (delta <= 0) return;
  const sheet = el.closest(".modal--sheet.sheet-active");
  if (sheet) {
    const shift = Math.min(kb, (parseFloat(sheet.style.getPropertyValue("--sheet-keyboard")) || 0) + delta);
    sheet.style.setProperty("--sheet-keyboard", `${Math.round(shift)}px`);
    sheet.classList.add("sheet-keyboard");
  } else window.scrollBy({ top: delta, behavior: "smooth" });
}

/** Klawiatura zamknięta: okno od dołu zjeżdża na swoje miejsce. */
function settleSheets() {
  for (const sheet of document.querySelectorAll(".modal--sheet.sheet-keyboard")) sheet.style.setProperty("--sheet-keyboard", "0px");
}

// Jedno ustawienie naraz: płynne przewijanie trwa, a pomiar w jego trakcie
// przesunąłby pole za daleko.
const SCROLL_MS = 450;
let revealTimer = 0;
let revealUntil = 0;
function scheduleReveal() {
  if (!vk?.overlaysContent) return;
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    if (keyboardH <= 0 || !editableFocused()) return;
    revealAboveKeyboard(document.activeElement, keyboardH);
    revealUntil = Date.now() + SCROLL_MS;
  }, Math.max(0, revealUntil - Date.now()));
}

let keyboardH = 0;
function applyKeyboard() {
  const root = document.documentElement;
  const covered = keyboardHeight(); // zawsze: zapamiętuje pełną wysokość okna
  const kb = root.dataset.input === "touch" && editableFocused() ? covered : 0;
  if (kb === keyboardH) return;
  keyboardH = kb;
  root.toggleAttribute("data-keyboard", kb > 0);
  root.style.setProperty("--keyboard-h", `${kb}px`);
  if (kb > 0) scheduleReveal();
  else settleSheets();
}

/** Inne pole przy otwartej klawiaturze: to samo ustawienie bez czekania na zmianę klawiatury. */
function onFocusIn() {
  requestAnimationFrame(() => {
    applyKeyboard();
    if (keyboardH > 0) scheduleReveal();
  });
}

/** Układ telefonu (data-compact). */
export const isCompactLayout = () => document.documentElement.hasAttribute("data-compact");
/** Okna od dołu (data-sheet). */
export const isSheetLayout = () => document.documentElement.hasAttribute("data-sheet");

/** Zmiana układu (obrót, zmiana okna): fn(layout). */
export function onDeviceChange(fn) {
  document.addEventListener("device:change", (event) => fn(event.detail));
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  apply();
  applyKeyboard();
  window.addEventListener("resize", () => { apply(); applyKeyboard(); }, { passive: true });
  window.addEventListener("orientationchange", apply);
  if (vk) {
    try { vk.overlaysContent = true; } catch {}
    vk.addEventListener?.("geometrychange", applyKeyboard);
  }
  window.visualViewport?.addEventListener("resize", applyKeyboard, { passive: true });
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", () => requestAnimationFrame(applyKeyboard));
}
