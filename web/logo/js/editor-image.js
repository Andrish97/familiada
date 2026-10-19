// familiada/logo/js/editor-image.js
// Strona /logos/editor/image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-19T11161";
import { initImageEditor } from "./image.js?v=v2026-10-19T11161";


bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
