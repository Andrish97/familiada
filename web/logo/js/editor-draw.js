// familiada/logo/js/editor-draw.js
// Strona /logo/editor/draw/?id=<logo> -- edytor trybu DRAW (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-13T10060";
import { initDrawEditor } from "./draw.js?v=v2026-10-13T10060";

bootEditorPage({ mode: "DRAW", initEditor: initDrawEditor });
