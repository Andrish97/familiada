// familiada/logo/js/editor-draw.js
// Strona /logos/editor/draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-18T20575";
import { initDrawEditor } from "./draw.js?v=v2026-10-18T20575";

bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
