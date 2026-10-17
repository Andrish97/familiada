// familiada/logo/js/editor-text.js
// Strona /logos/editor/text/?id=<logo> -- edytor trybu TEXT (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-17T05011";
import { initTextEditor } from "./text.js?v=v2026-10-17T05011";

bootEditorPage({ mode: "TEXT", initEditor: initTextEditor });
