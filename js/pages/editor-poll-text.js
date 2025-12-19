// js/pages/editor-poll-text.js
import { bootEditor } from "./editor-engine.js";

document.addEventListener("DOMContentLoaded", () => {
  bootEditor({
    type: "poll_text",
    mode: "poll",
    allowAnswers: false,
    allowPoints: false,
    ignoreImportPoints: true,
  }).catch((e) => {
    console.error(e);
    alert("Błąd edytora (konsola).");
  });
});
