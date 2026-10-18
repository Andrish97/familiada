// src/lib/admin-config-api.js -- /_admin_api/config/* (telegram test, lead-finder token).
import { json } from "../core/http.js";
import { getTelegramConfig, sendTelegram } from "../notifications/telegram.js";
import { supabaseRpc, getSupabaseConfig } from "../core/supabase.js";
import { uploadToStorage } from "../core/storage.js";

const HOMEPAGE_SHOTS_KEY = "homepage_screenshot_fixtures_v1";
const HOMEPAGE_SHOTS_MANIFEST_KEY = "homepage_screenshot_manifest_v1";

function parseConfigValue(value) {
  if (Array.isArray(value)) value = value[0]?.admin_config_get ?? value[0]?.value ?? value[0];
  if (value && typeof value === "object") value = value.value ?? value.admin_config_get;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

function base64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

async function handleHomepageScreenshots(request, env, url) {
  if (url.pathname === "/_admin_api/config/homepage-screenshots") {
    if (request.method === "GET") {
      const result = await supabaseRpc(env, "admin_config_get", { p_key: HOMEPAGE_SHOTS_KEY });
      if (!result.ok) return json({ ok: false, error: "screenshot_config_read_failed" }, result.status || 500);
      const config = parseConfigValue(result.data);
      if (!config) return json({ ok: false, error: "screenshot_config_missing" }, 404);
      return json({ ok: true, config });
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => null);
      if (!body?.config || typeof body.config !== "object" || Array.isArray(body.config)) return json({ ok: false, error: "invalid_config" }, 400);
      const serialized = JSON.stringify(body.config);
      if (serialized.length > 900_000) return json({ ok: false, error: "config_too_large" }, 413);
      const result = await supabaseRpc(env, "admin_config_set", {
        p_key: HOMEPAGE_SHOTS_KEY,
        p_value: serialized,
        p_note: "Edytowalne przykładowe dane do zrzutów strony głównej",
      });
      if (!result.ok) return json({ ok: false, error: "screenshot_config_save_failed" }, result.status || 500);
      return json({ ok: true });
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (url.pathname === "/_admin_api/screenshots/upload" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const language = String(body?.language || "");
    const id = String(body?.id || "");
    const mimeType = String(body?.mimeType || "");
    const data = String(body?.data || "");
    const validData = mimeType === "image/png" ? /^iVBORw0KGgo/.test(data)
      : mimeType === "image/webp" ? /^UklGR/.test(data) : false;
    if (!["pl", "en", "uk"].includes(language) || !/^[a-z0-9-]{2,64}$/.test(id) || !validData) {
      return json({ ok: false, error: "invalid_screenshot" }, 400);
    }
    if (data.length > 18_000_000) return json({ ok: false, error: "screenshot_too_large" }, 413);
    try {
      const extension = mimeType === "image/webp" ? "webp" : "png";
      const path = `homepage-screenshots/${language}/${id}.${extension}`;
      await uploadToStorage(env, path, data, mimeType, { upsert: true });
      const cfg = getSupabaseConfig(env);
      const publicUrl = `${cfg.baseUrl}/storage/v1/object/public/${path}?v=${Date.now()}`;
      const previous = await supabaseRpc(env, "admin_config_get", { p_key: HOMEPAGE_SHOTS_MANIFEST_KEY });
      const manifest = parseConfigValue(previous.ok ? previous.data : null) || { version: 1, images: {} };
      manifest.images ||= {};
      manifest.images[language] ||= {};
      manifest.images[language][id] = publicUrl;
      const serialized = JSON.stringify(manifest);
      const saved = await supabaseRpc(env, "admin_config_set", {
        p_key: HOMEPAGE_SHOTS_MANIFEST_KEY,
        p_value: serialized,
        p_note: "Public URLs for current homepage screenshot gallery",
      });
      if (!saved.ok) throw new Error("manifest_save_failed");
      await uploadToStorage(env, "homepage-screenshots/manifest.json", base64Utf8(serialized), "application/json", { upsert: true });
      return json({ ok: true, path: `${language}/${id}.${extension}`, url: publicUrl });
    } catch (error) {
      return json({ ok: false, error: "screenshot_upload_failed", details: String(error?.message || error).slice(0, 240) }, 502);
    }
  }
  return null;
}

export async function handleAdminConfigApi(request, env, url) {

  const screenshotResponse = await handleHomepageScreenshots(request, env, url);
  if (screenshotResponse) return screenshotResponse;

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
