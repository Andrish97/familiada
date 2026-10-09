#!/usr/bin/env node
// scripts/nav-maps.mjs
//
// Generuje sześć diagramów (mermaid) z PAGES (web/shared/js/core/nav-map.js)
// i wstawia je do docs/nawigacja-mapa-plan.md między znaczniki
// <!-- nav-maps:start --> i <!-- nav-maps:end -->. Mapy A1–C2 (sekcja 3
// dokumentu): rola (niezalogowany / gość / konto) × urządzenie (komputer / telefon).
// Mapy nie są pisane ręcznie — te same dane (buttons, parent, access, device)
// czyta initPage() i test e2e.
//
// Użycie:
//   node scripts/nav-maps.mjs           # zapisuje dokument
//   node scripts/nav-maps.mjs --check   # nic nie zapisuje, exit 1 gdy dokument nieaktualny

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PAGES, buttonVisible, pageRoles } from "../web/shared/js/core/nav-map.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.join(__dirname, "..", "docs", "nawigacja-mapa-plan.md");
export const START = "<!-- nav-maps:start -->";
export const END = "<!-- nav-maps:end -->";

export const MAPS = [
  { id: "A1", role: "anon",  phone: false, title: "Niezalogowany, komputer" },
  { id: "A2", role: "anon",  phone: true,  title: "Niezalogowany, telefon" },
  { id: "B1", role: "guest", phone: false, title: "Gość, komputer" },
  { id: "B2", role: "guest", phone: true,  title: "Gość, telefon" },
  { id: "C1", role: "user",  phone: false, title: "Konto, komputer" },
  { id: "C2", role: "user",  phone: true,  title: "Konto, telefon" },
];

const restricted = (p) => p.device === "wide" || p.device === "noPhone";

/** Strony i przejścia mapy: węzły dla roli i urządzenia, strzałki z przycisków i ↩. */
export function mapGraph({ role, phone }) {
  const nodes = Object.keys(PAGES)
    .filter((id) => pageRoles(id).includes(role))
    .filter((id) => !(phone && restricted(PAGES[id])));
  const set = new Set(nodes);
  const buttons = [];
  for (const id of nodes) {
    for (const [bid, spec] of Object.entries(PAGES[id].buttons || {})) {
      if (set.has(spec.to) && buttonVisible(id, spec, role, phone)) {
        buttons.push({ from: id, to: spec.to, label: spec.custom ? `${bid}*` : bid });
      }
    }
  }
  const backs = [];
  for (const id of nodes) {
    const p = PAGES[id];
    const target = (role === "anon" && p.parentAnon) || p.parent;
    if (target && set.has(target)) backs.push({ from: id, to: target });
  }
  return { nodes, buttons, backs };
}

export function mermaidFor(map) {
  const { nodes, buttons, backs } = mapGraph(map);
  const lines = ["flowchart LR"];
  for (const id of nodes) lines.push(`  ${id}["${PAGES[id].path}"]`);
  for (const b of buttons) lines.push(`  ${b.from} -->|${b.label}| ${b.to}`);
  for (const b of backs) lines.push(`  ${b.from} -.->|↩| ${b.to}`);
  return lines.join("\n");
}

export function generateBlock() {
  const out = [START, "", "<!-- WYGENEROWANE z PAGES przez scripts/nav-maps.mjs — nie edytuj ręcznie. -->", ""];
  out.push("Strzałka ciągła: przycisk z `PAGES[...].buttons` (nazwa = id elementu;");
  out.push("`*` — przycisk z własnym sprawdzeniem przed przejściem). Strzałka kreskowana:");
  out.push("↩ „Wstecz” bez `?ret=` (rodzic z mapy). `?` (instrukcja) prowadzi z każdej");
  out.push("strony z topbarem i nie jest tu rysowane. Przejścia z elementów list");
  out.push("(kafelki gier, baz, logo) nie są przyciskami mapy.");
  out.push("");
  for (const m of MAPS) {
    out.push(`#### Diagram ${m.id} — ${m.title}`, "", "```mermaid", mermaidFor(m), "```", "");
  }
  out.push(END);
  return out.join("\n");
}

export function applyToDoc(doc) {
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  if (a < 0 || b < a) throw new Error(`Brak znaczników ${START} … ${END} w dokumencie`);
  return doc.slice(0, a) + generateBlock() + doc.slice(b + END.length);
}

function main() {
  const current = readFileSync(DOC_PATH, "utf8");
  const next = applyToDoc(current);
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error("docs/nawigacja-mapa-plan.md ma nieaktualne diagramy — uruchom: node scripts/nav-maps.mjs");
      process.exit(1);
    }
    console.log("Diagramy map są aktualne.");
    return;
  }
  writeFileSync(DOC_PATH, next, "utf8");
  console.log(`Zapisano diagramy w ${DOC_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
