import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// Bez stron modalnych (docs/nawigacja-mapa-plan.md): instrukcja, prywatność i
// ustawienia gry to zwykłe strony; Control przechodzi do nich zwykłym linkiem.
test("manual, privacy i ustawienia gry nie mają trybu ?modal= ani protokołu gs:*", () => {
  const files = [
    "manual/index.html", "manual/js/manual.js", "manual/css/manual.css",
    "privacy/index.html", "privacy/js/privacy.js",
    "games/settings/index.html", "games/settings/js/game-settings.js", "shared/css/game-settings.css",
    "control/index.html", "control/js/app.js", "control/css/control.css",
  ];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /[?&]modal=|\.(get|set)\(["']modal["']|isModalMode|isControlModal/, `${file}: tryb ?modal=`);
    assert.doesNotMatch(src, /gs-modal-mode|manual-in-control-modal|html\.modal-mode|"gs:|'gs:/, `${file}: tryb okna`);
  }
});

test("Control otwiera ustawienia i instrukcję zwykłym przejściem, bez iframe", () => {
  const html = read("control/index.html");
  const app = read("control/js/app.js");
  assert.doesNotMatch(html, /id="(gsFrame|gsOverlay|helpFrame|legalFrame|helpOverlay|legalOverlay)"/);
  assert.match(app, /linkTo\("gameSettings", \{ id: gameId \}\)/);
  assert.doesNotMatch(app, /postMessage|gsFrame|helpFrame|legalFrame/);
});

test("ustawienia gry zapisują się same: bez przycisku Zapisz i pytań o niezapisane zmiany", () => {
  const html = read("games/settings/index.html");
  const js = read("games/settings/js/game-settings.js");
  assert.doesNotMatch(html, /btnSaveAll|btnGsModalClose|btnToggleSidebar|helpOverlay/);
  assert.doesNotMatch(js, /unsavedConfirm|beforeunload|btnSaveAll/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /pagehide/);
});
