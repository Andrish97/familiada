// familiada/logo/js/editor-text.js
// Strona /logo/editor/text/?id=<logo> -- edytor trybu TEXT (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-10T15311";
import { initTextEditor } from "./text.js?v=v2026-10-10T15311";

bootEditorPage({ mode: "TEXT", initEditor: initTextEditor });
