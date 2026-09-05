// tests/unit/gameStateDocs.sync.test.js
// Pilnuje, że docs/game-state-machine.md jest zawsze zgodne z
// shared/gameStateMachine.js — dokument jest WYPROWADZONY z kodu
// (scripts/gen-game-state-docs.mjs), więc ten test wykrywa, gdy ktoś
// zmienił STEPS bez ponownego wygenerowania dokumentu (albo ręcznie
// edytował docs/game-state-machine.md, co nie powinno się zdarzyć — plik
// ma nagłówek "nie edytuj ręcznie").

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateMarkdown } from "../../scripts/gen-game-state-docs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.join(__dirname, "..", "..", "docs", "game-state-machine.md");

test("docs/game-state-machine.md jest zsynchronizowane z shared/gameStateMachine.js", () => {
  const onDisk = readFileSync(DOC_PATH, "utf8");
  const generated = generateMarkdown();
  assert.equal(
    onDisk,
    generated,
    "docs/game-state-machine.md jest nieaktualne — uruchom: node scripts/gen-game-state-docs.mjs"
  );
});
