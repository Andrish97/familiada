// familiada/logo/js/editor-image.js
// Strona /logo/editor/image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-18T17330";
import { initImageEditor } from "./image.js?v=v2026-10-18T17330";

bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
