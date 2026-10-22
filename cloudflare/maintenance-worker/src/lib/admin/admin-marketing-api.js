// src/lib/admin-marketing-api.js -- /_admin_api/marketing/* (bulk send, kontakty,
// logi wyszukiwania, kolejność AI). Tabele marketingu są tylko dla klucza
// serwisowego (audyt E24) -- panel czyta i zmienia je wyłącznie tędy.
import { json } from "../core/http.js";
import { readJson } from "./admin-auth.js";
import { supabaseRequest, summarizeSupabaseError } from "../core/supabase.js";
import { htmlToPlainTextPreview } from "../email/html-to-text.js";

const MC_PAGE_SIZE = 50;
const MC_SORT_COLS = new Set(["title", "email", "url", "added_at", "is_used"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanIds(ids) {
  return Array.isArray(ids) ? [...new Set(ids.map(String).filter((id) => UUID_RE.test(id)))].slice(0, 500) : [];
}

export async function handleAdminMarketingApi(request, env, url) {
  // GET /_admin_api/marketing/contacts?page=&used=&search=&sort=&dir=
  if (url.pathname === "/_admin_api/marketing/contacts" && request.method === "GET") {
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const sort = MC_SORT_COLS.has(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "added_at";
    const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
    const q = new URLSearchParams({ select: "*", order: `${sort}.${dir}` });
    const used = url.searchParams.get("used");
    if (used === "true" || used === "false") q.set("is_used", `eq.${used}`);
    const search = String(url.searchParams.get("search") || "").trim().slice(0, 200);
    if (search) {
      // Wzorzec LIKE (\\ % _ dosłownie, * to % w PostgREST), potem wartość w cudzysłowie PostgREST.
      const like = search.replace(/\*/g, "").replace(/[\\%_]/g, "\\$&");
      const v = `"*${like.replace(/[\\"]/g, "\\$&")}*"`;
      q.set("or", `(title.ilike.${v},email.ilike.${v},url.ilike.${v})`);
    }
    const from = (page - 1) * MC_PAGE_SIZE;
    const res = await supabaseRequest(env, `/rest/v1/marketing_verified_contacts?${q}`, {
      headers: { Prefer: "count=exact", Range: `${from}-${from + MC_PAGE_SIZE - 1}` },
    });
    if (!res.ok) return json({ ok: false, error: "contacts_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    const total = parseInt(String(res.contentRange || "").split("/")[1] || "0", 10) || 0;
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [], total });
  }

  // POST /_admin_api/marketing/contacts/used { ids, used }
  if (url.pathname === "/_admin_api/marketing/contacts/used" && request.method === "POST") {
    const body = await readJson(request);
    const ids = cleanIds(body?.ids);
    if (!ids.length) return json({ ok: false, error: "missing_ids" }, 400);
    const res = await supabaseRequest(env, `/rest/v1/marketing_verified_contacts?id=in.(${ids.join(",")})`, {
      method: "PATCH",
      body: { is_used: body?.used === true },
    });
    if (!res.ok) return json({ ok: false, error: "contacts_update_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // POST /_admin_api/marketing/contacts/delete { ids }
  if (url.pathname === "/_admin_api/marketing/contacts/delete" && request.method === "POST") {
    const body = await readJson(request);
    const ids = cleanIds(body?.ids);
    if (!ids.length) return json({ ok: false, error: "missing_ids" }, 400);
    const res = await supabaseRequest(env, `/rest/v1/marketing_verified_contacts?id=in.(${ids.join(",")})`, { method: "DELETE" });
    if (!res.ok) return json({ ok: false, error: "contacts_delete_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // GET /_admin_api/marketing/logs -- 200 najnowszych wpisów
  if (url.pathname === "/_admin_api/marketing/logs" && request.method === "GET") {
    const res = await supabaseRequest(env, "/rest/v1/marketing_search_logs?select=*&order=created_at.desc&limit=200");
    if (!res.ok) return json({ ok: false, error: "logs_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/marketing/ai-providers
  if (url.pathname === "/_admin_api/marketing/ai-providers" && request.method === "GET") {
    const res = await supabaseRequest(env, "/rest/v1/marketing_ai_providers?select=*&order=priority.asc");
    if (!res.ok) return json({ ok: false, error: "ai_providers_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // POST /_admin_api/marketing/ai-providers/order { names } -- priorytet = pozycja
  if (url.pathname === "/_admin_api/marketing/ai-providers/order" && request.method === "POST") {
    const body = await readJson(request);
    const names = Array.isArray(body?.names) ? body.names.map(String).filter(Boolean).slice(0, 50) : [];
    if (!names.length) return json({ ok: false, error: "missing_names" }, 400);
    const results = await Promise.all(names.map((name, idx) =>
      supabaseRequest(env, `/rest/v1/marketing_ai_providers?name=eq.${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: { priority: idx },
      })));
    const bad = results.find((r) => !r.ok);
    if (bad) return json({ ok: false, error: "ai_order_failed", details: summarizeSupabaseError(bad) }, bad.status || 500);
    return json({ ok: true });
  }

  // POST /_admin_api/marketing/send { emails, subject, template_id, custom_body }
  if (url.pathname === "/_admin_api/marketing/send" && request.method === "POST") {
    const body = await readJson(request);
    const { emails, subject: mktSubject, template_id, custom_body } = body || {};
    if (!Array.isArray(emails) || !emails.length) return json({ ok: false, error: "missing_emails" }, 400);
    if (!mktSubject) return json({ ok: false, error: "missing_subject" }, 400);
    if (typeof custom_body !== "string" || !custom_body.trim()) return json({ ok: false, error: "missing_body" }, 400);

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = [...new Set(emails.map(e => String(e).trim().toLowerCase()).filter(e => emailRe.test(e)))];
    if (!validEmails.length) return json({ ok: false, error: "no_valid_emails" }, 400);
    if (validEmails.length > 500) return json({ ok: false, error: "too_many_emails", max: 500 }, 400);

    // custom_body is already full HTML from client (templates in JS)
    const emailHtml = custom_body || "";

    const emailText = htmlToPlainTextPreview(emailHtml);

    // Insert into mail_queue (batch insert for all recipients) --
    // cooldown_action_key/cooldown_target_key wymagane przez trigger
    // (ujednolicenie cooldownów, migracja 289); "admin:marketing" ma
    // enforce=false (celowo powtarzalna wysyłka kampanii do tych samych
    // adresów, nigdy nie ma być throttlowana).
    const queueRows = validEmails.map(email => ({
      to_email: email,
      subject: String(mktSubject),
      html: emailHtml,
      text: emailText,
      from_email: "kontakt@familiada.online",
      meta: { type: "marketing", template_id: template_id || "custom" },
      cooldown_action_key: "admin:marketing",
      cooldown_target_key: `email:${email}`,
    }));

    const qRes = await supabaseRequest(env, "/rest/v1/mail_queue?select=to_email", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: queueRows,
    });

    if (!qRes.ok) {
      return json({ ok: false, error: "queue_insert_failed", details: summarizeSupabaseError(qRes) }, qRes.status || 500);
    }

    // The flag guard can omit recipients. Only actual queue rows are sent history.
    const queuedEmails = (Array.isArray(qRes.data) ? qRes.data : []).map(row => row.to_email);
    const queued = queuedEmails.length;
    const skipped = validEmails.length - queued;
    if (!queued) return json({ ok: true, queued, skipped, total: validEmails.length });
    const messageRows = queuedEmails.map(email => ({
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

    return json({ ok: true, queued, skipped, total: validEmails.length });
  }

  return new Response("Not Found", { status: 404 });
}
