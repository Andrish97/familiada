import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../web/${p}`, import.meta.url), "utf8");

// Zgłoszenie 2026-10-29: na telefonie „Ustawienia konta” otwierały /account/ bez ?ret=,
// bo automatyczne ustawienie konta (domyślne adresy) kończyło się po initPage i je nadpisywało.
test("automatyczne konto w topbarze nie nadpisuje ustawienia strony (initPage)", () => {
  const src = read("shared/js/core/topbar-controller.js");
  assert.match(src, /export function setTopbarAccount\(user, opts\) \{\s*_accountByPage = true;/);
  const auto = src.slice(src.indexOf("export async function autoInitTopbarAuthButton"));
  const body = auto.slice(0, auto.indexOf("\n}\n"));
  const afterUser = body.slice(body.indexOf("await getUser()"));
  assert.match(afterUser, /_accountByPage\) return;\s*applyTopbarAccount\(user\);/);
  assert.doesNotMatch(body, /setTopbarAccount\(/);
});

test("linki .btn w topbarze mają rozmiar czcionki przycisków", () => {
  const css = read("shared/style/components.css");
  const rule = css.slice(css.indexOf(".topbar a.btn {"), css.indexOf("}", css.indexOf(".topbar a.btn {")));
  assert.match(rule, /font-size: 13\.3333px;/);
});
