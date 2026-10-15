// familiada/logo/js/editor-image.js
// Strona /logo/editor/image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-15T22203";
import { initImageEditor } from "./image.js?v=v2026-10-15T22203";

bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
