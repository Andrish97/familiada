// familiada/logos/js/editor-text.js
// Strona /logos/editor/text/?id=<logo> -- edytor trybu TEXT (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-23T22365";
import { initTextEditor } from "./text.js?v=v2026-10-23T22365";


bootEditorPage({ mode: "TEXT", initEditor: initTextEditor });
