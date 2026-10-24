// Panel admina (E23 §8a) jest podzielony na moduły paneli w web/admin/js/ —
// testy czytające kod panelu dostają tekst wszystkich modułów naraz.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../web/admin/js");
export const ADMIN_PANEL_MODULES = [
  "settings.js", "core.js", "tabs.js", "maintenance.js", "mail-settings.js", "stats.js", "ratings.js",
  "marketplace.js", "mailbox.js", "tools.js", "marketing.js", "marketing-contacts.js",
];

export function adminPanelSource() {
  return ADMIN_PANEL_MODULES.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
}
