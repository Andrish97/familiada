// Bezpieczne wartości do szablonów HTML. Cudzysłowy są kodowane także w
// węzłach tekstowych, żeby wynik był zgodny z dotychczasowymi widokami.
export function escapeHtmlText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

export const escapeHtmlAttribute = escapeHtmlText;
