// Cloudflare Turnstile poza stroną logowania (formularz kontaktu): token
// weryfikuje Worker (audyt E24, P2). Widżet „interaction-only” -- zwykle
// niewidoczny, pokazuje się tylko, gdy Cloudflare chce wyzwania.
// Strona logowania ma własną obsługę (web/login/js/login.js) i sitekey w <body>.
const SITE_KEY = "0x4AAAAAACgSBNCEZ9064to_";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TIMEOUT_MS = 120000;
let loading = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_load")));
    script.onerror = () => { loading = null; reject(new Error("turnstile_load")); };
    document.head.append(script);
  });
  return loading;
}

// Jednorazowy token; host -- element, w którym może pojawić się wyzwanie.
export async function getTurnstileToken(host, { lang = "pl" } = {}) {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const mount = document.createElement("div");
    host.replaceChildren(mount);
    host.hidden = false;
    let widgetId = null;
    const finish = (fn, value) => {
      clearTimeout(timer);
      try { if (widgetId !== null) turnstile.remove(widgetId); } catch {}
      host.replaceChildren();
      host.hidden = true;
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("turnstile_timeout")), TIMEOUT_MS);
    widgetId = turnstile.render(mount, {
      sitekey: document.body?.dataset?.captchaSiteKey || SITE_KEY,
      appearance: "interaction-only",
      language: lang,
      callback: (token) => finish(resolve, token),
      "error-callback": () => finish(reject, new Error("turnstile_error")),
    });
  });
}
