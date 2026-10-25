// Rodzaj urządzenia na <html> (E23, silnik-stylow-projekt.md §3.3): jedno
// źródło dla CSS i JS zamiast zapytań udających wykrywanie urządzenia.
//   data-device      phone | tablet | desktop | tv  (getDeviceProfile)
//   data-input       touch | pointer
//   data-orientation portrait | landscape
//   data-compact     układ telefonu: telefon albo okno do 600 px
//   data-sheet       okna od dołu: dotyk (bez TV) albo okno do 600 px
//   data-keyboard    klawiatura ekranowa otwarta (dotyk, aktywne pole i okno
//                    niższe o ponad KEYBOARD_MIN px): stopka znika, aktywne
//                    pole przewija się do widoku w swoim kontenerze
// Ładowany jako pierwszy moduł strony; body jest ukryte (page-loading),
// dopóki strona się nie złoży, więc atrybuty są przed pierwszym widokiem.
import { getDeviceProfile, editableFocused } from "./device-guard.js?v=v2026-10-25T18504";

export const NARROW_MAX = 600;

export function deviceLayout(profile = getDeviceProfile()) {
  const narrow = profile.viewportWidth <= NARROW_MAX;
  return {
    device: profile.formFactor,
    input: profile.touch ? "touch" : "pointer",
    orientation: profile.orientation,
    compact: profile.formFactor === "phone" || narrow,
    sheet: (profile.touch && profile.formFactor !== "tv") || narrow,
  };
}

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

// Klawiatura: okno (resizes-content) albo widoczna część (visualViewport)
// niższe niż najwyższe zapamiętane przy tej szerokości.
const KEYBOARD_MIN = 120;
let fullHeight = { width: 0, height: 0 };

function viewHeight() {
  return Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
}

function applyKeyboard() {
  const root = document.documentElement;
  const h = viewHeight();
  if (window.innerWidth !== fullHeight.width) fullHeight = { width: window.innerWidth, height: h };
  const typing = root.dataset.input === "touch" && editableFocused();
  if (!typing || h > fullHeight.height) fullHeight.height = Math.max(fullHeight.height, h);
  const open = typing && fullHeight.height - h > KEYBOARD_MIN;
  if (root.hasAttribute("data-keyboard") === open) return;
  root.toggleAttribute("data-keyboard", open);
  if (open) requestAnimationFrame(() => document.activeElement?.scrollIntoView?.({ block: "nearest" }));
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
  window.visualViewport?.addEventListener("resize", applyKeyboard, { passive: true });
  document.addEventListener("focusin", () => requestAnimationFrame(applyKeyboard));
  document.addEventListener("focusout", () => requestAnimationFrame(applyKeyboard));
}
