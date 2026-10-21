// base-explorerjs/platform.js
// Różnice systemów w jednym miejscu: Mac (⌘, ⌥) kontra Windows/Linux (Ctrl).
// Skróty klawiszowe rozpoznawane po e.code (fizyczny klawisz), więc działają
// przy każdym układzie klawiatury (np. ukraińskim) i z Option na Macu.

export const IS_MAC = typeof navigator !== "undefined"
  && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

// Ctrl (Win/Linux) / ⌘ (Mac): dokładanie do zaznaczenia i skróty.
export function isModKey(ev) {
  return IS_MAC ? !!ev?.metaKey : !!ev?.ctrlKey;
}

// Kopia przy przeciąganiu: Option (Mac) / Ctrl (Win/Linux), jak w systemie.
export function isCopyDragModifier(ev) {
  return IS_MAC ? !!ev?.altKey : (!!ev?.ctrlKey || !!ev?.metaKey);
}

// Skrót: { key: "KeyC" | "Delete" | "F2" | …, mod?, shift?, alt? }
// (key = KeyboardEvent.code).
export function matchShortcut(ev, sc) {
  if (!sc || !ev) return false;
  if (ev.code !== sc.key) return false;
  return isModKey(ev) === !!sc.mod && !!ev.shiftKey === !!sc.shift && !!ev.altKey === !!sc.alt;
}

const KEY_LABEL = {
  Delete: { win: "Delete", mac: "Fn⌫" },
  Enter: { win: "Enter", mac: "⏎" },
  Backspace: { win: "Backspace", mac: "⌫" },
  Escape: { win: "Esc", mac: "Esc" },
};

// Tekst skrótu do dymku i menu: „Ctrl+Shift+N” / „⌘⇧N”.
export function formatShortcut(sc) {
  if (!sc) return "";
  const keyName = KEY_LABEL[sc.key]?.[IS_MAC ? "mac" : "win"]
    || String(sc.key).replace(/^Key/, "").replace(/^Digit/, "");
  if (IS_MAC) {
    return `${sc.mod ? "⌘" : ""}${sc.alt ? "⌥" : ""}${sc.shift ? "⇧" : ""}${keyName}`;
  }
  return [sc.mod && "Ctrl", sc.alt && "Alt", sc.shift && "Shift", keyName].filter(Boolean).join("+");
}
