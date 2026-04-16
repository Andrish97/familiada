/**
 * cache-bust.js – globalny cache-buster dla fetch() assetów.
 * Czyta version.txt (aktualizowany przy KAŻDYM deployu).
 * Używaj: const url = await v('/display/font_5x7.json');
 * 
 * FALLBACK: Jeśli version.txt nie jest dostępny, używa свеżego timestampu.
 */
let _cbVersion = null;
let _cbFetchPromise = null;

export async function cacheBustVersion() {
  if (_cbVersion) return _cbVersion;
  if (_cbFetchPromise) return _cbFetchPromise;
  
  _cbFetchPromise = (async () => {
    try {
      const res = await fetch('/version.txt', { 
        cache: 'no-store',
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
      console.warn('[cache-bust] version.txt недоступен, używam свеżego timestampu');
    }
    
    _cbVersion = `v${Date.now()}`;
    return _cbVersion;
  })();
  
  const result = await _cbFetchPromise;
  _cbFetchPromise = null;
  return result;
}

/** Dodaje ?v=<version> do URL assetu. */
export async function v(url) {
  const ver = await cacheBustVersion();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${ver}`;
}
