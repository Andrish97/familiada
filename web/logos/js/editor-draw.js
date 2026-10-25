// familiada/logos/js/editor-draw.js
// Strona /logos/editor/draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-25T18143";
import { initDrawEditor } from "./draw.js?v=v2026-10-25T18143";


bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
