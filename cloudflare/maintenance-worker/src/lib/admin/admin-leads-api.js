// src/lib/admin/admin-leads-api.js -- /_admin_api/leads/*: pośrednik panelu
// do Lead Findera przez funkcję Edge lead-finder (usługa tylko w sieci
// Dockera, bez adresu publicznego). Klucz LEAD_FINDER_API_KEY zostaje po
// stronie Workera (audyt E24, Ś2) -- przeglądarka go nie dostaje; funkcja
// przyjmuje go w nagłówku X-Internal-Secret. Tylko akcje używane przez panel
// (lista dozwolonych tu i w supabase/functions/lead-finder/routes.js).
// Admin (Cloudflare Access) i CSRF sprawdzone wcześniej w handleAdminApi.
import { json } from "../core/http.js";
import { supabaseRequest } from "../core/supabase.js";

const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ACTIONS = new Set(["pause", "resume", "cancel"]);

// Ścieżka panelu -> treść żądania do funkcji Edge albo null (spoza listy).
export function leadFinderTarget(method, subPath, searchParams) {
  if (method === "GET" && subPath === "search-runs/status") return { action: "status" };
  if (method === "POST" && subPath === "search-runs") {
    const raw = Number(searchParams.get("target_count"));
    const count = Number.isFinite(raw) ? Math.max(1, Math.min(1000, Math.round(raw))) : 50;
    return { action: "start", target_count: count };
  }
  const m = /^search-runs\/([^/]+)\/([a-z]+)$/.exec(subPath);
  if (method === "POST" && m && RUN_ID_RE.test(m[1]) && RUN_ACTIONS.has(m[2])) {
    return { action: m[2], run_id: m[1].toLowerCase() };
  }
  return null;
}

export async function handleAdminLeadsApi(request, env, url) {
  const method = String(request.method || "GET").toUpperCase();
  const subPath = url.pathname.slice("/_admin_api/leads/".length);
  const target = leadFinderTarget(method, subPath, url.searchParams);
  if (!target) return json({ ok: false, error: "unknown_action" }, 404);
  const key = String(env.LEAD_FINDER_API_KEY || "").trim();
  if (!key) return json({ ok: false, error: "lead_finder_not_configured" }, 503);

  const res = await supabaseRequest(env, "/functions/v1/lead-finder", {
    method: "POST",
    headers: { "X-Internal-Secret": key },
    body: target,
  });
  if (res.data !== null && typeof res.data === "object") return json(res.data, res.status || 502);
  return json({ ok: false, error: res.status ? `lead_finder_http_${res.status}` : "lead_finder_unreachable" }, res.ok ? 502 : (res.status || 502));
}
