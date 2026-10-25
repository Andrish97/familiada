// src/lib/admin/admin-generator-api.js -- /_admin_api/generator/<akcja>:
// pośrednik panelu do funkcji Edge generate-game. Funkcja przyjmuje tylko
// żądania z nagłówkiem X-Internal-Secret (sekret GENERATE_GAME_SECRET), więc
// przeglądarka nie woła jej bezpośrednio. Admin sprawdzony w handleAdminApi.
import { json } from "../core/http.js";
import { supabaseRequest } from "../core/supabase.js";
import { readJson } from "./admin-auth.js";

export const GENERATOR_ACTIONS = new Set([
  "list-producer-games",
  "generate-producer-game",
  "publish-producer-game",
  "update-producer-game",
  "delete-game",
  "check-uniqueness",
  "check-candidate",
  "embed-missing",
]);

export async function handleAdminGeneratorApi(request, env, url) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const action = url.pathname.slice("/_admin_api/generator/".length);
  if (!GENERATOR_ACTIONS.has(action)) return json({ ok: false, error: "unknown_action" }, 404);
  const secret = String(env.GENERATE_GAME_SECRET || "").trim();
  if (!secret) return json({ ok: false, error: "generator_not_configured" }, 503);

  const body = await readJson(request);
  const params = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const res = await supabaseRequest(env, "/functions/v1/generate-game", {
    method: "POST",
    headers: { "X-Internal-Secret": secret },
    body: { ...params, action },
  });
  if (res.ok && ["check-uniqueness", "check-candidate"].includes(action) &&
      (!res.data?.ok || typeof res.data.review_key !== "string" || !res.data.review_key || !Array.isArray(res.data.matches) || typeof res.data.semantic?.complete !== "boolean"))
    return json({ ok: false, error: "uniqueness_unavailable" }, 503);
  if (res.data !== null && typeof res.data === "object") return json(res.data, res.status);
  return json({ ok: false, error: res.ok ? "invalid_response" : `generator_http_${res.status}` }, res.ok ? 502 : res.status);
}
