/**
 * js/core/updater.js
 * Automatyczne sprawdzanie nowej wersji aplikacji.
 * Jeśli hash pliku settings.js na serwerze różni się od lokalnego,
 * skrypt odświeża stronę.
 */

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minut
let currentVersion = null;

export function initUpdater() {
  // Pobierz aktualną wersję z meta tagu (jeśli istnieje)
  const meta = document.querySelector('meta[name="app-version"]');
  if (meta) {
    currentVersion = meta.getAttribute('content');
  }

  if (!currentVersion) {
    console.log('[Updater] No version found, skipping auto-update');
    return;
  }

  // Rozpocznij cykliczne sprawdzanie
  setInterval(checkForUpdates, CHECK_INTERVAL);

  // Sprawdź też przy powrocie do karty
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdates();
  });
}

async function checkForUpdates() {
  try {
    // Fetch settings.js HEAD request to check if it changed
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`/settings.js`, { 
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) return;

    // Get Last-Modified header as version indicator
    const lastModified = res.headers.get('last-modified');
    const serverVersion = lastModified;
    
    if (!serverVersion) return;

    if (currentVersion && serverVersion !== currentVersion) {
      console.log(`[Updater] Nowa wersja wykryta: ${serverVersion} (obecna: ${currentVersion})`);

      const isSensitivePage =
        location.pathname.includes('host.html') ||
        location.pathname.includes('control.html') ||
        location.pathname.includes('buzzer.html');

      if (!isSensitivePage) {
        setTimeout(() => {
          if (document.hidden) location.reload();
          else location.reload();
        }, 5000);
      } else {
        console.log('[Updater] Strona wrażliwa, czekam na przejście w tło do aktualizacji.');
      }
    }
  } catch (err) {
    // ignoruj błędy sieciowe
  }
}
