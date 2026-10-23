#!/usr/bin/env node
// Aktualizacja bibliotek z web/shared/vendor (manifest vendor.json).
// Szuka nowszych wersji w npm: w tej samej głównej serii podmienia plik
// i wpis w manifeście (README), nowszą główną serię tylko zgłasza — zwykle
// wymaga zmian w kodzie stron. Wynik (JSON) na stdout dla workflow
// vendor-updates.yml: { updated: [...], major: [...], specs: "..." }.
//
//   node scripts/vendor-update.mjs          # sprawdza i podmienia
//   node scripts/vendor-update.mjs --check  # tylko sprawdza

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "web/shared/vendor");
const MANIFEST = path.join(VENDOR, "vendor.json");

/** Porównanie wersji x.y.z (bez wersji przedpremierowych). */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/** Najnowsza wersja w tej samej głównej serii i najnowsza ogólnie (tylko stabilne). */
export function pickVersions(current, published) {
  const stable = published.filter(v => /^\d+\.\d+\.\d+$/.test(v)).sort(compareVersions);
  const major = String(current).split(".")[0];
  const sameMajor = stable.filter(v => v.split(".")[0] === major);
  const latestSame = sameMajor.at(-1) || current;
  const latest = stable.at(-1) || current;
  return {
    update: compareVersions(latestSame, current) > 0 ? latestSame : null,
    major: latest.split(".")[0] !== major && compareVersions(latest, current) > 0 ? latest : null,
  };
}

/** Tabela w README.md z manifestu. */
export function readmeTable(libs) {
  return [
    "| Plik | Pakiet npm | Wersja | Licencja | Skąd |",
    "|---|---|---|---|---|",
    ...libs.map(lib => `| \`${lib.file}\` | \`${lib.package}\` | ${lib.version} | ${lib.license} | \`${lib.source}\`${lib.minify ? ", zminifikowany esbuild" : ""} |`),
  ].join("\n");
}

function npm(args, cwd) {
  return execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function fetchFile(lib, version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-"));
  const tgz = npm(["pack", `${lib.package}@${version}`, "--silent"], dir).split("\n").pop();
  execFileSync("tar", ["xzf", tgz], { cwd: dir });
  const source = path.join(dir, "package", lib.source);
  const target = path.join(VENDOR, lib.file);
  if (lib.minify) {
    execFileSync("npx", ["-y", "esbuild@0.24.0", source, "--minify", `--outfile=${target}`], { stdio: "ignore" });
  } else {
    fs.copyFileSync(source, target);
  }
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const result = { updated: [], major: [], specs: "" };
  const specs = new Set();
  for (const lib of manifest.libs) {
    const published = JSON.parse(npm(["view", lib.package, "versions", "--json"], ROOT));
    const { update, major } = pickVersions(lib.version, Array.isArray(published) ? published : [published]);
    if (major) result.major.push({ package: lib.package, current: lib.version, latest: major });
    if (!update) continue;
    result.updated.push({ package: lib.package, from: lib.version, to: update });
    if (!checkOnly) {
      fetchFile(lib, update);
      lib.version = update;
    }
    for (const spec of String(lib.specs || "").split(/\s+/).filter(Boolean)) specs.add(spec);
  }
  if (!checkOnly && result.updated.length) {
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    const readmePath = path.join(VENDOR, "README.md");
    const readme = fs.readFileSync(readmePath, "utf8");
    fs.writeFileSync(readmePath, readme.replace(/\| Plik \| Pakiet npm[\s\S]*?\n\n/, `${readmeTable(manifest.libs)}\n\n`));
  }
  result.specs = [...specs].join(" ");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
