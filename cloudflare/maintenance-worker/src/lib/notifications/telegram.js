// src/lib/telegram.js -- Telegram push notifications for admin.
import { json } from "../core/http.js";

export function getTelegramConfig(env) {
  const token  = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env.TELEGRAM_CHAT_ID   || "").trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

export async function sendTelegram({ token, chatId }, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return json({ ok: false, error: `telegram_http_${res.status}`, detail: body.slice(0, 200) });
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) });
  }
}

export async function handleNotifySubmission(request, env) {
  // Rate limit: 1 notification per 5 minutes
  const key = "notify_submission_ts";
  const last = await env.MAINT_KV.get(key);
  const now = Date.now();
  if (last && now - Number(last) < 5 * 60 * 1000) {
    return json({ ok: true });
  }

  let text = null;
  try {
    const body = await request.json();
    text = String(body.text || "").slice(0, 2000);
  } catch {}

  const tg = getTelegramConfig(env);
  if (!tg) return json({ ok: true });

  await env.MAINT_KV.put(key, String(now), { expirationTtl: 600 });
  const message = text || "🎮 Familiada — marketplace\nNowa gra czeka na zatwierdzenie";
  return sendTelegram(tg, message);
}
