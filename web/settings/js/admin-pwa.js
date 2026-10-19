import { alertModal, confirmModal } from "/shared/js/core/modal.js?v=v2026-10-19T08505";

const button = document.getElementById("btnInstallAdmin");
let installPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMacSafari() {
  return /Mac/.test(navigator.platform) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/.test(navigator.userAgent);
}

function updateButton() {
  if (!button) return;
  // Keep the toolbar affordance available after Access login. If the browser
  // does not offer the install prompt, clicking it explains the manual path.
  button.style.display = document.body.classList.contains("settings-locked") || isStandalone() ? "none" : "";
}

function registerAdminWorker() {
  if (document.body.classList.contains("settings-locked")) return;
  if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/settings/sw.js", { scope: "/settings/" }).catch(() => {});
  }
}

const authObserver = new MutationObserver(() => {
  updateButton();
  registerAdminWorker();
});
authObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
registerAdminWorker();

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  updateButton();
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  updateButton();
});

button?.addEventListener("click", async () => {
  if (!installPrompt) {
    const text = isIos()
      ? "Wybierz Udostępnij, a następnie Do ekranu początkowego. Panel pozostanie zabezpieczony logowaniem Access."
      : isMacSafari()
        ? "W Safari wybierz Plik → Dodaj do Docka. Panel pozostanie zabezpieczony logowaniem Access."
        : "W menu przeglądarki wybierz Zainstaluj panel admina lub Dodaj do ekranu głównego. Panel pozostanie zabezpieczony logowaniem Access.";
    await alertModal({ title: "Pobierz panel admina", text, okText: "Rozumiem" });
    return;
  }
  const confirmed = await confirmModal({
    title: "Pobierz panel admina",
    text: "Dodaj osobny skrót do panelu. Logowanie Access będzie nadal wymagane.",
    okText: "Pobierz",
    cancelText: "Anuluj",
  });
  if (!confirmed) return;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  updateButton();
});
updateButton();
