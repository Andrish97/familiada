import { alertModal, confirmModal } from "/shared/js/core/modal.js?v=v2026-10-19T09480";
import { initPwa, isStandalone } from "/shared/js/core/pwa.js?v=v2026-10-19T09480";
import { t } from "/shared/translation/translation.js?v=v2026-10-19T09480";

const button = document.getElementById("btnInstallAdmin");
const pwaApi = initPwa({ registerServiceWorker: false });
const INSTALL_DISMISSED_KEY = "pwa:install_dismissed";
const ADMIN_APP_SHELL_KEY = "admin-pwa:standalone";
const ADMIN_APP_INSTALLED_KEY = "admin-pwa:installed";
let didRunUnlockedSetup = false;
let installedCheck;
let adminInstalled = localStorage.getItem(ADMIN_APP_INSTALLED_KEY) === "1";

function isIOSSafari() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function tSafe(key, fallback) {
  const value = t(key);
  return !value || value === key ? fallback : value;
}

function isAdminStandalone() {
  if (!isStandalone()) return false;
  if (new URLSearchParams(location.search).get("app") === "admin") {
    sessionStorage.setItem(ADMIN_APP_SHELL_KEY, "1");
  }
  if (sessionStorage.getItem(ADMIN_APP_SHELL_KEY) === "1") return true;

  // Access may remove the start URL query while returning to the panel. The
  // admin app has its own worker, so use it to identify the installed shell.
  const workerUrl = navigator.serviceWorker?.controller?.scriptURL;
  if (!workerUrl) return false;
  try {
    const worker = new URL(workerUrl);
    return worker.origin === location.origin && worker.pathname === "/settings/sw.js?v=v2026-10-19T09480";
  } catch {
    return false;
  }
}

function isAdminInstalled() {
  if (isAdminStandalone()) return Promise.resolve(true);
  if (!installedCheck) {
    installedCheck = (async () => {
      if (typeof navigator.getInstalledRelatedApps !== "function") {
        return localStorage.getItem(ADMIN_APP_INSTALLED_KEY) === "1";
      }
      try {
        const apps = await navigator.getInstalledRelatedApps();
        const manifestUrl = new URL("/manifest-admin.webmanifest", location.origin).href;
        const installed = apps.some((app) => {
          let appId = app.id || "";
          try { appId = new URL(appId, location.origin).href; } catch {}
          return app.url === manifestUrl || appId === new URL("/?app=admin", location.origin).href;
        });
        if (installed) localStorage.setItem(ADMIN_APP_INSTALLED_KEY, "1");
        else localStorage.removeItem(ADMIN_APP_INSTALLED_KEY);
        return installed;
      } catch {
        return localStorage.getItem(ADMIN_APP_INSTALLED_KEY) === "1";
      }
    })();
  }
  return installedCheck;
}

function updateButton() {
  if (!button) return;
  const locked = document.body.classList.contains("settings-locked");
  const standaloneAdmin = isAdminStandalone();
  button.style.display = locked || standaloneAdmin || adminInstalled ? "none" : "";
  button.disabled = adminInstalled;
  button.title = adminInstalled ? "Panel admina jest już zainstalowany" : "Zainstaluj panel admina";
  button.setAttribute("aria-label", button.title);
  const iconName = adminInstalled ? "check" : "download";
  if (button.dataset.installIcon !== iconName) {
    button.dataset.installIcon = iconName;
    button.innerHTML = `<i class="ico" data-icon="${iconName}" aria-hidden="true"></i>`;
  }
}

function registerAdminWorker() {
  if (document.body.classList.contains("settings-locked")) return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/settings/sw.js", { scope: "/" }).catch(() => {});
  }
}

async function showIosPrompt() {
  if (!isIOSSafari() || isStandalone() || localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  const fallback = {
    title: "Dodaj panel admina do ekranu początkowego",
    text: "Otwórz Udostępnij, wybierz „Do ekranu początkowego”, a następnie „Dodaj”. Uruchom panel z nowej ikony. Logowanie Access nadal będzie wymagane.",
    ok: "Pokaż instrukcję",
    never: "Nie pokazuj więcej",
  };
  let dismissed = false;
  await confirmModal({
    title: tSafe("games.iosWebapp.adminTitle", fallback.title),
    text: tSafe("games.iosWebapp.adminText", fallback.text),
    okText: tSafe("games.iosWebapp.ok", fallback.ok),
    cancelText: tSafe("games.iosWebapp.never", fallback.never),
    onReady: ({ cancelBtn }) => cancelBtn?.addEventListener("click", () => { dismissed = true; }, { once: true }),
  });
  if (dismissed) localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
}

async function showAutomaticInstallPrompt() {
  if (isStandalone() || await isAdminInstalled() || !pwaApi.canInstall() || localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  let installResult = null;
  const accepted = await confirmModal({
    title: tSafe("games.pwaInstall.adminTitle", "Zainstaluj panel admina"),
    text: tSafe("games.pwaInstall.adminText", "Dodaj osobną aplikację panelu admina. Dostęp nadal chroni logowanie Access."),
    okText: tSafe("games.pwaInstall.ok", "Zainstaluj"),
    cancelText: tSafe("games.pwaInstall.cancel", "Nie pokazuj ponownie"),
    onReady: ({ okBtn }) => okBtn.addEventListener("click", () => { installResult = pwaApi.install(); }, { once: true }),
  });
  if (accepted && installResult) await installResult;
  else pwaApi.dismiss();
}

async function setupAfterAccess() {
  updateButton();
  registerAdminWorker();
  if (didRunUnlockedSetup || document.body.classList.contains("settings-locked")) return;
  didRunUnlockedSetup = true;
  adminInstalled = await isAdminInstalled();
  updateButton();
  if (isIOSSafari()) void showIosPrompt();
  else if (pwaApi.canInstall()) void showAutomaticInstallPrompt();
}

const authObserver = new MutationObserver(setupAfterAccess);
authObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
setupAfterAccess();

window.addEventListener("pwa:installable", () => {
  void isAdminInstalled().then((installed) => {
    adminInstalled = installed;
    updateButton();
    if (!installed && !document.body.classList.contains("settings-locked")) void showAutomaticInstallPrompt();
  });
});
window.addEventListener("pwa:installed", () => {
  adminInstalled = true;
  localStorage.setItem(ADMIN_APP_INSTALLED_KEY, "1");
  updateButton();
});
navigator.serviceWorker?.addEventListener("controllerchange", updateButton);

button?.addEventListener("click", async () => {
  if (isAdminStandalone() || adminInstalled || await isAdminInstalled()) {
    adminInstalled = true;
    updateButton();
    await alertModal({
      title: "Panel admina jest już zainstalowany",
      text: "Otwórz panel z ikony na ekranie głównym lub w menu aplikacji.",
      okText: tSafe("games.iosWebapp.ok", "Rozumiem"),
    });
    return;
  }
  if (isStandalone() && !isAdminStandalone()) {
    await alertModal({
      title: tSafe("games.pwaInstall.adminStandaloneTitle", "Dodaj osobny panel admina"),
      text: tSafe("games.pwaInstall.adminStandaloneText", "Panel jest otwarty w aplikacji Familiada. Otwórz tę stronę w Safari lub Chrome, aby dodać panel jako osobną aplikację."),
      okText: tSafe("games.iosWebapp.ok", "Rozumiem"),
    });
    return;
  }
  if (!pwaApi.canInstall()) {
    const ios = isIOSDevice();
    const macSafari = /Mac/.test(navigator.platform) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/.test(navigator.userAgent);
    const ua = navigator.userAgent || "";
    const isAndroidChrome = /Android/i.test(ua) && /Chrome\//i.test(ua) && !/EdgA|OPR\//i.test(ua);
    const title = ios
      ? tSafe("games.iosWebapp.adminTitle", "Dodaj panel admina do ekranu początkowego")
      : macSafari
        ? tSafe("games.pwaInstall.adminMacTitle", "Dodaj panel admina do Docka")
        : tSafe("games.pwaInstall.unavailableTitle", "Instalacja jest teraz niedostępna");
    const text = ios
      ? tSafe("games.iosWebapp.adminText", "Otwórz Udostępnij, wybierz „Do ekranu początkowego”, a następnie „Dodaj”. Uruchom panel z nowej ikony. Logowanie Access nadal będzie wymagane.")
      : macSafari
        ? `${tSafe("games.pwaInstall.macSafari", "W Safari wybierz Plik → Dodaj do Docka.")} Logowanie Access nadal będzie wymagane.`
        : isAndroidChrome
          ? tSafe("games.pwaInstall.unavailableAndroid", "Chrome nie może teraz zainstalować tej aplikacji. „Utwórz skrót” doda tylko skrót do strony, a nie aplikację.")
          : tSafe("games.pwaInstall.unavailableText", "Ta przeglądarka nie udostępniła instalatora. Jeśli w jej menu jest aktywna opcja instalacji, możesz jej użyć.");
    await alertModal({
      title,
      text,
      okText: tSafe("games.iosWebapp.ok", "Rozumiem"),
    });
    return;
  }
  let installResult = null;
  const accepted = await confirmModal({
    title: tSafe("games.pwaInstall.adminTitle", "Zainstaluj panel admina"),
    text: tSafe("games.pwaInstall.adminText", "Dodaj osobną aplikację panelu admina. Dostęp nadal chroni logowanie Access."),
    okText: tSafe("games.pwaInstall.ok", "Zainstaluj"),
    cancelText: "Anuluj",
    onReady: ({ okBtn }) => okBtn.addEventListener("click", () => { installResult = pwaApi.install(); }, { once: true }),
  });
  if (accepted && installResult) await installResult;
});
