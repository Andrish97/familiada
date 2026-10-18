// familiada/logo/js/editor-image.js
// Strona /logos/editor/image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-18T08014";
import { initImageEditor } from "./image.js?v=v2026-10-18T08014";

bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
