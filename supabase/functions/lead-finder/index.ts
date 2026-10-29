import { timingSafeEqual } from "../_shared/internal-auth.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceRoute } from "./routes.js";

// Sterowanie Lead Finderem (familijna-server/docs/lead-finder-nowy-plan.md „Usługa”). Usługa
// działa tylko w sieci Dockera (familiada-lead-finder:8001), bez adresu
// publicznego. Woła tylko Worker (/_admin_api/leads/*, panel admina za
// Cloudflare Access) z nagłówkiem X-Internal-Secret = LEAD_FINDER_API_KEY.
// Ten sam klucz idzie dalej do usługi jako Bearer. Bez CORS.
const SERVICE_URL = (Deno.env.get("LEAD_FINDER_URL") || "http://familiada-lead-finder:8001").replace(/\/+$/, "");



function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const key = (Deno.env.get("LEAD_FINDER_API_KEY") || "").trim();
  if (!key) return json({ ok: false, error: "lead_finder_not_configured" }, 503);
  if (!timingSafeEqual(req.headers.get("x-internal-secret") || "", key)) return json({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const route = serviceRoute(body);
  if (!route) return json({ ok: false, error: "unknown_action" }, 404);

  let res: Response;
  try {
    res = await fetch(SERVICE_URL + route.path, {
      method: route.method,
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return json({ ok: false, error: "lead_finder_unreachable" }, 502);
  }
  const text = await res.text();
  try {
    const data = text ? JSON.parse(text) : null;
    if (data !== null && typeof data === "object") return json(data, res.status);
  } catch { /* odpowiedź nie-JSON */ }
  return json({ ok: false, error: `lead_finder_http_${res.status}` }, res.ok ? 502 : res.status);
});
