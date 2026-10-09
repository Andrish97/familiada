// Żaden plik w repo nie może zawierać znaczników konfliktu scalania
// (2026-10-09: zatwierdzone znaczniki w web/logo/js zepsuły listę logo na produkcji).
const test = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");

test("brak znaczników konfliktu (<<<<<<< / >>>>>>> / |||||||) w plikach repo", () => {
  const root = path.resolve(__dirname, "..", "..");
  let out = "";
  try {
    out = execSync("git grep -nE '^(<<<<<<<|>>>>>>>|\\|\\|\\|\\|\\|\\|\\|)( |$)' -- web tests docs supabase scripts cloudflare", { cwd: root, encoding: "utf8" });
  } catch (e) {
    out = e.status === 1 ? "" : String(e.stdout || e.message);
  }
  assert.strictEqual(out.trim(), "", "znaczniki konfliktu:\n" + out);
});
