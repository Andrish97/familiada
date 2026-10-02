// src/lib/admin-reports-api.js -- /_admin_api/reports/* (legacy, kept for compat).
import { json } from "../core/http.js";
import { clampInt } from "../core/utils.js";
import { supabaseRequest, supabaseRpc, summarizeSupabaseError, normalizeRpcValue, extractScalarNumber } from "../core/supabase.js";
import { buildContactEmail } from "../email/contact-email.js";

export async function handleAdminReportsApi(request, env, url) {

  // GET /_admin_api/reports/list?status=open&limit=50&offset=0
  if (url.pathname === "/_admin_api/reports/list") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const status = String(url.searchParams.get("status") || "open").toLowerCase();
    const allowedStatuses = new Set(["open","replied","closed","all"]);
    if (!allowedStatuses.has(status)) return json({ ok: false, error: "Invalid status" }, 400);

    const limit  = clampInt(url.searchParams.get("limit"),  1, 200, 50);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);

    let qs = "select=id,ticket_number,created_at,email,subject,lang,status,replied_at";
    qs += `&order=created_at.desc&limit=${limit}&offset=${offset}`;
    if (status !== "all") qs += `&status=eq.${encodeURIComponent(status)}`;

    const list = await supabaseRequest(env, `/rest/v1/contact_reports?${qs}`, { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, error: "reports_load_failed", details: summarizeSupabaseError(list) }, list.status || 500);
    }

    const rows = Array.isArray(list.data) ? list.data : [];
    return json({ ok: true, rows, total: rows.length });
  }

  // GET /_admin_api/reports/detail?id=xxx
  if (url.pathname === "/_admin_api/reports/detail") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    const res = await supabaseRequest(env, `/rest/v1/contact_reports?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { method: "GET" });
    if (!res.ok) {
      return json({ ok: false, error: "report_load_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, report: rows[0] });
  }

  // POST /_admin_api/reports/reply { id, message, lang }
  if (url.pathname === "/_admin_api/reports/reply") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { id, message, lang } = body || {};
    if (!id || !message) return json({ ok: false, error: "Missing id or message" }, 400);

    const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";

    // Fetch report for original data
    const reportRes = await supabaseRequest(env, `/rest/v1/contact_reports?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { method: "GET" });
    const reportRow = Array.isArray(reportRes.data) && reportRes.data.length ? reportRes.data[0] : null;
    if (!reportRow) return json({ ok: false, error: "not_found" }, 404);

    const rpc = await supabaseRpc(env, "admin_update_contact_report", {
      p_id:            String(id),
      p_status:        "replied",
      p_reply_message: String(message),
    });
    if (!rpc.ok) {
      return json({ ok: false, error: "update_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
    }
    const result = normalizeRpcValue(rpc.data);
    if (!result?.ok) {
      return json({ ok: false, error: result?.err || "update_failed" }, 422);
    }

    // Send reply email
    try {
      const { subject: replySubject, html } = buildContactEmail({
        type: "reply",
        lang: safeLang,
        ticket: reportRow.ticket_number,
        subject: reportRow.subject,
        message: String(message),
        replyMessage: String(message),
        originalMessage: reportRow.message,
      });
      
      // Generate plain text from HTML for Apple Mail preview
      const emailText = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);

      await supabaseRequest(env, "/rest/v1/mail_queue", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          to_email: reportRow.email,
          subject: replySubject,
          html: html,
          text: emailText,
          from_email: "kontakt@familiada.online",
          meta: { type: "contact_reply", ticket: reportRow.ticket_number, report_id: id },
        },
      });
    } catch (err) {
      console.error("[worker] reports reply: mail_queue insert failed:", err);
    }

    return json({ ok: true });
  }

  // GET /_admin_api/reports/messages?id=xxx
  if (url.pathname === "/_admin_api/reports/messages") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    const rpc = await supabaseRpc(env, "get_report_messages", { p_report_id: id });
    if (!rpc.ok) return json({ ok: false, error: "messages_load_failed" }, rpc.status || 500);
    const msgs = Array.isArray(rpc.data) ? rpc.data : [];
    return json({ ok: true, messages: msgs });
  }

  // POST /_admin_api/reports/close { id }
  if (url.pathname === "/_admin_api/reports/close") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { id } = body || {};
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    const rpc = await supabaseRpc(env, "admin_update_contact_report", {
      p_id:     String(id),
      p_status: "closed",
    });
    if (!rpc.ok) {
      return json({ ok: false, error: "update_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
    }
    const result = normalizeRpcValue(rpc.data);
    if (!result?.ok) {
      return json({ ok: false, error: result?.err || "update_failed" }, 422);
    }
    return json({ ok: true });
  }

  // POST /_admin_api/reports/send { to, subject, message, lang, reply_as? }
  if (url.pathname === "/_admin_api/reports/send") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { to, subject: msgSubject, message, lang, reply_as } = body || {};
    if (!to || !message) return json({ ok: false, error: "Missing to or message" }, 400);

    const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";

    try {
      const { subject: mailSubject, html } = buildContactEmail({
        type: "compose",
        lang: safeLang,
        ticket: null,
        subject: String(msgSubject || ""),
        message: String(message),
        reply_as: reply_as || null,
      });
      
      // Generate plain text from HTML for Apple Mail preview
      const emailText = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);

      await supabaseRequest(env, "/rest/v1/mail_queue", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          to_email: String(to).trim().toLowerCase(),
          subject: mailSubject,
          html: html,
          text: emailText,
          from_email: "kontakt@familiada.online",
          meta: { type: "contact_compose" },
        },
      });
    } catch (err) {
      console.error("[worker] reports send: mail_queue insert failed:", err);
      return json({ ok: false, error: String(err?.message || err) }, 500);
    }

    return json({ ok: true });
  }

  // POST /_admin_api/reports/move-message { message_id, target_ticket }
  if (url.pathname === "/_admin_api/reports/move-message") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { message_id, target_ticket } = body || {};
    if (!message_id || !target_ticket) return json({ ok: false, error: "Missing message_id or target_ticket" }, 400);

    const rpc = await supabaseRpc(env, "admin_move_message", {
      p_message_id:    String(message_id),
      p_target_ticket: String(target_ticket).trim(),
    });
    if (!rpc.ok) return json({ ok: false, error: "rpc_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
    const row = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : null;
    if (!row?.ok) return json({ ok: false, error: row?.err || "move_failed" }, 422);

    try {
      if (row.old_email && row.new_email && row.old_email !== row.new_email) {
        const { subject: s1, html: h1 } = buildContactEmail({
          type: "reply", lang: "pl", ticket: row.old_ticket, subject: "",
          replyMessage: `Twoja wiadomość została przeniesiona do zgłoszenia ${row.new_ticket}.`,
          originalMessage: null,
        });
        await supabaseRequest(env, "/rest/v1/mail_queue", {
          method: "POST", headers: { Prefer: "return=minimal" },
          body: { to_email: row.old_email, subject: s1, html: h1, from_email: "kontakt@familiada.online", meta: { type: "message_moved", from: row.old_ticket, to: row.new_ticket } },
        });
      }
    } catch (err) {
      console.error("[worker] move-message notify failed:", err);
    }

    return json({ ok: true, old_ticket: row.old_ticket, new_ticket: row.new_ticket });
  }

  return new Response("Not Found", { status: 404 });
