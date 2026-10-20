// familiada/logos/js/editor-text.js
// Strona /logos/editor/text/?id=<logo> -- edytor trybu TEXT (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-20T23145";
import { initTextEditor } from "./text.js?v=v2026-10-20T23145";


bootEditorPage({ mode: "TEXT", initEditor: initTextEditor });
