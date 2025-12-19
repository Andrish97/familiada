// js/pages/editor-poll-points.js
import { bootEditor } from "./editor-engine.js";

document.addEventListener("DOMContentLoaded", () => {
  bootEditor({
    type: "poll_points",
    mode: "poll",
    allowAnswers: true,
    allowPoints: false,        // punkty policzą się po sondażu
    ignoreImportPoints: true,  // /punkty ignorujemy
  }).catch((e) => {
    console.error(e);
    alert("Błąd edytora (konsola).");
  });
});
