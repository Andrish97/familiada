// src/lib/contact.js -- public contact-form endpoints.
import { json, readJsonOr400 } from "../core/http.js";
import { supabaseRpc, supabaseRequest, normalizeRpcValue, summarizeSupabaseError } from "../core/supabase.js";
import { uploadToStorage } from "../core/storage.js";
import { buildContactEmail } from "./contact-email.js";
import { getTelegramConfig, sendTelegram, claimNotifySlot } from "../notifications/telegram.js";
import { htmlToPlainTextPreview } from "./html-to-text.js";
import { normalizeLang } from "../core/utils.js";

export async function handleContactSubmit(request, env) {
  const body = await readJsonOr400(request);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_body" }, 400);

  const { email, subject, message, lang = "pl", attachments: formAttachments = [] } = body;

  const rpc = await supabaseRpc(env, "save_form_message", {
    p_email:   String(email   || "").trim().toLowerCase(),
    p_subject: String(subject || "").trim(),
    p_body:    String(message || "").trim(),
    p_lang:    String(lang    || "pl"),
  });

  if (!rpc.ok) {
    return json({ ok: false, error: "rpc_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
  }

  const row = normalizeRpcValue(rpc.data);
  if (!row?.ok) {
    const err = row?.err || "submit_failed";
    const status = err === "rate_limited_email" ? 429 : 422;
    return json({ ok: false, error: err }, status);
  }

  const ticket = row.ticket_number;
  const msgId = row.message_id;
  const safeLang = normalizeLang(lang);

  // Save form attachments
  if (msgId && Array.isArray(formAttachments) && formAttachments.length) {
    for (const att of formAttachments.slice(0, 5)) {
      try {
        const filename = String(att.filename || "file").replace(/[^\w.\-]/g, "_").slice(0, 100);
        const mimeType = String(att.mime_type || "application/octet-stream");
        const data_b64 = String(att.data_b64 || "");
        if (!data_b64) continue;
        const size = Math.round(data_b64.length * 0.75);
        if (size > 5 * 1024 * 1024) continue;
        const objectKey = `form_${msgId}_${filename}`;
        const storagePath = `message-attachments/${objectKey}`;
        await uploadToStorage(env, storagePath, data_b64, mimeType);
        await supabaseRpc(env, "save_attachment", {
          p_message_id: msgId, p_filename: filename, p_mime_type: mimeType,
          p_size: size, p_storage_path: storagePath, p_inline: false,
        });
      } catch (err) {
        console.error("[contact] attachment upload failed:", err);
      }
    }
  }

  // Send confirmation email
  try {
    const { subject: confirmSubject, html } = buildContactEmail({
      type: "confirmation",
      lang: safeLang,
      ticket,
      subject: String(subject || "").trim(),
      message: String(message || "").trim(),
    });
    
    const emailText = htmlToPlainTextPreview(html);

    await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        to_email: String(email || "").trim().toLowerCase(),
        subject: confirmSubject,
        html: html,
        text: emailText,
        from_email: "no-reply@familiada.online",
        meta: { type: "contact_confirmation", ticket },
      },
    });
  } catch (err) {
    console.error("[worker] contact: mail_queue insert failed:", err);
  }

  // Notify admin via Telegram (best-effort, rate-limited)
  try {
    const tg = getTelegramConfig(env);
    if (tg && await claimNotifySlot(env, "notify_form_ts")) {
      await sendTelegram(tg, `📬 Familiada — nowe zgłoszenie\n#${ticket}`);
    }
  } catch (err) {
    console.error("[worker] contact: telegram notify failed:", err);
  }

  return json({ ok: true, ticket_number: ticket });
}

export async function handleContactAppend(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await readJsonOr400(request);
  if (body instanceof Response) return body;

  const { email, ticket, message, lang = "pl" } = body || {};
  if (!email || !email.includes("@")) return json({ ok: false, error: "invalid_email" }, 422);
  if (!ticket) return json({ ok: false, error: "missing_ticket" }, 422);
  if (!message || String(message).trim().length < 2) return json({ ok: false, error: "invalid_message" }, 422);

  const ticketStr = String(ticket).trim();
  const rpc = await supabaseRpc(env, "save_inbound_message", {
    p_from_email:    String(email).trim().toLowerCase(),
    p_subject:       `Re: [${ticketStr}]`,
    p_body:          String(message).trim().slice(0, 5000),
    p_body_html:     null,
    p_ticket_number: ticketStr,
  });

  if (!rpc.ok) return json({ ok: false, error: "rpc_failed" }, 500);
  const row = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : null;
  if (!row?.report_id) return json({ ok: false, error: "ticket_not_found" }, 404);

  return json({ ok: true, ticket_number: ticketStr });
}
