// Wspólny start przed pierwszym renderem. Klasyczny skrypt w head, po meta viewport.
// Ta sama klasyfikacja służy CSS, guardowi i późniejszym aktualizacjom modułów.
(() => {
  if (globalThis.FamiliadaDevice) return;
  const PHONE_MAX_SHORT_SIDE = 700;
  function screenSides() {
    const w = window.screen?.width || window.innerWidth;
    const h = window.screen?.height || window.innerHeight;
    return { short: Math.min(w, h), long: Math.max(w, h) };
  }

  const isTouch = () => navigator.maxTouchPoints > 0 || !!window.matchMedia?.("(pointer: coarse)").matches;

  /** Aktywne pole tekstowe (klawiatura ekranowa na dotyku może być otwarta). */
  function editableFocused() {
    if (typeof document === "undefined") return false;
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    return tag === "input" && !/^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/i.test(el.type || "");
  }

  // Orientacja z ekranu, nie z okna, gdy klawiatura może być otwarta:
  // klawiatura obniża okno i telefon w pionie wyglądałby na poziomy
  // („Obróć urządzenie” w trakcie pisania, zgłoszenie 2026-10-24).
  function screenOrientation() {
    const type = window.screen?.orientation?.type;
    if (type) return type.startsWith("landscape") ? "landscape" : "portrait";
    const w = window.screen?.width, h = window.screen?.height;
    return w && h ? (w >= h ? "landscape" : "portrait") : null;
  }

  function getDeviceProfile() {
    const { short, long } = screenSides();
    const hasTouch = isTouch();
    const primaryCoarse = !!window.matchMedia?.("(pointer: coarse)").matches;
    const primaryHover = !!window.matchMedia?.("(hover: hover)").matches;
    // A touchscreen laptop usually has a fine, hover-capable primary pointer;
    // a phone/tablet is normally operated through a coarse, non-hover pointer.
    const touch = primaryCoarse && !primaryHover || (!window.matchMedia && hasTouch);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isTv = /SmartTV|SMART-TV|Tizen|web0s|WebOS|HbbTV|BRAVIA|Android TV|GoogleTV|Roku|Viera|NetCast/i.test(navigator.userAgent || "");
    const dpr = window.devicePixelRatio || 1;
    const screenWidth = Number(window.screen?.width) || width;
    const screenHeight = Number(window.screen?.height) || height;
    return {
      formFactor: isTv ? "tv" : touch ? (short < PHONE_MAX_SHORT_SIDE ? "phone" : "tablet") : "desktop",
      orientation: (touch && editableFocused() && screenOrientation()) || (width >= height ? "landscape" : "portrait"),
      viewportWidth: width,
      viewportHeight: height,
      screenShortSide: short,
      screenLongSide: long,
      screenPixelWidth: Math.round(screenWidth * dpr),
      screenPixelHeight: Math.round(screenHeight * dpr),
      touch,
      hasTouch,
      isTv,
    };
  }

  const NARROW_MAX = 600;

  function deviceLayout(profile = getDeviceProfile()) {
    const narrow = profile.viewportWidth <= NARROW_MAX;
    return {
      device: profile.formFactor,
      input: profile.touch ? "touch" : "pointer",
      orientation: profile.orientation,
      compact: profile.formFactor === "phone" || narrow,
      sheet: (profile.touch && profile.formFactor !== "tv") || narrow,
    };
  }


  globalThis.FamiliadaDevice = { getDeviceProfile, editableFocused, deviceLayout, PHONE_MAX_SHORT_SIDE, NARROW_MAX };
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const root = document.documentElement;
  const next = deviceLayout();
  root.dataset.device = next.device;
  root.dataset.input = next.input;
  root.dataset.orientation = next.orientation;
  root.toggleAttribute("data-compact", next.compact);
  root.toggleAttribute("data-sheet", next.sheet);
  root.setAttribute("data-layout-pending", "");
  // HTML może zawierać gotową treść dla trybu bez JS. Przy hydracji etap
  // potwierdza dopiero kod strony, po podmianie treści i podpięciu obsługi.
  const resetParsedSteps = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches("[data-skel-step].skel-step-ready")) node.classList.remove("skel-step-ready");
    for (const step of node.querySelectorAll("[data-skel-step].skel-step-ready")) step.classList.remove("skel-step-ready");
  };
  const parsed = new MutationObserver((records) => {
    if (document.readyState !== "loading") { parsed.disconnect(); return; }
    for (const record of records) for (const node of record.addedNodes) resetParsedSteps(node);
  });
  parsed.observe(document, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => parsed.disconnect(), { once: true });
  // Bezpiecznik działa także przy błędzie importu modułów. Guard nadal chowa body.
  const timeout = setTimeout(() => {
    root.classList.remove("page-loading");
    root.removeAttribute("data-layout-pending");
  }, 5000);
  globalThis.FamiliadaPageBoot = { finish() { clearTimeout(timeout); root.removeAttribute("data-layout-pending"); } };
})();
