// familiada/logos/js/editor-draw.js
// Strona /logos/editor/draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { initDrawEditor } from "./draw.js?v=v2026-10-20T06332";
import { initI18n } from "/shared/translation/translation.js?v=v2026-10-20T06332";


// The admin screenshot preview runs the real Fabric runtime but keeps the
// editor inert: it supplies fixture data itself and must never read or save a
// user's logo.
if (new URLSearchParams(location.search).has("screenshotPreview")) {
  // Keep the same translation and tool-font initialization as the regular
  // editor page while still bypassing account/database state for fixtures.
  await initI18n({ withSwitcher: false });
  let screenshotEditor = null;
  window.__familiadaScreenshotRenderLogo = async payload => {
    const host = document.getElementById("drawStageHost");
    if (!screenshotEditor) {
      // Initialize the real toolbar immediately. The iframe may still be
      // laying out its fixed screenshot viewport, so don't let a zero-sized
      // host prevent the controls (or the editor itself) from initializing.
      screenshotEditor = initDrawEditor({
        getMode: () => "DRAW",
        markDirty: () => {},
        clearDirty: () => {},
        onPreview: () => {},
      });
    }
    const started = performance.now();
    while ((!host?.clientWidth || !host?.clientHeight) && performance.now() - started < 12000) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (!host?.clientWidth || !host?.clientHeight) {
      throw new Error("plansza rysunku nie otrzymała wymiarów po załadowaniu podglądu");
    }
    await screenshotEditor.open(payload || null);
    await document.fonts?.ready;
    screenshotEditor.selectTool("BRUSH");
    window.__drawFabric?.requestRenderAll();
    await new Promise(resolve => requestAnimationFrame(resolve));
  };
} else {
  const { bootEditorPage } = await import("./editor-page.js?v=v2026-10-20T06332");
  bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
}
