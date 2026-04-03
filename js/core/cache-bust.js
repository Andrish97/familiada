/**
 * cache-bust.js – globalny cache-buster dla fetch() assetów.
 * Czyta version.txt (aktualizowany przy KAŻDYM deployu).
 * Używaj: const url = await v('/display/font_5x7.json');
 */
let _cbVersion = null;

export async function cacheBustVersion() {
  if (_cbVersion) return _cbVersion;
  try {
    const res = await fetch('/version.txt', { cache: 'no-store' });
    if (res.ok) {
      _cbVersion = (await res.text()).trim();
      return _cbVersion;
    }
  } catch { /* fallback */ }
  _cbVersion = 'v' + Date.now();
  return _cbVersion;
}

/** Dodaje ?v=<version> do URL assetu. */
export async function v(url) {
  const ver = await cacheBustVersion();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${ver}`;
}
