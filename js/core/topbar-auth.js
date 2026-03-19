import { signOut } from "./auth.js";
import { isGuestUser } from "./guest-mode.js";
import { t, withLangParam } from "../../translation/translation.js";

export function initTopbarAuthButton({
  user,
  btn = document.getElementById("btnLogout"),
  logoutI18nKey = "builder.nav.logout",
  guestI18nKey = "common.authEntry",
  loginHref = "login",
} = {}) {
  if (!btn) return { guestMode: false };

  const guestMode = !user || isGuestUser(user);
  const labelKey = guestMode ? guestI18nKey : logoutI18nKey;

  btn.textContent = t(labelKey);
  btn.dataset.i18n = labelKey;

  btn.onclick = null;
  btn.addEventListener("click", async () => {
    if (guestMode) {
      location.href = withLangParam(loginHref);
      return;
    }

    await signOut();
    location.href = withLangParam(loginHref);
  });

  return { guestMode };
}


function resolveLogoutKeyByPath(pathname = "") {
  const p = String(pathname || "").toLowerCase();
  if (p.endsWith("/bases")) return "bases.logout";
  if (p.endsWith("/polls-hub")) return "pollsHubPolls.logout";
  if (p.endsWith("/subscriptions")) return "pollsHubSubscriptions.logout";
  if (p.endsWith("/polls")) return "polls.logout";
  if (p.endsWith("/editor")) return "editor.logout";
  if (p.endsWith("/manual")) return "manual.logout";
  if (p.endsWith("/privacy")) return "privacy.logout";
  return "builder.nav.logout";
}

// Pozycjonuje dropdown portal (fixed overlay) pod zadanym przyciskiem/kontenerem
function _repositionDropdown(anchorEl, dropdownEl) {
  if (!anchorEl || !dropdownEl) return;

  const wasHidden = dropdownEl.hidden;
  if (wasHidden) {
    dropdownEl.hidden = false;
    dropdownEl.style.visibility = "hidden";
    dropdownEl.style.pointerEvents = "none";
  }

  dropdownEl.style.position = "fixed";

  const cRect = anchorEl.getBoundingClientRect();
  const mRect = dropdownEl.getBoundingClientRect();
  const padding = 8;

  let left = cRect.right - mRect.width;
  left = Math.min(left, window.innerWidth - mRect.width - padding);
  left = Math.max(left, padding);

  let top = cRect.bottom + 8;
  if (top + mRect.height > window.innerHeight - padding) {
    top = cRect.top - mRect.height - 8;
  }
  top = Math.min(top, window.innerHeight - mRect.height - padding);
  top = Math.max(top, padding);

  dropdownEl.style.left = `${left}px`;
  dropdownEl.style.top = `${top}px`;
  dropdownEl.style.right = "auto";
  dropdownEl.style.transform = "";

  if (wasHidden) {
    dropdownEl.style.visibility = "";
    dropdownEl.style.pointerEvents = "";
    dropdownEl.hidden = true;
  }
}

/**
 * Inicjalizuje account dropdown w topbar-section-4.
 * Chowa #whoStatic i #btnLogout, wstawia .account-wrap z menu.
 *
 * @param {object|null} user        — obiekt user (może być null)
 * @param {object}      [opts]
 * @param {string}      [opts.accountHref="account"]  — ścieżka do strony konta (np. "../account" dla podkatalogów)
 * @param {string}      [opts.loginHref="login"]       — ścieżka do logowania
 * @returns {{ guestMode: boolean }}
 */
export function initTopbarAccountDropdown(user, { accountHref = "account", loginHref = "login" } = {}) {
  const section4 = document.querySelector(".topbar-section-4");
  if (!section4) return { guestMode: false };

  // Zapobiegaj podwójnej inicjalizacji
  if (document.getElementById("topbarAccountWrap")) return { guestMode: !user || isGuestUser(user) };

  const whoStaticEl = document.getElementById("whoStatic");
  const btnLogoutEl = document.getElementById("btnLogout");

  if (!user) {
    // Niezalogowany: zostaw btnLogout jako przycisk do logowania
    if (whoStaticEl) whoStaticEl.style.display = "none";
    if (btnLogoutEl) {
      btnLogoutEl.style.display = "";
      btnLogoutEl.textContent = t("common.authEntry") || "Zaloguj / Załóż konto";
      btnLogoutEl.dataset.i18n = "common.authEntry";
      btnLogoutEl.onclick = () => { location.href = withLangParam(loginHref); };
    }
    return { guestMode: true };
  }

  const guestMode = isGuestUser(user);
  const username = user?.username || user?.email || "—";

  // Schowaj oryginalne elementy
  if (whoStaticEl) whoStaticEl.style.display = "none";
  if (btnLogoutEl) btnLogoutEl.style.display = "none";

  // Schowaj też #who jeśli istnieje w section-4
  const whoEl = section4.querySelector("#who");
  if (whoEl) whoEl.style.display = "none";

  // Zbuduj account-wrap
  const accountWrap = document.createElement("div");
  accountWrap.className = "account-wrap";
  accountWrap.id = "topbarAccountWrap";

  const btnAccount = document.createElement("button");
  btnAccount.className = "btn account-btn";
  btnAccount.type = "button";

  const whoSpan = document.createElement("span");
  whoSpan.className = "account-who";
  whoSpan.textContent = username;

  const chevron = document.createElement("span");
  chevron.className = "account-chevron";
  chevron.textContent = "▾";

  btnAccount.appendChild(whoSpan);
  btnAccount.appendChild(chevron);
  accountWrap.appendChild(btnAccount);

  // Menu (portal do body)
  const accountMenu = document.createElement("div");
  accountMenu.className = "account-menu";
  accountMenu.hidden = true;

  if (!guestMode) {
    const btnSettings = document.createElement("button");
    btnSettings.className = "account-menu-item";
    btnSettings.id = "topbar-account-settings";
    btnSettings.type = "button";
    btnSettings.textContent = t("builder.nav.account") || "Ustawienia konta";
    btnSettings.addEventListener("click", () => {
      accountMenu.hidden = true;
      location.href = withLangParam(accountHref);
    });
    accountMenu.appendChild(btnSettings);
  }

  const btnLogoutMenu = document.createElement("button");
  btnLogoutMenu.className = "account-menu-item";
  btnLogoutMenu.id = "topbar-account-logout";
  btnLogoutMenu.type = "button";
  btnLogoutMenu.textContent = t("common.logout") || "Wyloguj";
  btnLogoutMenu.addEventListener("click", async () => {
    accountMenu.hidden = true;
    await signOut();
    location.href = withLangParam(loginHref);
  });
  accountMenu.appendChild(btnLogoutMenu);

  // Portal do body
  document.body.appendChild(accountMenu);

  // Toggle dropdown
  btnAccount.addEventListener("click", (e) => {
    e.stopPropagation();
    accountMenu.hidden = !accountMenu.hidden;
    if (!accountMenu.hidden) _repositionDropdown(btnAccount, accountMenu);
  });

  document.addEventListener("click", (e) => {
    if (!accountWrap.contains(e.target) && !accountMenu.contains(e.target)) {
      accountMenu.hidden = true;
    }
  });

  window.addEventListener("resize", () => {
    if (!accountMenu.hidden) _repositionDropdown(btnAccount, accountMenu);
  }, { passive: true });

  // Wstaw accountWrap do section-4 przed btnLogout (lub na koniec)
  if (btnLogoutEl && btnLogoutEl.parentNode === section4) {
    section4.insertBefore(accountWrap, btnLogoutEl);
  } else {
    section4.appendChild(accountWrap);
  }

  return { guestMode };
}

export async function autoInitTopbarAuthButton(btn = document.getElementById("btnLogout")) {
  if (!btn) return;
  if (btn.dataset.topbarAuthReady === "1") return;

  const { getUser } = await import("./auth.js");
  const user = await getUser();

  initTopbarAccountDropdown(user);

  btn.dataset.topbarAuthReady = "1";
}
