import { signOut } from "./auth.js";
import { isGuestUser } from "./guest-mode.js";
import { t, withLangParam } from "../../translation/translation.js";

export function initTopbarAuthButton({
  user,
  btn = document.getElementById("btnLogout"),
  logoutI18nKey = "builder.nav.logout",
  guestI18nKey = "common.authEntry",
  loginHref = "login.html",
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
  if (p.endsWith("/bases.html")) return "bases.logout";
  if (p.endsWith("/polls-hub.html")) return "pollsHubPolls.logout";
  if (p.endsWith("/subscriptions.html")) return "pollsHubSubscriptions.logout";
  if (p.endsWith("/polls.html")) return "polls.logout";
  if (p.endsWith("/editor.html")) return "editor.logout";
  if (p.endsWith("/manual.html")) return "manual.logout";
  if (p.endsWith("/privacy.html")) return "privacy.logout";
  return "builder.nav.logout";
}

export async function autoInitTopbarAuthButton(btn = document.getElementById("btnLogout")) {
  if (!btn) return;
  if (btn.dataset.topbarAuthReady === "1") return;

  const { getUser } = await import("./auth.js");
  const user = await getUser();

  initTopbarAuthButton({
    user,
    btn,
    logoutI18nKey: resolveLogoutKeyByPath(location.pathname),
  });

  btn.dataset.topbarAuthReady = "1";
}
