// Wspólna blokada landscape na telefonach dla stron aplikacji.
// Małe okna desktopu i viewporty tabletów nie są klasyfikowane jako telefony.
import { deviceGuardState, getDeviceProfile, showDeviceGuard } from "./device-guard.js?v=v2026-10-13T14412";
import { hidePageGuard, showPageGuard } from "./page-overlay.js?v=v2026-10-13T14412";
import { PAGES, pageIdForPath } from "./nav-map.js?v=v2026-10-13T13432";
import { applyTranslations } from "../../translation/translation.js?v=v2026-10-13T13432";

function refresh() {
  const profile = getDeviceProfile();
  const isTvConnect = /\/connect\/tv\//.test(location.pathname);
  const route = PAGES[pageIdForPath(location.pathname)] || {};
  const body = document.body;
  const routeOptions = {
    minWidth: Number(body?.dataset.minViewportWidth) || route.minViewportWidth || 0,
    formFactors: body?.dataset.deviceFormFactors
      ? body.dataset.deviceFormFactors.split(",").map((value) => value.trim()).filter(Boolean)
      : route.deviceGuard?.formFactors || null,
    requiresTouch: body?.dataset.requiresTouch === "true" || !!route.deviceGuard?.requiresTouch,
    minScreenShortSide: Number(body?.dataset.minScreenShortSide) || route.deviceGuard?.minScreenShortSide || 0,
    allowPhoneLandscape: /\/control\/(?:host|buzzer)\//.test(location.pathname),
  };
  const routeState = deviceGuardState(routeOptions.minWidth, routeOptions);
  const suggestsLandscape = routeOptions.allowPhoneLandscape && profile.formFactor === "phone" && profile.orientation === "portrait";
  let suggestion = document.getElementById("orientationSuggestion");
  if (suggestsLandscape && !suggestion) {
    suggestion = document.createElement("aside");
    suggestion.id = "orientationSuggestion";
    suggestion.className = "orientation-suggestion";
    suggestion.setAttribute("role", "status");
    suggestion.innerHTML = `<span data-i18n="pageGuard.rotateSuggestion">Wygodniej używać w poziomie</span><button class="btn sm" type="button" data-i18n="pageGuard.rotateNow">Obróć</button>`;
    suggestion.querySelector("button")?.addEventListener("click", async () => {
      try { await screen.orientation?.lock?.("landscape"); } catch { /* przeglądarka może wymagać ręcznego obrotu */ }
    });
    window.addEventListener("i18n:lang", () => { if (suggestion?.isConnected) applyTranslations(suggestion); });
    applyTranslations(suggestion);
    document.body.appendChild(suggestion);
  } else if (!suggestsLandscape) suggestion?.remove();
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
      showDeviceGuard(routeState, null, routeState === "screen" ? body?.dataset.screenMessageKey || null : null);
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
