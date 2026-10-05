// A single dot marks a word cut by the board's fixed character capacity.
// Keep all slots when the following character is a word separator.
export function clipDisplayText(value, capacity) {
  const chars = Array.from(String(value ?? "").normalize("NFC"));
  if (chars.length <= capacity) return chars.join("");
  const boundary = /[\s\p{P}]/u;
  const prefix = chars.slice(0, capacity).join("");
  if (boundary.test(chars[capacity]) || boundary.test(chars[capacity - 1])) return prefix;
  return chars.slice(0, capacity - 1).join("") + ".";
}
