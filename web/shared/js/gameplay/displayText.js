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
