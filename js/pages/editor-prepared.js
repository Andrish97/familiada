// js/pages/editor-prepared.js
import { bootEditor } from "./editor-engine.js";

document.addEventListener("DOMContentLoaded", () => {
  bootEditor({
    type: "prepared",
    mode: "fixed",
    allowAnswers: true,
    allowPoints: true,         // ręczne punkty
    ignoreImportPoints: false, // /punkty bierzemy
  }).catch((e) => {
    console.error(e);
    alert("Błąd edytora (konsola).");
  });
});
