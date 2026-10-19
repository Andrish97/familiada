// familiada/logos/js/editor-draw.js
// Strona /logos/editor/draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { initDrawEditor } from "./draw.js?v=v2026-10-19T21461";


// The admin screenshot preview runs the real Fabric runtime but keeps the
// editor inert: it supplies fixture data itself and must never read or save a
// user's logo.
if (new URLSearchParams(location.search).has("screenshotPreview")) {
  let screenshotEditor = null;
  window.__familiadaScreenshotRenderLogo = async payload => {
    const host = document.getElementById("drawStageHost");
    for (let i = 0; i < 30 && (!host?.clientWidth || !host?.clientHeight); i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (!host?.clientWidth || !host?.clientHeight) throw new Error("plansza edytora nie ma jeszcze wymiarów");
    if (!screenshotEditor) {
      screenshotEditor = initDrawEditor({
        getMode: () => "DRAW",
        markDirty: () => {},
        clearDirty: () => {},
        onPreview: () => {},
      });
    }
    await screenshotEditor.open(payload || null);
    await document.fonts?.ready;
    screenshotEditor.selectTool("BRUSH");
    await new Promise(resolve => requestAnimationFrame(resolve));
  };
} else {
  const { bootEditorPage } = await import("./editor-page.js?v=v2026-10-19T21461");
  bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
}
