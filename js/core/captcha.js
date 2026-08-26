// js/core/captcha.js
// Wydzielone z login.js do osobnego modułu, żeby ta strona nie dźwigała
// ~250 linii Turnstile/hCaptcha integracji zmieszanych z resztą logiki
// formularza. Czyta konfigurację z <body data-captcha-*>, więc
// strona-hostująca musi mieć te atrybuty ustawione (patrz login.html).
// Migracja konta gościa w account.js celowo NIE używa captchy (to
// uwierzytelniona sesja, nie anonimowy formularz publiczny).
import { t, getUiLang } from "../../translation/translation.js?v=v2026-08-26T21191";
import { confirmModal } from "./modal.js?v=v2026-08-26T21191";

const baseUrls = document.body?.dataset || {};
const captchaProvider = String(baseUrls.captchaProvider || "hcaptcha").trim().toLowerCase();
const captchaSiteKey = String(baseUrls.captchaSiteKey || "").trim();
let captchaLoadPromise = null;

export function isCaptchaError(e) {
  const code = String(e?.errorCode || "").trim().toLowerCase();
  if (code === "captcha_required") return true;
  if (String(e?.errorKind || "").toLowerCase() === "security") return true;
  const msg = String(e?.rawMessage || e?.message || "").toLowerCase();
  if (msg.includes("captcha")) return true;
  return false;
}

function getCaptchaLang() {
  const fromPage = document.documentElement?.lang;
  if (fromPage) return String(fromPage).trim().toLowerCase();
  return getUiLang() || "pl";
}

function loadCaptchaApi() {
  if (!captchaSiteKey) return Promise.resolve(null);

  if (captchaProvider === "hcaptcha") {
    const captchaLang = getCaptchaLang();
    const existing = document.querySelector('script[data-captcha="hcaptcha"]');
    const existingLang = existing?.dataset?.captchaLang || "";

    if (window.hcaptcha && existing && existingLang === captchaLang) {
      return Promise.resolve(window.hcaptcha);
    }
    if (existing && existingLang && existingLang !== captchaLang) {
      try { existing.remove(); } catch {}
      try { delete window.hcaptcha; } catch {}
      captchaLoadPromise = null;
    }

    if (captchaLoadPromise) return captchaLoadPromise;
    captchaLoadPromise = new Promise((resolve, reject) => {
      const onloadCallback = "__familiadaHcaptchaOnLoad";
      const cleanup = () => { try { delete window[onloadCallback]; } catch {} };
      window[onloadCallback] = () => {
        cleanup();
        resolve(window.hcaptcha || null);
      };
      const reuse = document.querySelector('script[data-captcha="hcaptcha"]');
      if (reuse) {
        if (window.hcaptcha && reuse.dataset.captchaLang === captchaLang) {
          cleanup();
          resolve(window.hcaptcha);
          return;
        }
        reuse.addEventListener("load", () => resolve(window.hcaptcha || null), { once: true });
        reuse.addEventListener("error", () => reject(new Error("hCaptcha failed to load")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `https://js.hcaptcha.com/1/api.js?render=explicit&onload=${encodeURIComponent(onloadCallback)}&hl=${encodeURIComponent(captchaLang)}`;
      script.async = true;
      script.defer = true;
      script.dataset.captcha = "hcaptcha";
      script.dataset.captchaLang = captchaLang;
      script.onload = () => {
        if (window.hcaptcha) {
          cleanup();
          resolve(window.hcaptcha);
        }
      };
      script.onerror = () => {
        cleanup();
        console.error("[captcha] hcaptcha failed to load");
        reject(new Error("hCaptcha failed to load"));
      };
      document.head.appendChild(script);
    });
    return captchaLoadPromise;
  }

  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (captchaLoadPromise) return captchaLoadPromise;
  captchaLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-captcha="turnstile"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile || null), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.captcha = "turnstile";
    script.onload = () => resolve(window.turnstile || null);
    script.onerror = () => {
      console.error("[captcha] turnstile failed to load");
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return captchaLoadPromise;
}

// -------------------------
// Silent captcha token (Variant B)
// -------------------------

let _silentCaptchaCache = { token: "", expMs: 0 };
let _silentCaptchaInFlight = null;
let _visibleCaptchaInFlight = null;

function getCachedSilentCaptchaToken() {
  const now = Date.now();
  if (_silentCaptchaCache.token && now < (_silentCaptchaCache.expMs || 0)) return _silentCaptchaCache.token;
  return "";
}

function setCachedSilentCaptchaToken(token) {
  const tkn = String(token || "").trim();
  if (!tkn) {
    _silentCaptchaCache = { token: "", expMs: 0 };
    return;
  }
  // Tokens are short-lived; cache briefly to avoid re-render on rapid clicks.
  _silentCaptchaCache = { token: tkn, expMs: Date.now() + 90_000 };
}

async function getSilentCaptchaToken() {
  if (!captchaSiteKey) return null;
  const cached = getCachedSilentCaptchaToken();
  if (cached) return cached;
  if (_silentCaptchaInFlight) return _silentCaptchaInFlight;

  _silentCaptchaInFlight = (async () => {
    const captcha = await loadCaptchaApi();
    if (!captcha?.render) return null;

    const mount = document.createElement("div");
    // Needs real dimensions — Turnstile measures container size during execution.
    // visibility:hidden keeps it invisible but renderable (unlike display:none or 0x0).
    mount.style.position = "fixed";
    mount.style.bottom = "0";
    mount.style.right = "0";
    mount.style.visibility = "hidden";
    mount.style.pointerEvents = "none";
    mount.dataset.theme = "dark";
    document.body.appendChild(mount);

    let token = "";
    let widgetId = null;

    const tokenPromise = new Promise((resolve) => {
      const done = () => resolve(String(token || "").trim());
      const timer = setTimeout(done, 6000);

      const setToken = (value) => {
        token = String(value || "");
        clearTimeout(timer);
        done();
      };

      try {
        if (captchaProvider === "hcaptcha") {
          widgetId = captcha.render(mount, {
            sitekey: captchaSiteKey,
            theme: "dark",
            size: "invisible",
            callback: setToken,
            "expired-callback": () => { token = ""; },
            "error-callback": () => { token = ""; },
          });
          try { captcha.execute(widgetId); } catch {}
        } else {
          widgetId = captcha.render(mount, {
            sitekey: captchaSiteKey,
            theme: "auto",
            size: "flexible",
            appearance: "interaction-only",
            execution: "render",
            callback: setToken,
            "expired-callback": () => { token = ""; },
            "error-callback": () => { token = ""; },
          });
        }
      } catch {
        clearTimeout(timer);
        console.error("[captcha] silent render failed");
        resolve("");
      }
    });

    try {
      const tkn = await tokenPromise;
      if (!tkn) console.warn("[captcha] silent token empty");
      if (tkn) setCachedSilentCaptchaToken(tkn);
      return tkn || null;
    } finally {
      try {
        if (widgetId !== null && widgetId !== undefined) {
          if (captchaProvider === "hcaptcha") captcha.reset(widgetId);
          else captcha.remove(widgetId);
        }
      } catch {}
      try { mount.remove(); } catch {}
    }
  })();

  try {
    return await _silentCaptchaInFlight;
  } finally {
    _silentCaptchaInFlight = null;
  }
}

async function askCaptchaToken() {
  if (!captchaSiteKey) return null;
  if (_visibleCaptchaInFlight) return _visibleCaptchaInFlight;

  _visibleCaptchaInFlight = (async () => {
    const captcha = await loadCaptchaApi();
    if (!captcha?.render) throw new Error(t("index.captchaRequired"));

    const status = document.createElement("div");
    status.style.marginTop = "8px";
    status.style.opacity = "0.85";
    status.style.fontSize = "12px";
    status.textContent = t("index.captchaStatusPending");

    const mount = document.createElement("div");
    mount.dataset.theme = "dark";
    mount.style.minHeight = "84px";
    mount.style.display = "grid";
    mount.style.placeItems = "center";
    mount.appendChild(status);

    let token = "";
    let okBtnRef = null;
    const widgetId = captchaProvider === "hcaptcha"
      ? captcha.render(mount, {
        sitekey: captchaSiteKey,
        theme: "dark",
        size: "normal",
        callback: (value) => {
          token = String(value || "");
          if (token) {
            status.textContent = t("index.captchaStatusOk");
            if (okBtnRef) okBtnRef.click();
          }
        },
        "expired-callback": () => { token = ""; },
        "error-callback": () => { token = ""; },
      })
      : captcha.render(mount, {
        sitekey: captchaSiteKey,
        theme: "auto",
        size: "normal",
        callback: (value) => {
          token = String(value || "");
          if (token) {
            status.textContent = t("index.captchaStatusOk");
            if (okBtnRef) okBtnRef.click();
          }
        },
        "expired-callback": () => { token = ""; },
        "error-callback": (code) => {
          token = "";
          status.textContent = t("index.captchaError") || `Błąd weryfikacji (${code}). Odśwież stronę.`;
          if (okBtnRef) { okBtnRef.style.display = ""; okBtnRef.disabled = true; }
        },
      });

    try {
      const ok = await confirmModal({
        title: t("index.captchaTitle"),
        text: t("index.captchaText"),
        okText: t("index.captchaOk"),
        cancelText: t("index.captchaCancel"),
        body: mount,
        initialFocus: mount,
        onReady: ({ okBtn }) => {
          okBtnRef = okBtn;
          if (okBtnRef) okBtnRef.style.display = "none";
        },
      });

      if (!ok) throw new Error(t("index.captchaRequired"));
      if (!token) {
        console.warn("[captcha] visible token empty");
        throw new Error(t("index.captchaRequired"));
      }
      return token;
    } finally {
      try {
        if (captchaProvider === "hcaptcha") captcha.reset(widgetId);
        else captcha.remove(widgetId);
      } catch {}
    }
  })();

  try {
    return await _visibleCaptchaInFlight;
  } finally {
    _visibleCaptchaInFlight = null;
  }
}

/**
 * @param {{ force?: boolean }} [opts] - force:true skips the silent attempt
 *   and always shows the visible widget (used by login.js once a caller has
 *   failed enough times to warrant it up front).
 */
export async function getCaptchaTokenOrPrompt(opts = {}) {
  if (!captchaSiteKey) return null;
  if (opts.force) return await askCaptchaToken();
  const silent = await getSilentCaptchaToken();
  if (silent) return silent;
  return await askCaptchaToken();
}

export function preloadCaptchaApi() {
  if (captchaSiteKey) void loadCaptchaApi();
}

export function hasCaptcha() {
  return !!captchaSiteKey;
}
