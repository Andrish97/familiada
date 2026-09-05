#!/usr/bin/env node
// scripts/gen-game-state-docs.mjs
//
// Generuje docs/game-state-machine.md wprost z shared/gameStateMachine.js —
// mapa kroków/przejść nigdy nie może się rozjechać z kodem, bo dokument
// nie jest pisany osobno, tylko WYPROWADZONY z tego samego źródła, które
// egzekwuje assertTransition() w silniku (plan, sekcja 2b).
//
// Użycie:
//   node scripts/gen-game-state-docs.mjs         # zapisuje docs/game-state-machine.md
//   node scripts/gen-game-state-docs.mjs --check  # nic nie zapisuje, kończy się
//                                                   błędem (exit 1) jeśli plik na
//                                                   dysku różni się od wygenerowanego
//                                                   (używane przez test jednostkowy)

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { STEPS, TOP_CARDS } from "../shared/gameStateMachine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "docs", "game-state-machine.md");

function section(title, level = 2) {
  return `${"#".repeat(level)} ${title}\n`;
}

function stepBlock(stepKey, def) {
  const lines = [];
  lines.push(`### \`${stepKey}\``, "");
  lines.push(`- **Karta**: \`${def.card}\``);
  if (def.phases?.length) lines.push(`- **Dozwolone fazy**: ${def.phases.map((p) => `\`${p}\``).join(", ")}`);
  lines.push(`- **Wejście**: ${def.entryTrigger}`);
  lines.push(`- **Zapis (\`detail\`)**: ${def.dataShape}`);
  if (def.gatedBy?.length) lines.push(`- **Bramkowane przez ustawienia**: ${def.gatedBy.map((g) => `\`${g}\``).join(", ")}`);
  lines.push(`- **Display**: ${def.display}`);
  lines.push(`- **Host**: ${def.host}`);
  lines.push(`- **Buzzer**: ${def.buzzer}`);
  if (def.soundCues?.length) lines.push(`- **Dźwięki**: ${def.soundCues.map((s) => `\`${s}\``).join(", ")}`);
  else lines.push(`- **Dźwięki**: —`);
  lines.push(`- **Dozwolone kolejne kroki**: ${def.next?.length ? def.next.map((n) => `\`${n}\``).join(", ") : "— (terminalny)"}`);
  lines.push("");
  return lines.join("\n");
}

export function generateMarkdown() {
  const out = [];
  out.push("<!-- WYGENEROWANE z shared/gameStateMachine.js przez scripts/gen-game-state-docs.mjs — nie edytuj ręcznie. -->", "");
  out.push(section("Mapa stanów gry — public.game_state.step", 1));
  out.push("Ta strona jest wygenerowana z `shared/gameStateMachine.js` — jedynego źródła prawdy, którego `assertTransition()` egzekwuje w `control2/js/engine.js`. Zmiana zachowania wymaga zmiany w kodzie; ten dokument aktualizuje się przez `node scripts/gen-game-state-docs.mjs`.", "");

  for (const card of TOP_CARDS) {
    const stepsForCard = Object.entries(STEPS).filter(([, def]) => def.card === card);
    if (!stepsForCard.length) continue;
    out.push(section(`Karta: \`${card}\``));
    for (const [stepKey, def] of stepsForCard) {
      out.push(stepBlock(stepKey, def));
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function main() {
  const markdown = generateMarkdown();
  const checkOnly = process.argv.includes("--check");

  if (checkOnly) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : null;
    if (current !== markdown) {
      console.error("docs/game-state-machine.md jest nieaktualne względem shared/gameStateMachine.js — uruchom: node scripts/gen-game-state-docs.mjs");
      process.exit(1);
    }
    console.log("docs/game-state-machine.md jest aktualne.");
    return;
  }

  writeFileSync(OUT_PATH, markdown, "utf8");
  console.log(`Zapisano ${OUT_PATH}`);
}

// Uruchom main() tylko przy bezpośrednim wywołaniu (node scripts/gen-...),
// nie przy imporcie generateMarkdown() z testu jednostkowego
// (gameStateDocs.sync.test.js) — inaczej sam import nadpisywałby plik.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
