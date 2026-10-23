// src/lib/core/security-headers.js -- nagłówki bezpieczeństwa dla stron HTML
// (audyt E24, N3). Dotyczy hostów serwowanych przez Worker z Pages (www,
// apex, settings, nieznane subdomeny ze stroną prac/404); usługi przepuszczane
// bez zmian (panel/supabase/api/leads) zostają bez nowych nagłówków.
//
// CSP tylko w trybie Report-Only (bez punktu raportów -- naruszenia widać
// w konsoli przeglądarki); egzekwowane jest wyłącznie frame-ancestors 'self'
// (podglądy Control/ustawień gry i narzędzia panelu osadzają strony z tego
// samego hosta).

const PASSTHROUGH_HOSTS = new Set([
  "panel.familiada.online",
  "supabase.familiada.online",
  "api.familiada.online",
  "leads.familiada.online",
]);

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
  if (!host.endsWith("familiada.online") || PASSTHROUGH_HOSTS.has(host)) return false;
  const type = String(response.headers.get("Content-Type") || "").toLowerCase();
  return type.includes("text/html");
}

export function withSecurityHeaders(request, response) {
  try {
    const host = new URL(request.url).host.toLowerCase();
    if (!securityHeadersApply(host, response)) return response;
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Permissions-Policy", PERMISSIONS_POLICY);
    const csp = headers.get("Content-Security-Policy");
    if (!csp) headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    else if (!/frame-ancestors/i.test(csp)) headers.set("Content-Security-Policy", `${csp}; frame-ancestors 'self'`);
    if (!headers.has("Content-Security-Policy-Report-Only")) {
      headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}
