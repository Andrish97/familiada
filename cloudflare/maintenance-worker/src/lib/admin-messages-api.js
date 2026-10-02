// src/lib/admin-messages-api.js -- /_admin_api/messages*, /cleanup/trash, /attachments*.
import { json } from "./http.js";
import { readJson } from "./admin-auth.js";
import { clampInt } from "./utils.js";
import { supabaseRpc, supabaseRequest, summarizeSupabaseError, normalizeRpcValue, extractScalarNumber, getSupabaseConfig } from "./supabase.js";
import { deleteAttachmentStorageFiles } from "./cleanup.js";
import { downloadFromStorage } from "./storage.js";

export async function handleAdminMessagesApi(request, env, url) {

  // GET /_admin_api/messages?filter=inbox|sent|trash|<uuid>&limit=50&offset=0
  if (url.pathname === "/_admin_api/messages" && request.method === "GET") {
    const filter = String(url.searchParams.get("filter") || "inbox");
    const limit  = clampInt(url.searchParams.get("limit"),  1, 200, 50);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
    console.log("[messages] Calling list_messages RPC with:", { filter, limit, offset });
    const res = await supabaseRpc(env, "list_messages", { p_filter: filter, p_limit: limit, p_offset: offset });
    console.log("[messages] RPC result:", { ok: res.ok, status: res.status, dataRows: Array.isArray(res.data) ? res.data.length : 'N/A' });
    if (!res.ok) {
      console.error("[messages] RPC failed:", res);
      return json({ ok: false, error: "list_messages_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    }
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/messages/detail?id=<uuid>
  if (url.pathname === "/_admin_api/messages/detail" && request.method === "GET") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    const res = await supabaseRpc(env, "get_message", { p_id: id });
    if (!res.ok) return json({ ok: false, error: "get_message_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    const msg = Array.isArray(res.data) && res.data.length ? res.data[0] : normalizeRpcValue(res.data);
    if (!msg) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, message: msg });
  }

  // PUT /_admin_api/messages/assign  { message_id, report_id? }
  if (url.pathname === "/_admin_api/messages/assign" && request.method === "PUT") {
    const body = await readJson(request);
    const { message_id, report_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);

    let res;
    if (report_id) {
      res = await supabaseRpc(env, "assign_message_to_report", { p_message_id: message_id, p_report_id: report_id });
    } else {
      res = await supabaseRpc(env, "unassign_message_report", { p_message_id: message_id });
    }
    if (!res.ok) return json({ ok: false, error: "assign_failed", details: summarizeSupabaseError(res) }, res.status || 500);

    return json({ ok: true });
  }

  // POST /_admin_api/messages/marketing  { is_marketing: boolean }
  if (url.pathname === "/_admin_api/messages/marketing" && request.method === "POST") {
    const messageId = url.searchParams.get("id");
    if (!messageId) return json({ ok: false, error: "missing_id" }, 400);
    const body = await readJson(request);
    const { is_marketing } = body || {};
    
    const updateRes = await supabaseRequest(env, `/rest/v1/messages?id=eq.${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { is_marketing: is_marketing === true },
    });
    
    if (!updateRes.ok) return json({ ok: false, error: "update_failed", details: summarizeSupabaseError(updateRes) }, updateRes.status || 500);
    return json({ ok: true });
  }

  // PUT /_admin_api/messages/trash  { message_id }
  if (url.pathname === "/_admin_api/messages/trash" && request.method === "PUT") {
    const body = await readJson(request);
    const { message_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);
    const res = await supabaseRpc(env, "trash_message", { p_message_id: message_id });
    if (!res.ok) return json({ ok: false, error: "trash_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // PUT /_admin_api/messages/restore  { message_id }
  if (url.pathname === "/_admin_api/messages/restore" && request.method === "PUT") {
    const body = await readJson(request);
    const { message_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);
    const res = await supabaseRpc(env, "restore_message", { p_message_id: message_id });
    if (!res.ok) return json({ ok: false, error: "restore_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // DELETE /_admin_api/messages/delete  { message_id }
  if (url.pathname === "/_admin_api/messages/delete" && request.method === "DELETE") {
    const body = await readJson(request);
    const { message_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);

    // Skasuj pliki załączników ZANIM skasujemy wiadomość — ON DELETE CASCADE
    // usunie wiersze message_attachments, po czym pliki byłyby nie do znalezienia.
    const attRes = await supabaseRpc(env, "get_message_attachments", { p_message_id: message_id });
    if (attRes.ok && Array.isArray(attRes.data)) {
      await deleteAttachmentStorageFiles(env, attRes.data);
    }

    const res = await supabaseRpc(env, "delete_message", { p_message_id: message_id });
    if (!res.ok) return json({ ok: false, error: "delete_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // POST /_admin_api/messages/send  { to_email, subject, body, body_html?, report_id?, attachments? }
  if (url.pathname === "/_admin_api/messages/send" && request.method === "POST") {
    const body = await readJson(request);
    const { to_email, subject: msgSubject, body: msgBody, body_html, report_id, attachments: sendAttachments } = body || {};
    if (!to_email || !msgBody) return json({ ok: false, error: "missing_to_email_or_body" }, 400);

    // Use body_html from client if provided (TinyMCE HTML), otherwise use plain text
    const emailHtml = body_html || String(msgBody);

    // Generate plain text from HTML for Apple Mail preview
    // IMPORTANT: Strip <style> blocks FIRST before removing HTML tags
    const emailText = emailHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove <style> blocks FIRST
      .replace(/<[^>]*>/g, ' ')                           // Remove all HTML tags
      .replace(/:[^;]+;/g, ' ')                           // Remove CSS properties
      .replace(/&nbsp;/g, ' ')                            // Replace &nbsp;
      .replace(/&amp;/g, '&')                             // Replace &amp;
      .replace(/\s+/g, ' ')                              // Collapse whitespace
      .trim()
      .slice(0, 500);                                     // Limit length for preview

    // Insert into mail_queue first
    const queueRes = await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        to_email: String(to_email).trim().toLowerCase(),
        subject:  String(msgSubject || ""),
        html:     emailHtml,
        text:     emailText,
        from_email: "kontakt@familiada.online",
        meta: { type: "admin_compose", report_id: report_id || null, attachments: sendAttachments?.map(a => ({ filename: a.filename, mime_type: a.mime_type, storage_path: a.storage_path })) || [] },
      },
    });
    const queueRow = Array.isArray(queueRes.data) && queueRes.data.length ? queueRes.data[0] : null;
    const queueId = queueRow?.id || null;

    const saveRes = await supabaseRpc(env, "save_outbound_message", {
      p_to_email:  String(to_email).trim().toLowerCase(),
      p_subject:   String(msgSubject || ""),
      p_body:      String(msgBody),
      p_body_html: emailHtml,
      p_report_id: report_id || null,
      p_queue_id:  queueId,
    });
    if (!saveRes.ok) return json({ ok: false, error: "save_outbound_failed", details: summarizeSupabaseError(saveRes) }, saveRes.status || 500);
    const messageId = normalizeRpcValue(saveRes.data);

    // Save attachments (already uploaded to storage) to message_attachments
    if (messageId && saveRes.ok && sendAttachments?.length) {
      const msgId = messageId;
      for (const att of sendAttachments) {
        const attSave = await supabaseRpc(env, "save_attachment", {
          p_message_id:  msgId,
          p_filename:    att.filename,
          p_mime_type:   att.mime_type,
          p_size:        att.size || 0,
          p_storage_path: att.storage_path,
          p_content_id:  null,
          p_inline:      false,
        });
        if (!attSave.ok) {
          console.error("[messages/send] save_attachment failed:", attSave);
        }
      }
    }

    return json({ ok: true, id: messageId });
  }

  // POST /_admin_api/messages/read  { id } or ?id=xxx — mark message as read
  if (url.pathname === "/_admin_api/messages/read" && request.method === "POST") {
    const messageId = url.searchParams.get("id");
    console.log("[messages/read] Called with id:", messageId);
    
    if (!messageId) {
      console.error("[messages/read] Missing message id");
      return json({ ok: false, error: "missing_id" }, 400);
    }

    // Use direct SQL via RPC - bypasses Supabase REST cache
    console.log("[messages/read] Calling mark_message_read RPC...");
    const rpcRes = await supabaseRpc(env, "mark_message_read", { p_message_id: messageId });
    console.log("[messages/read] RPC result:", { 
      ok: rpcRes.ok, 
      status: rpcRes.status, 
      data: rpcRes.data,
      text: rpcRes.text?.substring(0, 200)
    });
    
    if (!rpcRes.ok) {
      console.error("[messages/read] RPC failed:", rpcRes);
      return json({ ok: false, error: "mark_read_failed", details: rpcRes.text || summarizeSupabaseError(rpcRes) }, rpcRes.status || 500);
    }
    
    console.log("[messages/read] Success!");
    return json({ ok: true });
  }

  // GET /_admin_api/reports?status=open|closed|all&limit=50&offset=0
  if (url.pathname === "/_admin_api/reports" && request.method === "GET") {
    const status = String(url.searchParams.get("status") || "all");
    const limit  = clampInt(url.searchParams.get("limit"),  1, 200, 50);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
    const res = await supabaseRpc(env, "list_reports", { p_status: status, p_limit: limit, p_offset: offset });
    if (!res.ok) return json({ ok: false, error: "list_reports_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // POST /_admin_api/reports  { subject, lang? }
  if (url.pathname === "/_admin_api/reports" && request.method === "POST") {
    const body = await readJson(request);
    const { subject, lang } = body || {};
    const res = await supabaseRpc(env, "create_report", {
      p_subject: String(subject || ""),
      p_lang:    String(lang || "pl"),
    });
    if (!res.ok) return json({ ok: false, error: "create_report_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    const row = Array.isArray(res.data) && res.data.length ? res.data[0] : normalizeRpcValue(res.data);
    return json({ ok: true, id: row?.id, ticket_number: row?.ticket_number });
  }

  // PUT /_admin_api/reports/status  { report_id, status }
  if (url.pathname === "/_admin_api/reports/status" && request.method === "PUT") {
    const body = await readJson(request);
    const { report_id, status } = body || {};
    if (!report_id || !status) return json({ ok: false, error: "missing_report_id_or_status" }, 400);
    const res = await supabaseRpc(env, "set_report_status", { p_report_id: report_id, p_status: status });
    if (!res.ok) return json({ ok: false, error: "set_status_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // POST /_admin_api/cleanup/trash
  if (url.pathname === "/_admin_api/cleanup/trash" && request.method === "POST") {
    // Skasuj pliki załączników wiadomości które zaraz przepadną z kosza —
    // ZANIM cleanup_trash je skasuje przez ON DELETE CASCADE.
    const trashAttRes = await supabaseRpc(env, "get_trash_attachments", {});
    if (trashAttRes.ok && Array.isArray(trashAttRes.data)) {
      await deleteAttachmentStorageFiles(env, trashAttRes.data);
    }

    const res = await supabaseRpc(env, "cleanup_trash", {});
    if (!res.ok) return json({ ok: false, error: "cleanup_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    const deleted = extractScalarNumber(res.data, 0);
    return json({ ok: true, deleted });
  }

  // GET /_admin_api/attachments?message_id=xxx — lista załączników wiadomości
  if (url.pathname === "/_admin_api/attachments" && request.method === "GET") {
    const messageId = String(url.searchParams.get("message_id") || "").trim();
    if (!messageId) return json({ ok: false, error: "missing_message_id" }, 400);
    const res = await supabaseRpc(env, "get_message_attachments", { p_message_id: messageId });
    if (!res.ok) return json({ ok: false, error: "get_attachments_failed" }, 500);
    return json({ ok: true, attachments: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/attachments/download?id=xxx — pobierz załącznik
  if (url.pathname === "/_admin_api/attachments/download" && request.method === "GET") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    // fetch storage_path from DB
    const attRes = await supabaseRequest(env, `/rest/v1/message_attachments?id=eq.${encodeURIComponent(id)}&select=storage_path,filename,mime_type&limit=1`, { method: "GET" });
    if (!attRes.ok) return json({ ok: false, error: "not_found" }, 404);
    const row = Array.isArray(attRes.data) && attRes.data.length ? attRes.data[0] : null;
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    const storageRes = await downloadFromStorage(env, row.storage_path);
    if (!storageRes.ok) return json({ ok: false, error: "storage_error" }, 502);
    const blob = await storageRes.arrayBuffer();
    return new Response(blob, {
      headers: {
        "Content-Type": row.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${row.filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // POST /_admin_api/attachments/upload — upload pliku (do compose)
  // multipart/form-data z polem "file"
  if (url.pathname === "/_admin_api/attachments/upload" && request.method === "POST") {
    try {
      let formData;
      try { formData = await request.formData(); } catch { return json({ ok: false, error: "invalid_form" }, 400); }
      const file = formData.get("file");
      if (!file || typeof file === "string") return json({ ok: false, error: "missing_file" }, 400);
      const filename = (file.name || "upload").replace(/[^\w.\-]/g, "_");
      const mimeType = file.type || "application/octet-stream";
      const arrayBuf = await file.arrayBuffer();
      if (arrayBuf.byteLength > 10 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 413);

      const cfg = getSupabaseConfig(env);
      if (!cfg) return json({ ok: false, error: "missing_supabase_config" }, 500);

      const tempId = crypto.randomUUID();
      const objectKey = `${tempId}_${filename}`;
      const storagePath = objectKey;
      const storageUrl = `${cfg.baseUrl}/storage/v1/object/message-attachments/${objectKey}`;

      const upRes = await fetch(storageUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.serviceRoleKey}`,
          "Content-Type": mimeType,
        },
        body: arrayBuf,
      });
      if (!upRes.ok) {
        const errText = await upRes.text().catch(() => "");
        console.error("[worker] storage upload failed:", upRes.status, errText.slice(0, 300));
        return json({ ok: false, error: "storage_upload_failed", status: upRes.status, details: errText.slice(0, 300) }, 500);
      }
      return json({ ok: true, id: tempId, filename, mime_type: mimeType, storage_path: `message-attachments/${storagePath}`, size: arrayBuf.byteLength });
    } catch (err) {
      console.error("[worker] attachment/upload exception:", String(err));
      return json({ ok: false, error: "exception", details: String(err?.message || err).slice(0, 300) }, 500);
    }
  }

  return new Response("Not Found", { status: 404 });
}
