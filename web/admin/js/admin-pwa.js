import { alertModal, confirmModal } from "/shared/js/core/modal.js?v=v2026-10-24T21185";
import { initPwa, isStandalone, isIOSSafari, canOfferPwaInstall } from "/shared/js/core/pwa.js?v=v2026-10-24T21185";

const button = document.getElementById("btnInstallAdmin");
const pwaApi = initPwa({ registerServiceWorker: false });
const INSTALL_DISMISSED_KEY = "pwa:install_dismissed";
const ADMIN_APP_SHELL_KEY = "admin-pwa:standalone";
let didRunUnlockedSetup = false;
let adminInstalled = false;

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMacSafari() {
  return /Mac/.test(navigator.platform) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/.test(navigator.userAgent);
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
    return worker.origin === location.origin && worker.pathname === "/admin/sw.js?v=v2026-10-24T21185";
  } catch {
    return false;
  }
}

function updateButton() {
  if (!button) return;
  const locked = document.body.classList.contains("settings-locked");
  const standaloneAdmin = isAdminStandalone();
  const installAvailable = canOfferPwaInstall(pwaApi);
  button.hidden = locked || standaloneAdmin || adminInstalled || !installAvailable;
  button.disabled = false;
  button.title = "Zainstaluj panel admina";
  button.setAttribute("aria-label", button.title);
}

function registerAdminWorker() {
  if (document.body.classList.contains("settings-locked")) return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/admin/sw.js", { scope: "/" }).catch(() => {});
  }
}

async function showIosPrompt() {
  if (!isIOSSafari() || isStandalone() || localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  let dismissed = false;
  await confirmModal({
    title: "Dodaj panel admina do ekranu początkowego",
    text: "Otwórz Udostępnij, wybierz „Do ekranu początkowego”, a następnie „Dodaj”. Uruchom panel z nowej ikony. Logowanie Access nadal będzie wymagane.",
    okText: "Pokaż instrukcję",
    cancelText: "Nie pokazuj więcej",
    onReady: ({ cancelBtn }) => cancelBtn?.addEventListener("click", () => { dismissed = true; }, { once: true }),
  });
  if (dismissed) localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
}

async function showAutomaticInstallPrompt() {
  if (isStandalone() || !pwaApi.canInstall() || localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  let installResult = null;
  const accepted = await confirmModal({
    title: "Zainstaluj panel admina",
    text: "Dodaj osobną aplikację panelu admina. Dostęp nadal chroni logowanie Access.",
    okText: "Zainstaluj",
    cancelText: "Nie pokazuj ponownie",
    onReady: ({ okBtn }) => okBtn.addEventListener("click", () => { installResult = pwaApi.install(); }, { once: true }),
  });
  if (accepted && installResult) await installResult;
  else pwaApi.dismiss();
}

function setupAfterAccess() {
  updateButton();
  registerAdminWorker();
  if (didRunUnlockedSetup || document.body.classList.contains("settings-locked")) return;
  didRunUnlockedSetup = true;
  if (isIOSSafari()) void showIosPrompt();
  else if (pwaApi.canInstall()) void showAutomaticInstallPrompt();
}

const authObserver = new MutationObserver(setupAfterAccess);
authObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
setupAfterAccess();

window.addEventListener("pwa:installable", () => {
  updateButton();
  if (!document.body.classList.contains("settings-locked")) void showAutomaticInstallPrompt();
});
window.addEventListener("pwa:installed", () => {
  adminInstalled = true;
  updateButton();
});
navigator.serviceWorker?.addEventListener("controllerchange", updateButton);

button?.addEventListener("click", async () => {
  if (isAdminStandalone() || adminInstalled) return;
  if (isStandalone() && !isAdminStandalone()) {
    await alertModal({
      title: "Dodaj osobny panel admina",
      text: "Panel jest otwarty w aplikacji Familiada. Otwórz tę stronę w Safari lub Chrome, aby dodać panel jako osobną aplikację.",
      okText: "Rozumiem",
    });
    return;
  }
  if (!pwaApi.canInstall()) {
    const ios = isIOSDevice();
    const macSafari = isMacSafari();
    const ua = navigator.userAgent || "";
    const isAndroidChrome = /Android/i.test(ua) && /Chrome\//i.test(ua) && !/EdgA|OPR\//i.test(ua);
    const title = ios
      ? "Dodaj panel admina do ekranu początkowego"
      : macSafari
        ? "Dodaj panel admina do Docka"
        : "Instalacja jest teraz niedostępna";
    const text = ios
      ? "Otwórz Udostępnij, wybierz „Do ekranu początkowego”, a następnie „Dodaj”. Uruchom panel z nowej ikony. Logowanie Access nadal będzie wymagane."
      : macSafari
        ? "W Safari wybierz Plik → Dodaj do Docka. Logowanie Access nadal będzie wymagane."
        : isAndroidChrome
          ? "Chrome nie może teraz zainstalować tej aplikacji. „Utwórz skrót” doda tylko skrót do strony, a nie aplikację."
          : "Ta przeglądarka nie udostępniła instalatora. Jeśli w jej menu jest aktywna opcja instalacji, możesz jej użyć.";
    await alertModal({
      title,
      text,
      okText: "Rozumiem",
    });
    return;
  }
  let installResult = null;
  const accepted = await confirmModal({
    title: "Zainstaluj panel admina",
    text: "Dodaj osobną aplikację panelu admina. Dostęp nadal chroni logowanie Access.",
    okText: "Zainstaluj",
    cancelText: "Anuluj",
    onReady: ({ okBtn }) => okBtn.addEventListener("click", () => { installResult = pwaApi.install(); }, { once: true }),
  });
  if (accepted && installResult) await installResult;
});
