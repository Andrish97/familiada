// js/core/guest-mode.js
import { applyTranslations, t, withLangParam } from "../../translation/translation.js";

function normalize(v) {
  return String(v || "").trim().toLowerCase();
}

export function isGuestUser(user) {
  if (!user) return false;

  if (user?.is_guest === true) return true;
  if (user?.user_metadata?.is_guest === true) return true;
  if (user?.app_metadata?.is_guest === true) return true;

  const username = normalize(user?.username || user?.user_metadata?.username);
  if (username.startsWith("guest_")) return true;

  const email = normalize(user?.email);
  if (email.startsWith("guest_")) return true;

  return false;
}

export function hideForGuest(user, elements = []) {
  const guest = isGuestUser(user);
  if (!guest) return false;
  for (const el of elements) {
    if (!el) continue;
    el.style.display = "none";
  }
  return true;
}

export function showGuestBlockedOverlay({
  backHref = "builder.html",
  loginHref = "login.html?force_auth=1",
  showLoginButton = true,
} = {}) {
  let overlay = document.getElementById("guestAccessGuard");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "guestAccessGuard";

    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif",
      background: "rgba(0,0,0,.78)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      color: "#fff",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      boxSizing: "border-box",
      overscrollBehavior: "none",
    });

    overlay.innerHTML = `
      <div style="
        width:100%;max-width:560px;box-sizing:border-box;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.18);
        border-radius:18px;padding:18px;text-align:left;
      ">
        <div data-i18n="guestGuard.title"
          style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;"
        >${t("guestGuard.title")}</div>

        <div data-i18n="guestGuard.message" style="opacity:.9;line-height:1.4;word-wrap:break-word;">
          ${t("guestGuard.message")}
        </div>

        <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
          <button id="guestAccessGuardBack" type="button" data-i18n="guestGuard.back" style="
            appearance:none;border:0;border-radius:12px;padding:10px 14px;
            font-weight:800;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;
          ">${t("guestGuard.back")}</button>
          <button id="guestAccessGuardLogin" type="button" data-i18n="guestGuard.login" style="
            appearance:none;border:0;border-radius:12px;padding:10px 14px;
            font-weight:800;cursor:pointer;background:rgba(255,220,120,.24);color:#fff;
          ">${t("guestGuard.login")}</button>
        </div>
      </div>
    `;

    overlay.querySelector("#guestAccessGuardBack")?.addEventListener("click", () => {
      location.href = withLangParam(backHref);
    });

    overlay.querySelector("#guestAccessGuardLogin")?.addEventListener("click", () => {
      location.href = withLangParam(loginHref);
    });

    document.documentElement.appendChild(overlay);
  }

  overlay.style.display = "flex";
  const loginBtn = overlay.querySelector("#guestAccessGuardLogin");
  if (loginBtn) loginBtn.style.display = showLoginButton ? "" : "none";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  applyTranslations(overlay);
}
