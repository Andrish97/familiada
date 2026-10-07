// familiada/logo/js/editor-image.js
// Strona /logo/editor-image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-07T22132";
import { initImageEditor } from "./image.js?v=v2026-10-07T22132";

bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
