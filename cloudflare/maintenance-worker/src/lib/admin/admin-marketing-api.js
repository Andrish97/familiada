// src/lib/admin-marketing-api.js -- /_admin_api/marketing/* (bulk send).
import { json } from "../core/http.js";
import { readJson } from "./admin-auth.js";
import { supabaseRequest, summarizeSupabaseError } from "../core/supabase.js";
import { htmlToPlainTextPreview } from "../email/html-to-text.js";

export async function handleAdminMarketingApi(request, env, url) {
  // POST /_admin_api/marketing/send { emails, subject, template_id, custom_body }
  if (url.pathname === "/_admin_api/marketing/send" && request.method === "POST") {
    const body = await readJson(request);
    const { emails, subject: mktSubject, template_id, custom_body } = body || {};
    if (!Array.isArray(emails) || !emails.length) return json({ ok: false, error: "missing_emails" }, 400);
    if (!mktSubject) return json({ ok: false, error: "missing_subject" }, 400);

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = [...new Set(emails.map(e => String(e).trim().toLowerCase()).filter(e => emailRe.test(e)))];
    if (!validEmails.length) return json({ ok: false, error: "no_valid_emails" }, 400);
    if (validEmails.length > 500) return json({ ok: false, error: "too_many_emails", max: 500 }, 400);

    // custom_body is already full HTML from client (templates in JS)
    const emailHtml = custom_body || "";

    const emailText = htmlToPlainTextPreview(emailHtml);

    // Insert into mail_queue (batch insert for all recipients)
    const queueRows = validEmails.map(email => ({
      to_email: email,
      subject: String(mktSubject),
      html: emailHtml,
      text: emailText,
      from_email: "kontakt@familiada.online",
      meta: { type: "marketing", template_id: template_id || "custom" },
    }));

    const qRes = await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: queueRows,
    });

    if (!qRes.ok) {
      return json({ ok: false, error: "queue_insert_failed", details: summarizeSupabaseError(qRes) }, qRes.status || 500);
    }

    // Save message record for ALL emails in batch (so they appear in "Sent" / "Marketing")
    const messageRows = validEmails.map(email => ({
      to_email: email,
      subject: String(mktSubject),
      body: emailText,
      body_html: emailHtml,
      is_marketing: true,
      direction: 'outbound',
      source: 'email'
    }));

    // Batch insert into messages table
    const mRes = await supabaseRequest(env, "/rest/v1/messages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: messageRows,
    });

    if (!mRes.ok) {
      console.error("[marketing/send] Failed to save message history records", summarizeSupabaseError(mRes));
    }

    return json({ ok: true, queued: validEmails.length, total: validEmails.length });
  }

  return new Response("Not Found", { status: 404 });
}
