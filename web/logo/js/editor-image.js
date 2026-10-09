// familiada/logo/js/editor-image.js
// Strona /logo/editor-image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-09T00020";
import { initImageEditor } from "./image.js?v=v2026-10-09T00020";

bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
