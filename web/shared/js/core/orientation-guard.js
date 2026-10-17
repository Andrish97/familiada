// Adapter for entry pages that do not use initPage(). Keep their device and
// orientation checks on the same refresh path as the rest of the application.
import { getDeviceProfile, guardViewportWidth } from "./device-guard.js?v=v2026-10-15T22404";
import { PAGES, pageIdForPath } from "./nav-map.js?v=v2026-10-15T22404";

function updateDeviceProfile() {
  const profile = getDeviceProfile();
  document.documentElement.dataset.formFactor = profile.formFactor;
  document.documentElement.dataset.screenOrientation = profile.orientation;
  document.documentElement.dataset.viewportOrientation = profile.orientation;
}

const route = PAGES[pageIdForPath(location.pathname)] || {};
const body = document.body;
const isTvConnect = /\/connect\/tv\//.test(location.pathname);
const routeOptions = {
  minWidth: Number(body?.dataset.minViewportWidth) || route.minViewportWidth || 0,
  formFactors: body?.dataset.deviceFormFactors
    ? body.dataset.deviceFormFactors.split(",").map((value) => value.trim()).filter(Boolean)
    : route.deviceGuard?.formFactors || null,
  requiresTouch: body?.dataset.requiresTouch === "true" || !!route.deviceGuard?.requiresTouch,
  minScreenShortSide: Number(body?.dataset.minScreenShortSide) || route.deviceGuard?.minScreenShortSide || 0,
  minTvResolution: body?.dataset.minTvResolution === "hd" || !!route.deviceGuard?.minTvResolution,
  allowPhoneLandscape: /\/control\/(?:host|buzzer)\//.test(location.pathname) || isTvConnect,
};

updateDeviceProfile();
window.addEventListener("resize", updateDeviceProfile, { passive: true });
window.addEventListener("orientationchange", updateDeviceProfile, { passive: true });
window.visualViewport?.addEventListener("resize", updateDeviceProfile, { passive: true });

// These routes have a dedicated TV-only flow which owns its device guard.
// Other entry pages delegate all blocking, refresh and release behavior to
// the shared guard used by initPage().
if (!isTvConnect) {
  const controlTestFrame = window.parent !== window
    && window.frameElement?.dataset.controlTestMode === "true";
  if (controlTestFrame) {
    routeOptions.formFactors = null;
    routeOptions.requiresTouch = false;
  }

  guardViewportWidth(routeOptions);
}
