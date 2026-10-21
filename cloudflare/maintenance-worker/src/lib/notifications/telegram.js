// src/lib/telegram.js -- Telegram push notifications for admin.
import { json } from "../core/http.js";

export function getTelegramConfig(env) {
  const token  = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env.TELEGRAM_CHAT_ID   || "").trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

// Shared cooldown gate for admin notifications -- each call site uses its own
// KV key so e.g. a contact-form submission doesn't suppress an email notify.
// Returns true (and marks the slot as used) only if the cooldown has elapsed.
export async function claimNotifySlot(env, key, cooldownMs = 5 * 60 * 1000) {
  const last = await env.MAINT_KV.get(key);
  const now = Date.now();
  if (last && now - Number(last) < cooldownMs) return false;
  await env.MAINT_KV.put(key, String(now), { expirationTtl: 600 });
  return true;
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
  // Uwaga: w przeciwienstwie do claimNotifySlot() nizej, KV jest tu
  // oznaczane jako "wyslane" TYLKO gdy tg jest skonfigurowane (patrz if
  // (!tg) ponizej) -- inny ksztalt niz contact.js/inbound-email.js, gdzie
  // sprawdzenie tg zawsze poprzedza check+mark, wiec nie da sie tego
  // bezpiecznie scalic bez zmiany zachowania w przypadku braku tg.
  const key = "notify_submission_ts";
  const last = await env.MAINT_KV.get(key);
  const now = Date.now();
  if (last && now - Number(last) < 5 * 60 * 1000) {
    return json({ ok: true });
  }

  // Publiczny endpoint: nie przekazujemy tekstu od klienta (parse_mode HTML,
  // treść szła prosto do Telegrama). Stały komunikat + opcjonalny UUID gry.
  let gameId = "";
  try {
    const body = await request.json();
    const raw = String(body?.game_id || "").trim().toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)) gameId = raw;
  } catch {}

  const tg = getTelegramConfig(env);
  if (!tg) return json({ ok: true });

  await env.MAINT_KV.put(key, String(now), { expirationTtl: 600 });
  const message = "🎮 Familiada — marketplace\nNowa gra czeka na zatwierdzenie" + (gameId ? `\nID: ${gameId}` : "");
  return sendTelegram(tg, message);
}
