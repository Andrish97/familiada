// src/lib/admin/admin-leads-api.js -- /_admin_api/leads/*: pośrednik panelu
// do usługi lead-finder (leads.familiada.online). Klucz LEAD_FINDER_API_KEY
// zostaje po stronie Workera (audyt E24, Ś2) -- przeglądarka go nie dostaje.
// Tylko ścieżki zleceń wyszukiwania używane przez panel (lista dozwolonych).
// Admin (Cloudflare Access) i CSRF sprawdzone wcześniej w handleAdminApi.
import { json } from "../core/http.js";

export const LEAD_FINDER_BASE = "https://leads.familiada.online";

const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ACTIONS = new Set(["pause", "resume", "cancel"]);

// Zwraca { method, path } usługi albo null, gdy ścieżki nie ma na liście.
export function leadFinderTarget(method, subPath, searchParams) {
  if (method === "GET" && subPath === "search-runs/status") {
    return { path: "/api/search-runs/status" };
  }
  if (method === "POST" && subPath === "search-runs") {
    const raw = Number(searchParams.get("target_count"));
    const count = Number.isFinite(raw) ? Math.max(1, Math.min(1000, Math.round(raw))) : 50;
    return { path: `/api/search-runs?target_count=${count}` };
  }
  const m = /^search-runs\/([^/]+)\/([a-z]+)$/.exec(subPath);
  if (method === "POST" && m && RUN_ID_RE.test(m[1]) && RUN_ACTIONS.has(m[2])) {
    return { path: `/api/search-runs/${m[1].toLowerCase()}/${m[2]}` };
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

  let res;
  try {
    res = await fetch(LEAD_FINDER_BASE + target.path, {
      method,
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
  } catch {
    return json({ ok: false, error: "lead_finder_unreachable" }, 502);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (data !== null && typeof data === "object") return json(data, res.status);
  return json({ ok: false, error: `lead_finder_http_${res.status}` }, res.ok ? 502 : res.status);
}
