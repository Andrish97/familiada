// Żaden plik w repo nie może zawierać znaczników konfliktu scalania
// (2026-10-09: zatwierdzone znaczniki w web/logo/js zepsuły listę logo na produkcji).
import test from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
