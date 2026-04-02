/**
 * js/core/updater.js
 * Automatyczne sprawdzanie nowej wersji aplikacji.
 * Jeśli wersja na serwerze (version.txt) różni się od lokalnej (meta app-version),
 * skrypt odświeża stronę.
 */

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minut
let currentVersion = null;

export function initUpdater() {
  // Pobierz aktualną wersję z meta tagu
  const meta = document.querySelector('meta[name="app-version"]');
  if (!meta) return;
  currentVersion = meta.getAttribute('content');

  // Rozpocznij cykliczne sprawdzanie
  setInterval(checkForUpdates, CHECK_INTERVAL);

  // Sprawdź też przy powrocie do karty
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdates();
  });
}

async function checkForUpdates() {
  try {
    // Fetch version.txt z cache-busterem
    const res = await fetch(`/version.txt?cb=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    
    const latestVersion = (await res.text()).trim();
    if (!latestVersion) return;

    if (currentVersion && latestVersion !== currentVersion) {
      console.log(`[Updater] Nowa wersja dostępna: ${latestVersion} (obecna: ${currentVersion})`);
      
      // Jeśli strona jest w tle, odświeżamy od razu
      if (document.hidden) {
        location.reload();
        return;
      }

      // Jeśli strona jest na widoku, możemy poczekać aż użytkownik przejdzie w tło
      // lub odświeżyć jeśli nie jest w trakcie ważnej akcji (np. buzzer, host).
      // Na razie: odświeżamy po krótkim opóźnieniu, chyba że to panel hosta/sterowania.
      const isSensitivePage = 
        location.pathname.includes('host.html') || 
        location.pathname.includes('control.html') ||
        location.pathname.includes('buzzer.html');

      if (!isSensitivePage) {
        // Dla zwykłych stron odświeżamy po 10 sekundach bezczynności lub od razu w tle
        setTimeout(() => {
          if (document.hidden) location.reload();
          else {
            // Można tu dodać Toast "Aplikacja została zaktualizowana", ale user chciał "never refresh" (automatycznie)
            location.reload();
          }
        }, 5000);
      } else {
        // Dla wrażliwych stron czekamy aż karta przejdzie w tło
        console.log('[Updater] Strona wrażliwa, czekam na przejście w tło do aktualizacji.');
      }
    }
  } catch (err) {
    // ignoruj błędy sieciowe
  }
}
