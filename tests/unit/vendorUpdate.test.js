import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compareVersions, pickVersions, readmeTable } from "../../scripts/vendor-update.mjs";

test("wybór wersji: tylko ta sama główna seria do podmiany, nowa seria zgłaszana", () => {
  const published = ["5.2.4", "5.3.0", "5.5.2", "6.0.0-beta1", "6.4.3", "7.4.0"];
  assert.deepEqual(pickVersions("5.3.0", published), { update: "5.5.2", major: "7.4.0" });
  assert.deepEqual(pickVersions("5.5.2", ["5.5.2"]), { update: null, major: null });
  assert.deepEqual(pickVersions("2.118.0", ["2.117.9", "2.118.0", "2.119.1", "3.0.0-rc.1"]), { update: "2.119.1", major: null });
  assert.ok(compareVersions("2.10.0", "2.9.9") > 0);
});

test("manifest bibliotek zgadza się z plikami i README", () => {
  const dir = new URL("../../web/shared/vendor/", import.meta.url);
  const { libs } = JSON.parse(fs.readFileSync(new URL("vendor.json", dir), "utf8"));
  for (const lib of libs) {
    assert.ok(fs.existsSync(new URL(lib.file, dir)), lib.file);
    assert.match(lib.version, /^\d+\.\d+\.\d+$/);
  }
  assert.ok(fs.readFileSync(new URL("README.md", dir), "utf8").includes(readmeTable(libs)), "tabela w README z manifestu");
});
