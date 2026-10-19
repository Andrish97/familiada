import { alertModal, confirmModal } from "/shared/js/core/modal.js?v=v2026-10-19T08531";
import { initPwa, isStandalone } from "/shared/js/core/pwa.js?v=v2026-10-19T08531";
import { t } from "/shared/translation/translation.js?v=v2026-10-19T08531";

const button = document.getElementById("btnInstallAdmin");
const pwaApi = initPwa({ registerServiceWorker: false });
const INSTALL_DISMISSED_KEY = "pwa:install_dismissed";
let didRunUnlockedSetup = false;

function isIOSSafari() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function tSafe(key, fallback) {
  const value = t(key);
  return !value || value === key ? fallback : value;
}

function updateButton() {
  if (!button) return;
  const locked = document.body.classList.contains("settings-locked");
  button.style.display = locked || isStandalone() || (!pwaApi.canInstall() && !isIOSSafari()) ? "none" : "";
}

function registerAdminWorker() {
  if (document.body.classList.contains("settings-locked")) return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/settings/sw.js", { scope: "/settings/" }).catch(() => {});
  }
}

async function showIosPrompt() {
  if (!isIOSSafari() || isStandalone() || localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  const fallback = {
    title: "Dodaj panel admina do ekranu początkowego",
    text: "Otwórz Udostępnij, wybierz „Do ekranu początkowego”, a następnie dodaj panel. Logowanie Access nadal będzie wymagane.",
    ok: "Pokaż instrukcję",
    never: "Nie pokazuj więcej",
  };
  let dismissed = false;
  await confirmModal({
    title: tSafe("games.iosWebapp.title", fallback.title),
    text: tSafe("games.iosWebapp.text", fallback.text),
    okText: tSafe("games.iosWebapp.ok", fallback.ok),
    cancelText: tSafe("games.iosWebapp.never", fallback.never),
    onReady: ({ cancelBtn }) => cancelBtn?.addEventListener("click", () => { dismissed = true; }, { once: true }),
  });
  if (dismissed) localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
}

async function showAutomaticInstallPrompt() {
  if (isStandalone() || !pwaApi.canInstall() || localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  const accepted = await confirmModal({
    title: tSafe("games.pwaInstall.title", "Zainstaluj aplikację"),
    text: tSafe("games.pwaInstall.text", "Dodaj panel admina do ekranu głównego, żeby mieć do niego szybki dostęp."),
    okText: tSafe("games.pwaInstall.ok", "Zainstaluj"),
    cancelText: tSafe("games.pwaInstall.cancel", "Nie pokazuj"),
  });
  if (accepted) await pwaApi.install();
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
window.addEventListener("pwa:installed", updateButton);

button?.addEventListener("click", async () => {
  if (!pwaApi.canInstall()) {
    const ios = isIOSSafari();
    const fallback = ios
      ? { title: "Dodaj panel admina do ekranu początkowego", text: "Otwórz Udostępnij, wybierz „Do ekranu początkowego”, a następnie dodaj panel. Logowanie Access nadal będzie wymagane." }
      : { title: "Zainstaluj panel admina", text: "W menu przeglądarki wybierz „Zainstaluj panel admina” lub „Dodaj do ekranu głównego”. Logowanie Access nadal będzie wymagane." };
    await alertModal({
      title: tSafe(ios ? "games.iosWebapp.title" : "games.pwaInstall.title", fallback.title),
      text: tSafe(ios ? "games.iosWebapp.text" : "games.pwaInstall.manual", fallback.text),
      okText: tSafe("games.pwaInstall.ok", "OK"),
    });
    return;
  }
  const accepted = await confirmModal({
    title: tSafe("games.pwaInstall.title", "Zainstaluj panel admina"),
    text: tSafe("games.pwaInstall.text", "Dodaj osobny skrót do panelu admina. Logowanie Access nadal będzie wymagane."),
    okText: tSafe("games.pwaInstall.ok", "Zainstaluj"),
    cancelText: tSafe("games.pwaInstall.cancelBtn", "Anuluj"),
  });
  if (accepted) await pwaApi.install();
});
