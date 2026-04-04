/**
 * js/core/updater.js
 * Automatyczne sprawdzanie nowej wersji aplikacji.
 * Jeśli wersja z version.txt na serwerze różni się od lokalnej,
 * skrypt odświeża stronę.
 * 
 * ZABEZPIECZENIA:
 * - Maksymalnie 1 przeładowanie na 5 minut (unika pętli)
 * - Ignoruje błędy sieciowe
 * - Nie przeładowuje na stronach gry (host/control/buzzer)
 */

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minut
const RELOAD_COOLDOWN = 5 * 60 * 1000; // 5 minut cooldown po przeładowaniu
let currentVersion = null;
let lastReloadTime = 0;

export function initUpdater() {
  // Pobierz aktualną wersję z meta tagu
  const meta = document.querySelector('meta[name="app-version"]');
  if (meta) {
    currentVersion = meta.getAttribute('content');
  }

  if (!currentVersion) {
    console.warn('[updater] Brak meta app-version, wyłączam');
    return;
  }

  // Sprawdź czy ostatnie przeładowanie nie było zbyt niedawno
  const lastReload = sessionStorage.getItem('lastVersionReload');
  if (lastReload) {
    const elapsed = Date.now() - parseInt(lastReload, 10);
    if (elapsed < RELOAD_COOLDOWN) {
      console.warn(`[updater]Cooldown po przeładowaniu, jeszcze ${Math.round((RELOAD_COOLDOWN - elapsed) / 1000)}s`);
      return;
    }
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

    if (!res.ok) {
      console.warn('[updater] Nie udało się pobrać version.txt');
      return;
    }

    const serverVersion = (await res.text()).trim();
    if (!serverVersion) {
      console.warn('[updater] version.txt jest pusty');
      return;
    }

    if (currentVersion && serverVersion !== currentVersion) {
      const isSensitivePage =
        location.pathname.includes('host.html') ||
        location.pathname.includes('control.html') ||
        location.pathname.includes('buzzer.html');

      if (isSensitivePage) {
        console.info('[updater] Nowa wersja dostępna, ale nie przeładowuję na stronie gry');
        return;
      }

      // Sprawdź cooldown
      const now = Date.now();
      if (now - lastReloadTime < RELOAD_COOLDOWN) {
        console.warn('[updater] Przeładowanie zablokowane - cooldown aktywny');
        return;
      }

      console.info(`[updater] Wykryto nową wersję: ${serverVersion} (obecna: ${currentVersion})`);
      console.info('[updater] Przeładowanie za 5 sekund...');
      
      // Zapisz czas przeładowania
      lastReloadTime = now;
      sessionStorage.setItem('lastVersionReload', now.toString());
      
      setTimeout(() => {
        location.reload();
      }, 5000);
    }
  } catch (err) {
    console.warn('[updater] Błąd sprawdzania wersji:', err.message);
    // ignoruj błędy sieciowe
  }
}
