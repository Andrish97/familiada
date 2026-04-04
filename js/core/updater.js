/**
 * js/core/updater.js
 * Automatyczne sprawdzanie nowej wersji aplikacji.
 * Jeśli wersja z version.txt na serwerze różni się od lokalnej,
 * skrypt odświeża stronę TYLKO RAZ na sesję.
 */

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minut
let currentVersion = null;
let hasReloadedThisSession = false;

export function initUpdater() {
  // Sprawdź czy już przeładowano w tej sesji
  const syncedVersion = sessionStorage.getItem('syncedVersion');
  if (syncedVersion) {
    // Już synchronizowaliśmy - używamy wersji z serwera
    currentVersion = syncedVersion;
  } else {
    // Pobierz aktualną wersję z meta tagu
    const meta = document.querySelector('meta[name="app-version"]');
    if (meta) {
      currentVersion = meta.getAttribute('content');
    }
  }

  if (!currentVersion) return;

  // Rozpocznij cykliczne sprawdzanie
  setInterval(checkForUpdates, CHECK_INTERVAL);

  // Sprawdź też przy powrocie do karty
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !hasReloadedThisSession) checkForUpdates();
  });
}

async function checkForUpdates() {
  if (hasReloadedThisSession) return;

  try {
    const res = await fetch(`/version.txt?t=${Date.now()}`, {
      cache: 'no-store'
    });

    if (!res.ok) return;

    const serverVersion = (await res.text()).trim();
    if (!serverVersion) return;

    if (currentVersion && serverVersion !== currentVersion) {
      const isSensitivePage =
        location.pathname.includes('host.html') ||
        location.pathname.includes('control.html') ||
        location.pathname.includes('buzzer.html');

      if (isSensitivePage) {
        return;
      }

      // Zaznacz że przeładowano - TYLKO RAZ na sesję
      hasReloadedThisSession = true;

      setTimeout(() => {
        // Po przeładowaniu zapamiętaj wersję z serwera
        sessionStorage.setItem('syncedVersion', serverVersion);
        // Wymuś hard reload - cache bust w URL
        const url = new URL(location.href);
        url.searchParams.set('_r', Date.now());
        location.href = url.toString();
      }, 3000);
    }
  } catch (err) {
    console.warn('[updater] Błąd:', err.message);
  }
}
