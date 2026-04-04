/**
 * cache-bust.js – globalny cache-buster dla fetch() assetów.
 * Czyta version.txt (aktualizowany przy KAŻDYM deployu).
 * Używaj: const url = await v('/display/font_5x7.json');
 * 
 * FALLBACK: Jeśli version.txt nie jest dostępny, używa timestampu.
 */
let _cbVersion = null;
let _cbFetchPromise = null;
const FALLBACK_VERSION = `v${Date.now()}`;

export async function cacheBustVersion() {
  // Jeśli już mamy wersję, zwróć ją
  if (_cbVersion) return _cbVersion;
  
  // Jeśli już fetchujemy, poczekaj na ten sam promise
  if (_cbFetchPromise) return _cbFetchPromise;
  
  // Stwórz nowy promise i fetchuj
  _cbFetchPromise = (async () => {
    try {
      const res = await fetch('/version.txt', { 
        cache: 'no-store',
        // Timeout 3 sekundy
        signal: AbortSignal.timeout(3000)
      });
      
      if (res.ok) {
        const version = (await res.text()).trim();
        if (version) {
          _cbVersion = version;
          return _cbVersion;
        }
      }
    } catch (err) {
      console.warn('[cache-bust] Nie udało się pobrać version.txt, używam fallback:', err.message);
    }
    
    // Fallback - timestamp
    _cbVersion = FALLBACK_VERSION;
    return _cbVersion;
  })();
  
  const result = await _cbFetchPromise;
  _cbFetchPromise = null; // Reset dla kolejnych wywołań
  return result;
}

/** Dodaje ?v=<version> do URL assetu. */
export async function v(url) {
  const ver = await cacheBustVersion();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${ver}`;
}
