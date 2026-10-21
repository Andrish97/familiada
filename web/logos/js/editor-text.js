// familiada/logos/js/editor-text.js
// Strona /logos/editor/text/?id=<logo> -- edytor trybu TEXT (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-21T06464";
import { initTextEditor } from "./text.js?v=v2026-10-21T06464";


bootEditorPage({ mode: "TEXT", initEditor: initTextEditor });
