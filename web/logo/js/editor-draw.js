// familiada/logo/js/editor-draw.js
// Strona /logo/editor-draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-09T11441";
import { initDrawEditor } from "./draw.js?v=v2026-10-09T11441";

bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
