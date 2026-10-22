// A single dot marks a word cut by the board's fixed character capacity.
// Keep all slots when the following character is a word separator.
export function clipDisplayText(value, capacity) {
  const chars = Array.from(String(value ?? "").normalize("NFC"));
  if (chars.length <= capacity) return chars.join("");
  const boundary = /[\s\p{P}]/u;
  const prefix = chars.slice(0, capacity).join("");
  if (boundary.test(chars[capacity]) || boundary.test(chars[capacity - 1])) return prefix;
  const shortened = chars.slice(0, capacity - 1);
  const vowel = /^[aeiouyąęóаеиіоуяюєїыэё]$/iu;
  // Remove at most two trailing vowels only when cutting inside a word.
  for (let i = 0; i < 2 && vowel.test(shortened.at(-1) || ""); i++) shortened.pop();
  return shortened.join("") + ".";
}

// Podział tekstu na litery, które Wyświetlacz pokaże (`kept`), i te, które
// odpadną przy skracaniu (`cut`) — do podświetlania w Control. `shown` to
// dokładnie to, co pokaże Wyświetlacz (z kropką skrótu).
export function splitDisplayText(value, capacity) {
  const chars = Array.from(String(value ?? "").normalize("NFC"));
  const all = chars.join("");
  if (chars.length <= capacity) return { kept: all, cut: "", shown: all, clipped: false };
  const shown = clipDisplayText(all, capacity);
  const prefix = chars.slice(0, capacity).join("");
  const keptLen = shown === prefix ? capacity : Array.from(shown).length - 1;
  return { kept: chars.slice(0, keptLen).join(""), cut: chars.slice(keptLen).join(""), shown, clipped: true };
}

// Fragmenty tekstu do podświetlenia w Control: "bad" — znak spoza fontu
// Wyświetlacza (pomijany razem z jedną spacją za nim, jak dropUnsupported),
// "kept" — litery widoczne na Wyświetlaczu, "cut" — litery, które odpadną
// przy skracaniu. isSupported(ch) — czy font ma znak (null: wszystkie).
export function displayTextSegments(value, capacity, isSupported = null) {
  const chars = Array.from(String(value ?? "").normalize("NFC"));
  const kinds = new Array(chars.length);
  const supportedIdx = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!isSupported || /\s/.test(ch) || isSupported(ch)) { kinds[i] = "ok"; supportedIdx.push(i); continue; }
    kinds[i] = "bad";
    if (chars[i + 1] === " ") kinds[++i] = "skip";
  }
  const supported = supportedIdx.map((i) => chars[i]).join("");
  const { kept } = splitDisplayText(supported, capacity);
  const keptCount = Array.from(kept).length;
  supportedIdx.forEach((orig, j) => { kinds[orig] = j < keptCount ? "kept" : "cut"; });
  const segments = [];
  chars.forEach((ch, i) => {
    const kind = kinds[i] === "skip" ? "bad" : kinds[i];
    const last = segments.at(-1);
    if (last && last.kind === kind && kind !== "bad") last.text += ch;
    else segments.push({ kind, text: ch });
  });
  return segments;
}
