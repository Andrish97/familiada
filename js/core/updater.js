/**
 * js/core/updater.js
 * Automatyczne sprawdzanie nowej wersji aplikacji.
 * Jeśli wersja z version.txt na serwerze różni się od lokalnej,
 * skrypt odświeża stronę.
 */

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minut
let currentVersion = null;

export function initUpdater() {
  // Pobierz aktualną wersję z meta tagu
  const meta = document.querySelector('meta[name="app-version"]');
  if (meta) {
    currentVersion = meta.getAttribute('content');
  }

  if (!currentVersion) {
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
    // Fetch version.txt from server
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

      if (!isSensitivePage) {
        setTimeout(() => {
          location.reload();
        }, 5000);
      } else {
      }
    }
  } catch (err) {
    // ignoruj błędy sieciowe
  }
}
