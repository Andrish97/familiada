// js/core/pwa.js
// Rejestracja Service Workera + prompt instalacji (Android/Chrome/Edge/desktop)
// iOS Safari obsługuje własny prompt w builder.js (maybeShowIosWebappPrompt)
// Flaga zapamiętana w localStorage – per urządzenie/przeglądarka, nie synchronizuje się.

const LS_KEY = "pwa:install_dismissed";

export function initPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (localStorage.getItem(LS_KEY)) return;
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent("pwa:installable", { detail: { prompt: e } }));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new CustomEvent("pwa:installed"));
  });

  return {
    canInstall: () => !!deferredPrompt,
    install: async () => {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome !== "accepted") localStorage.setItem(LS_KEY, "1");
      return outcome === "accepted";
    },
    dismiss: () => {
      localStorage.setItem(LS_KEY, "1");
      deferredPrompt = null;
    },
  };
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    !!window.navigator.standalone
  );
}

export function isMobileDevice() {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
