// familiada/logos/js/editor-image.js
// Strona /logos/editor/image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-23T15182";
import { initImageEditor } from "./image.js?v=v2026-10-23T15182";


bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
