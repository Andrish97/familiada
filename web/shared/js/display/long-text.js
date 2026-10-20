// Długie pola Wyświetlacza (long1/long2 -- nazwy drużyn): 95 kolumn kropek,
// każdy znak czcionki 5×7 zajmuje 5 kolumn i 1 kolumnę przerwy, więc mieści
// się dokładnie 16 znaków (16·5 + 15 = 95). Wspólne dla Wyświetlacza
// (rysowanie) i ustawień gry (licznik i limit pola nazwy drużyny).

export const LONG_COLS = 95;
export const LONG_CHAR_W = 5;
export const LONG_GAP = 1;
export const LONG_MAX_CHARS = Math.floor((LONG_COLS + LONG_GAP) / (LONG_CHAR_W + LONG_GAP));

/** Znaki tak, jak narysuje je Wyświetlacz (wielkie litery, pełne znaki Unicode). */
export const longTextChars = (text) => Array.from(String(text ?? "").toUpperCase());

/** { count, max, fits, invalid[] } -- invalid: znaki bez glifu w czcionce Wyświetlacza. */
export function measureLongText(text, glyphs) {
  const chars = longTextChars(text);
  const invalid = glyphs ? [...new Set(chars.filter((ch) => ch !== " " && !glyphs.has(ch)))] : [];
  return { count: chars.length, max: LONG_MAX_CHARS, fits: chars.length <= LONG_MAX_CHARS, invalid };
}

/** Najdłuższy początek napisu, który zmieści się w długim polu. */
export function clipLongText(text) {
  const source = Array.from(String(text ?? ""));
  let out = "";
  for (const ch of source) {
    if (longTextChars(out + ch).length > LONG_MAX_CHARS) break;
    out += ch;
  }
  return out;
}
