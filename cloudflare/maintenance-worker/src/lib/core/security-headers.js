// src/lib/core/security-headers.js -- nagłówki bezpieczeństwa dla stron HTML
// (audyt E24, N3). Dotyczy hostów serwowanych przez Worker z Pages (www,
// apex, settings, nieznane subdomeny ze stroną prac/404); usługi przepuszczane
// bez zmian (panel/supabase/api/docker) zostają bez nowych nagłówków.
//
// Pełna CSP w trybie Report-Only (naruszenia w konsoli przeglądarki).
// Egzekwowane są ograniczenia osadzania, obiektów, bazowego URL i formularzy
// (podglądy Control/ustawień gry i narzędzia panelu osadzają strony z tego
// samego hosta).

const PASSTHROUGH_HOSTS = new Set([
  "panel.familiada.online",
  "supabase.familiada.online",
  "api.familiada.online",
  "docker.familiada.online",
]);

const APP_HOSTS = new Set(["familiada.online", "www.familiada.online", "admin.familiada.online"]);
const CSP_BASELINE = ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"];
// Zachowujemy obecne ograniczenia źródeł reguły strefy także po jej wyłączeniu.
// Usunięcie unsafe-inline/eval wymaga osobnej migracji i kontroli bibliotek.
const CSP_SOURCE_POLICY = [
  "script-src 'unsafe-inline' 'unsafe-eval' 'self' https://cdn.jsdelivr.net https://challenges.cloudflare.com",
  "connect-src 'self' https://api.familiada.online wss://api.familiada.online https://cdn.jsdelivr.net",
  "frame-src 'self' https://challenges.cloudflare.com",
];

export function httpsRedirect(request) {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || !APP_HOSTS.has(url.hostname)) return null;
  url.protocol = "https:";
  url.port = "";
  if (url.hostname === "familiada.online") url.hostname = "www.familiada.online";
  // 308 zachowuje metodę i treść żądania; żadnej obsługi API/sesji po HTTP.
  return Response.redirect(url.toString(), 308);
}

const CAPTCHA = "https://challenges.cloudflare.com https://hcaptcha.com https://*.hcaptcha.com";

// Źródła z web/: biblioteki stron z własnej domeny (web/shared/vendor:
// supabase-js, fabric, jsQR); z cdn.jsdelivr.net już tylko panel admina
// (TinyMCE, opentype), opentype też z cdnjs (narzędzia panelu),
// captcha (Turnstile/hCaptcha), API i Realtime Supabase, pliki Storage.
// Skrypty i style inline są używane (JSON-LD, style="..."), stąd 'unsafe-inline'.
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://static.cloudflareinsights.com ${CAPTCHA}`,
  `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net ${CAPTCHA}`,
  "img-src 'self' data: blob: https://api.familiada.online https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "media-src 'self' data: blob: https://api.familiada.online",
  `connect-src 'self' https://api.familiada.online wss://api.familiada.online https://cdn.jsdelivr.net https://cdnjs.cloudflare.com ${CAPTCHA}`,
  `frame-src 'self' blob: data: ${CAPTCHA}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

export const PERMISSIONS_POLICY = "camera=(self), microphone=(), geolocation=(), payment=(), usb=()";

export function securityHeadersApply(host, response) {
  if (!(host === "familiada.online" || host.endsWith(".familiada.online")) || PASSTHROUGH_HOSTS.has(host)) return false;
  const type = String(response.headers.get("Content-Type") || "").toLowerCase();
  return type.includes("text/html");
}

export function withSecurityHeaders(request, response) {
  try {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const html = securityHeadersApply(host, response);
    const hsts = url.protocol === "https:" && APP_HOSTS.has(host);
    if (!html && !hsts) return response;
    const headers = new Headers(response.headers);
    // Tylko sprawdzone hosty aplikacji: bez includeSubDomains ani preload.
    if (hsts && !headers.has("Strict-Transport-Security")) headers.set("Strict-Transport-Security", "max-age=604800");
    if (!html) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Permissions-Policy", PERMISSIONS_POLICY);
    const csp = headers.get("Content-Security-Policy") || "";
    const directives = new Set(csp.split(";").map((part) => part.trim().split(/\s+/)[0].toLowerCase()));
    const missing = CSP_BASELINE.filter((part) => !directives.has(part.split(" ")[0]));
    // Nie zastępujemy bardziej restrykcyjnego default-src jego luźniejszym
    // wyjątkiem dla skryptów/połączeń/ramek.
    const sources = directives.has("default-src") ? []
      : CSP_SOURCE_POLICY.filter((part) => !directives.has(part.split(" ")[0]));
    headers.set("Content-Security-Policy", [csp, ...missing, ...sources].filter(Boolean).join("; "));
    if (!headers.has("Content-Security-Policy-Report-Only")) {
      headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}
