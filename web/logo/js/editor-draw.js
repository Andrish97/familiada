// familiada/logo/js/editor-draw.js
// Strona /logos/editor/draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-15T22004";
import { initDrawEditor } from "./draw.js?v=v2026-10-15T22004";

bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
