import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// scripts/totp-check.py -- kod przerwy technicznej (maintenance.yml).
// Wektory RFC 6238 (SHA-1, klucz ASCII "12345678901234567890").
const SCRIPT = fileURLToPath(new URL("../../scripts/totp-check.py", import.meta.url));
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const run = (env) => spawnSync("python3", [SCRIPT], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });

test("TOTP: wektory RFC 6238 przyjęte, zwraca numer kroku", () => {
  const r = run({ TOTP_SECRET: SECRET, TOTP_CODE: "287082", TOTP_NOW: "59" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "1");
  const r2 = run({ TOTP_SECRET: SECRET, TOTP_CODE: "081804", TOTP_NOW: "1111111109" });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(r2.stdout.trim(), String(Math.floor(1111111109 / 30)));
});

test("TOTP: 5 minut wstecz tak, starszy nie; jednorazowy", () => {
  // kod z 1111111109 sprawdzany 4,5 min później -- ważny
  assert.equal(run({ TOTP_SECRET: SECRET, TOTP_CODE: "081804", TOTP_NOW: String(1111111109 + 270) }).status, 0);
  // 6 minut później -- wygasł
  assert.equal(run({ TOTP_SECRET: SECRET, TOTP_CODE: "081804", TOTP_NOW: String(1111111109 + 360) }).status, 3);
  // ten sam krok już użyty -- odmowa
  const step = String(Math.floor(1111111109 / 30));
  assert.equal(run({ TOTP_SECRET: SECRET, TOTP_CODE: "081804", TOTP_NOW: "1111111109", TOTP_LAST: step }).status, 4);
});

test("TOTP: zły kod, brak sekretu, nie 6 cyfr; nic nie wypisuje", () => {
  const bad = run({ TOTP_SECRET: SECRET, TOTP_CODE: "000000", TOTP_NOW: "59" });
  assert.equal(bad.status, 3);
  assert.equal(bad.stdout, "");
  assert.equal(run({ TOTP_CODE: "287082", TOTP_NOW: "59" }).status, 2);
  assert.equal(run({ TOTP_SECRET: SECRET, TOTP_CODE: "28708", TOTP_NOW: "59" }).status, 2);
});
