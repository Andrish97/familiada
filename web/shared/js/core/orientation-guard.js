// Wspólna blokada landscape na telefonach dla stron aplikacji.
// Małe okna desktopu i viewporty tabletów nie są klasyfikowane jako telefony.
import { getDeviceProfile } from "./device-guard.js?v=v2026-10-13T14412";
import { hidePageGuard, showPageGuard } from "./page-overlay.js?v=v2026-10-13T14412";

function refresh() {
  const profile = getDeviceProfile();
  document.documentElement.dataset.formFactor = profile.formFactor;
  document.documentElement.dataset.screenOrientation = profile.orientation;
  document.documentElement.dataset.viewportOrientation = profile.viewportOrientation;
  const blocked = profile.formFactor === "phone" && profile.orientation === "landscape";
  document.documentElement.dataset.globalPhoneLandscape = String(blocked);
  delete document.documentElement.dataset.phoneLandscapePending;
  const overlay = document.getElementById("pageGuard");
  if (blocked) {
    const routeState = document.documentElement.dataset.deviceGuard;
    if (["unsupported", "touch"].includes(routeState)) return;
    const shown = showPageGuard({
      kind: "device",
      state: "rotate",
      iconName: "rotate-right",
      titleKey: "pageGuard.rotateTitle",
      messageKey: "pageGuard.rotateMessage",
    });
    shown.dataset.globalPhoneLandscape = "true";
    return;
  }

  if (overlay?.dataset.globalPhoneLandscape !== "true") return;
  delete overlay.dataset.globalPhoneLandscape;
  const routeState = document.documentElement.dataset.deviceGuard;
  if (routeState && routeState !== "ok") return;
  if (overlay.dataset.kind === "guest") return;
  hidePageGuard();
}

window.addEventListener("resize", refresh);
window.addEventListener("orientationchange", () => setTimeout(refresh, 250));
window.visualViewport?.addEventListener("resize", refresh);
refresh();
