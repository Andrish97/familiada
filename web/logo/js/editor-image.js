// familiada/logo/js/editor-image.js
// Strona /logos/editor/image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-18T07052";
import { initImageEditor } from "./image.js?v=v2026-10-18T07052";

bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
