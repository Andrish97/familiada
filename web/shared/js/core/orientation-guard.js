// Wspólna blokada landscape na telefonach dla stron aplikacji.
// Małe okna desktopu i viewporty tabletów nie są klasyfikowane jako telefony.
import { deviceGuardState, getDeviceProfile, showDeviceGuard } from "./device-guard.js?v=v2026-10-15T22090";
import { hidePageGuard, showPageGuard } from "./page-overlay.js?v=v2026-10-15T22090";
import { PAGES, pageIdForPath } from "./nav-map.js?v=v2026-10-15T22090";

function refresh() {
  const profile = getDeviceProfile();
  const isTvConnect = /\/connect\/tv\//.test(location.pathname);
  const route = PAGES[pageIdForPath(location.pathname)] || {};
  const body = document.body;
  const controlTestFrame = window.parent !== window
    && window.frameElement?.dataset.controlTestMode === "true";
  const routeOptions = {
    minWidth: Number(body?.dataset.minViewportWidth) || route.minViewportWidth || 0,
    formFactors: body?.dataset.deviceFormFactors
      ? body.dataset.deviceFormFactors.split(",").map((value) => value.trim()).filter(Boolean)
      : route.deviceGuard?.formFactors || null,
    requiresTouch: body?.dataset.requiresTouch === "true" || !!route.deviceGuard?.requiresTouch,
    minScreenShortSide: Number(body?.dataset.minScreenShortSide) || route.deviceGuard?.minScreenShortSide || 0,
    minTvResolution: body?.dataset.minTvResolution === "hd" || !!route.deviceGuard?.minTvResolution,
    allowPhoneLandscape: /\/control\/(?:host|buzzer)\//.test(location.pathname),
  };
  if (controlTestFrame) {
    routeOptions.formFactors = null;
    routeOptions.requiresTouch = false;
  }
  const routeState = deviceGuardState(routeOptions.minWidth, routeOptions);
  document.documentElement.dataset.formFactor = profile.formFactor;
  document.documentElement.dataset.screenOrientation = profile.orientation;
  document.documentElement.dataset.viewportOrientation = profile.orientation;
  const blocked = profile.formFactor === "phone" && profile.orientation === "landscape" && !routeOptions.allowPhoneLandscape && !isTvConnect;
  document.documentElement.dataset.globalPhoneLandscape = String(blocked);
  delete document.documentElement.dataset.phoneLandscapePending;
  const overlay = document.getElementById("pageGuard");
  if (blocked) {
    if (["unsupported", "screen", "touch"].includes(routeState)) {
      document.documentElement.dataset.deviceGuard = routeState;
      showDeviceGuard(routeState);
      document.documentElement.classList.remove("page-loading");
      return;
    }
    const activeGuard = document.documentElement.dataset.deviceGuard;
    if (["unsupported", "screen", "touch"].includes(activeGuard)) return;
    const shown = showPageGuard({
      kind: "device",
      state: "rotate",
      iconName: "rotate-right",
      titleKey: "pageGuard.rotateTitle",
      messageKey: "pageGuard.rotateMessage",
    });
    shown.dataset.globalPhoneLandscape = "true";
    document.documentElement.dataset.deviceGuard = "rotate";
    // Pokazujemy sam komunikat blokady; page-overlay utrzymuje treść aplikacji
    // ukrytą, dopóki telefon pozostaje w poziomie.
    document.documentElement.classList.remove("page-loading");
    return;
  }

  if (overlay?.dataset.globalPhoneLandscape !== "true") return;
  delete overlay.dataset.globalPhoneLandscape;
  const activeGuardState = document.documentElement.dataset.deviceGuard;
  if (activeGuardState && activeGuardState !== "ok") return;
  if (overlay.dataset.kind === "guest") return;
  hidePageGuard();
}

if (typeof window !== "undefined" && typeof document !== "undefined" && typeof location !== "undefined") {
  window.addEventListener("resize", refresh);
  window.addEventListener("orientationchange", () => setTimeout(refresh, 250));
  window.visualViewport?.addEventListener("resize", refresh);
  refresh();
}
