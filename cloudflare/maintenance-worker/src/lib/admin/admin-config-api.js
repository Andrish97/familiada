// src/lib/admin-config-api.js -- /_admin_api/config/* (telegram test, lead-finder token).
import { json } from "../core/http.js";
import { getTelegramConfig, sendTelegram } from "../notifications/telegram.js";

export async function handleAdminConfigApi(request, env, url) {

  // POST /_admin_api/config/telegram/test — test push
  if (url.pathname === "/_admin_api/config/telegram/test" && request.method === "POST") {
    const tg = getTelegramConfig(env);
    if (!tg) return json({ ok: false, error: "telegram_not_configured" }, 422);
    return sendTelegram(tg, "✅ Familiada — test powiadomień Telegram\nPowiadomienia push działają poprawnie!");
  }

  // GET /_admin_api/config/lead-finder-token — serve API key to settings frontend
  if (url.pathname === "/_admin_api/config/lead-finder-token" && request.method === "GET") {
    const token = String(env.LEAD_FINDER_API_KEY || "").trim();
    if (!token) return json({ ok: false, error: "not_configured" }, 422);
    return json({ ok: true, token });
  }

  return new Response("Not Found", { status: 404 });
}
