// js/core/guest-migrate-reminder.js
// Codzienny baner przypominający gościom o migracji konta (w odróżnieniu od
// guest-info-modal.js, który pokazuje się tylko raz). Pokazuje się raz na
// dzień kalendarzowy, dopóki gość nie kliknie "Nie pokazuj więcej" — wtedy
// znika na stałe (dla tego konta gościa).

import { t } from "../../translation/translation.js?v=v2026-09-03T05574";

const LAST_SHOWN_PREFIX = "fam:guest:migrate_last_shown:";
const DISMISSED_PREFIX = "fam:guest:migrate_dismissed:";

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, lokalny zegar wystarczy
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage niedostępny (np. tryb prywatny) — po prostu nie zapamiętamy stanu
  }
}

function buildBanner(uid) {
  const bar = document.createElement("div");
  bar.id = "guestMigrateReminder";
  bar.style.cssText = [
    "position:sticky", "top:0", "z-index:40",
    "display:flex", "align-items:center", "justify-content:center",
    "gap:14px", "flex-wrap:wrap",
    "padding:10px 16px",
    "background:rgba(255,196,0,.14)",
    "border-bottom:1px solid rgba(255,196,0,.35)",
    "font-size:.85rem", "text-align:center",
  ].join(";");

  const text = document.createElement("span");
  text.textContent = t("guestReminder.text");

  const link = document.createElement("a");
  link.href = "account";
  link.textContent = t("guestReminder.link");
  link.style.cssText = "font-weight:800;color:var(--gold,#ffd76a);text-decoration:underline;white-space:nowrap";

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.textContent = t("guestReminder.dismiss");
  dismissBtn.style.cssText = "background:none;border:none;color:inherit;opacity:.75;text-decoration:underline;cursor:pointer;font-size:inherit;white-space:nowrap";
  dismissBtn.addEventListener("click", () => {
    writeStorage(DISMISSED_PREFIX + uid, "1");
    bar.remove();
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", t("guestReminder.close"));
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none;border:none;color:inherit;opacity:.6;cursor:pointer;font-size:1rem;line-height:1;padding:0 2px";
  closeBtn.addEventListener("click", () => bar.remove()); // tylko na dziś — jutro wróci

  bar.append(text, link, dismissBtn, closeBtn);
  return bar;
}

/**
 * Pokazuje codzienny baner-przypomnienie dla gościa (raz na dzień
 * kalendarzowy, chyba że kliknął wcześniej "Nie pokazuj więcej").
 * Wywołaj zaraz po requireAuth() gdy user.is_guest === true.
 *
 * @param {object} user - enriched user z requireAuth() / getUser()
 */
export function maybeShowGuestMigrateReminder(user) {
  if (!user?.is_guest) return;
  const uid = user.id || "unknown";

  if (readStorage(DISMISSED_PREFIX + uid) === "1") return;
  if (readStorage(LAST_SHOWN_PREFIX + uid) === todayKey()) return;

  const banner = buildBanner(uid);
  document.body.prepend(banner);
  writeStorage(LAST_SHOWN_PREFIX + uid, todayKey());
}
