// familiada/logos/js/editor-draw.js
// Strona /logos/editor/draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-19T21202";
import { initDrawEditor } from "./draw.js?v=v2026-10-19T21202";


// The admin screenshot preview runs the real Fabric runtime but keeps the
// editor inert: it supplies fixture data itself and must never read or save a
// user's logo.
if (!new URLSearchParams(location.search).has("screenshotPreview")) {
  bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
}
