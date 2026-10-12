// familiada/logo/js/editor-text.js
// Strona /logo/editor/text/?id=<logo> -- edytor trybu TEXT (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-12T14365";
import { initTextEditor } from "./text.js?v=v2026-10-12T14365";

bootEditorPage({ mode: "TEXT", initEditor: initTextEditor });
