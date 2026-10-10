// familiada/logo/js/editor-image.js
// Strona /logo/editor/image/?id=<logo> -- edytor trybu IMAGE (editor-page.js).

import { bootEditorPage } from "./editor-page.js?v=v2026-10-10T22301";
import { initImageEditor } from "./image.js?v=v2026-10-10T22301";

bootEditorPage({ mode: "IMAGE", initEditor: initImageEditor });
