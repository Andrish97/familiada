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
