
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ProviderType = "brevo" | "mailgun" | "sendpulse" | "mailerlite";
type LogLevel = "debug" | "info" | "warn" | "error";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const WORKER_SECRET = Deno.env.get("MAIL_WORKER_SECRET") || "";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY") || "";
const MAILGUN_KEY = Deno.env.get("MAILGUN_API_KEY") || "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();
const SENDPULSE_ID = Deno.env.get("SENDPULSE_ID") || "";
const SENDPULSE_SECRET = Deno.env.get("SENDPULSE_SECRET") || "";
const MAILERLITE_KEY = Deno.env.get("MAILERLITE_API_KEY") || "";

const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Familiada";

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function scrubEmail(email: string) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at <= 1) return e ? "***" : "";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}
function clampError(message: unknown, max = 2000) {
  return String(message ?? "").slice(0, max);
}

interface EmailProvider {
  id: string;
  name: string;
  type: ProviderType;
  label: string;
  priority: number;
  rem_worker: number;
}

function parseQueueIds(raw: string | null): string[] {
  if (!raw) return [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uniq = new Set<string>();
  String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .forEach((id) => {
      if (uuidRe.test(id)) uniq.add(id);
    });
  return [...uniq].slice(0, 200);
}

async function loadProviders(): Promise<EmailProvider[]> {
  const { data, error } = await sbAdmin
    .from("email_providers")
    .select("id, name, label, priority, daily_limit, rem_worker, rem_immediate, is_active")
    .order("priority", { ascending: true });

  if (error) {
    console.error("[mail-worker] loadProviders DB error:", error);
    return [];
  }

  return (data || []).map(p => ({
    ...p,
    type: (p.name.split('_')[0]) as ProviderType
  }));
}


async function decrementWorkerLimit(providerId: string) {
  const { error } = await sbAdmin.rpc("decrement_provider_worker", { p_id: providerId });
  if (error) console.error("[mail-worker] decrement failed", error);
}

async function loadSettings() {
  const { data } = await sbAdmin
    .from("mail_settings")
    .select("delay_ms,worker_limit")
    .eq("id", 1)
    .maybeSingle();
  return {
    delay_ms: Number.isFinite(Number(data?.delay_ms)) ? Number(data?.delay_ms) : 250,
    worker_limit: Number.isFinite(Number(data?.worker_limit)) ? Number(data?.worker_limit) : 25,
  };
}

async function writeLog(entry: {
  requestId: string;
  level?: LogLevel;
  event: string;
  status?: string;
  queueId?: string | null;
  recipientEmail?: string | null;
  provider?: string | null;
  error?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const { error } = await sbAdmin.from("mail_function_logs").insert({
      function_name: "mail-worker",
      level: entry.level || "info",
      event: entry.event,
      request_id: entry.requestId,
      queue_id: entry.queueId || null,
      recipient_email: entry.recipientEmail || null,
      provider: entry.provider || null,
      status: entry.status || null,
      error: entry.error ? clampError(entry.error) : null,
      meta: entry.meta || {},
    });
    if (error) {
      console.warn("[mail-worker] log:insert_failed", { error });
    }
  } catch (err) {
    console.warn("[mail-worker] log:insert_failed", { error: String(err) });
  }
}

type Attachment = { filename: string; content: string; contentType: string };

// Helper function to strip HTML tags and get plain text
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')           // Remove all HTML tags
    .replace(/&nbsp;/g, ' ')            // Replace &nbsp; with space
    .replace(/&amp;/g, '&')             // Replace &amp; with &
    .replace(/&lt;/g, '<')              // Replace &lt; with <
    .replace(/&gt;/g, '>')              // Replace &gt; with >
    .replace(/&quot;/g, '"')            // Replace &quot; with "
    .replace(/&#39;/g, "'")             // Replace &#39; with '
    .replace(/\s+/g, ' ')               // Collapse whitespace
    .trim()
.slice(0, 500);
}

async function sendViaBrevo(to: string, subject: string, html: string, fromEmail?: string, attachments?: Attachment[], plainText?: string) {
  if (!BREVO_KEY) throw new Error("missing_BREVO_API_KEY");
  const from = fromEmail || FROM_EMAIL;
  const text = plainText || htmlToText(html);
  const payload: any = { sender: { email: from, name: FROM_NAME }, to: [{ email: to }], subject, htmlContent: html, textContent: text };
  if (attachments?.length) {
    payload.attachment = attachments.map(a => ({ name: a.filename, content: a.content, contentType: a.contentType }));
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`brevo_failed:${await res.text().catch(() => "")}`);
}
async function sendViaMailgun(to: string, subject: string, html: string, fromEmail?: string, attachments?: Attachment[], plainText?: string) {
  if (!MAILGUN_KEY) throw new Error("missing_MAILGUN_API_KEY");
  if (!MAILGUN_DOMAIN) throw new Error("missing_MAILGUN_DOMAIN");
  const from = fromEmail || FROM_EMAIL;
  const text = plainText || htmlToText(html);
  const base = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const url = `${base}/v3/${MAILGUN_DOMAIN}/messages`;

  const form = new FormData();
  form.append("from", `${FROM_NAME} <${from}>`);
  form.append("to", to);
  form.append("subject", subject);
  form.append("text", text);
  form.append("html", html);
  if (attachments?.length) {
    for (const a of attachments) {
      form.append("attachment", new Blob([Uint8Array.from(atob(a.content), c => c.charCodeAt(0))], { type: a.contentType }), a.filename);
    }
  }

  const res = await fetch(url, { method: "POST", headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` }, body: form });
  if (!res.ok) throw new Error(`mailgun_failed:${await res.text().catch(() => "")}`);
}

let sendpulseToken: string | null = null;

async function getSendpulseToken(): Promise<string> {
  if (sendpulseToken) return sendpulseToken;
  
  if (!SENDPULSE_ID || !SENDPULSE_SECRET) {
    throw new Error("missing_SENDPULSE_credentials");
  }
  
  const res = await fetch("https://api.sendpulse.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: SENDPULSE_ID,
      client_secret: SENDPULSE_SECRET
    })
  });
  
  if (!res.ok) throw new Error(`sendpulse_auth_failed:${await res.text().catch(() => "")}`);
  
  const data = await res.json();
  sendpulseToken = data.access_token;
  return sendpulseToken;
}

async function sendViaSendpulse(to: string, subject: string, html: string, fromEmail?: string) {
  if (!SENDPULSE_ID || !SENDPULSE_SECRET) throw new Error("missing_SENDPULSE_credentials");
  
  const from = fromEmail || FROM_EMAIL;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim().slice(0, 500);
  
  const token = await getSendpulseToken();
  
  const res = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: {
        subject,
        text,
        html,
        from: { name: FROM_NAME, email: from },
        to: [{ email: to }]
      }
    }),
  });
  if (!res.ok) throw new Error(`sendpulse_failed:${await res.text().catch(() => "")}`);
}

async function sendViaMailerlite(to: string, subject: string, html: string, fromEmail?: string) {
  if (!MAILERLITE_KEY) throw new Error("missing_MAILERLITE_API_KEY");
  const from = fromEmail || FROM_EMAIL;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim().slice(0, 500);
  const res = await fetch("https://mailerlite.com", {
    method: "POST",
    headers: { "Authorization": `Bearer ${MAILERLITE_KEY}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      subject,
      from,
      from_name: FROM_NAME,
      to: [{ email: to }],
      html,
      text
    }),
  });
  if (!res.ok) throw new Error(`mailerlite_failed:${await res.text().catch(() => "")}`);
}

async function checkSuppressedEmails(emails: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!emails.length) return result;
  const norm = (e: string) => String(e || "").toLowerCase().trim();
  const normEmails = [...new Set(emails.map(norm).filter(Boolean))];

  const { data: profs } = await sbAdmin.from("profiles").select("id,email").in("email", normEmails);
  const emailToUid = new Map<string, string>();
  for (const p of profs || []) {
    const em = norm((p as any).email);
    if (em) emailToUid.set(em, (p as any).id);
  }

  const uids = [...new Set([...emailToUid.values()])];
  if (uids.length) {
    const { data: flags } = await sbAdmin.from("user_flags").select("user_id,email_notifications").in("user_id", uids);
    for (const r of flags || []) {
      if ((r as any).email_notifications === false) {
        for (const [em, uid] of emailToUid.entries()) {
          if (uid === (r as any).user_id) result.set(em, "skipped_user_flag");
        }
      }
    }
  }

  const unregistered = normEmails.filter((em) => !emailToUid.has(em));
  if (unregistered.length) {
    const { data: suppressed } = await sbAdmin
      .from("email_unsub_tokens")
      .select("email")
      .in("email", unregistered)
      .not("suppressed_at", "is", null);
    for (const r of suppressed || []) result.set(norm((r as any).email), "skipped_suppression");
  }

  return result;
}

async function sendWithFallbacks(to: string, subject: string, html: string, providers: EmailProvider[], fromEmail?: string, attachments?: Attachment[], plainText?: string) {
  const available = providers.filter(p => p.rem_worker > 0);
  if (available.length === 0) throw new Error("no_available_worker_limits");

  console.log("[mail-worker] available providers:", available.map(p => p.name));
  console.log("[mail-worker] trying first:", available[0]?.name);

  const errs: string[] = [];
  const text = plainText || htmlToText(html);
  for (const p of available) {
    try {
      console.log("[mail-worker] trying provider:", p.name, "type:", p.type);
      
      if (p.type === "brevo") { await sendViaBrevo(to, subject, html, fromEmail, attachments, text); }
      else if (p.type === "sendpulse") { await sendViaSendpulse(to, subject, html, fromEmail); }
      else if (p.type === "mailerlite") { await sendViaMailerlite(to, subject, html, fromEmail); }
      else { await sendViaMailgun(to, subject, html, fromEmail, attachments, text); }
      
      console.log("[mail-worker] SUCCESS via:", p.name);
      await decrementWorkerLimit(p.id);
      return p.name;
    } catch (e) {
const errMsg = String((e as any)?.message || e);
      errs.push(`${p.name}:${errMsg}`);
      console.log("[mail-worker] FAILED provider:", p.name, "error:", errMsg);
      await writeLog({
        requestId: crypto.randomUUID(),
        level: "warn",
        event: "provider_failed",
        provider: p.name,
        error: errMsg,
      });
    }
  }
  
  console.log("[mail-worker] ALL providers failed:", errs);
  throw new Error(errs.join("|"));
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST" && req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
  await writeLog({
    requestId,
    event: "request_start",
    status: "started",
    meta: { method: req.method, url: req.url },
  });

  const url = new URL(req.url);

  if (WORKER_SECRET) {
    const fromHeader = req.headers.get("x-mail-worker-secret") || "";
    const authHeader = req.headers.get("authorization") || "";
    const fromBearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const fromQuery = url.searchParams.get("secret") || "";
    const got = fromHeader || fromBearer || fromQuery;
    if (got !== WORKER_SECRET) {
      console.warn("[mail-worker] request:forbidden_bad_secret");
      await writeLog({
        requestId,
        level: "warn",
        event: "request_forbidden_bad_secret",
        status: "failed",
      });
      return json({ ok: false, error: "forbidden" }, 403);
    }
  }

  const settings = await loadSettings();
  const providers = await loadProviders();
  const delayMs = Math.max(0, Math.min(5000, Number(settings.delay_ms || 0)));
  const defaultLimit = Math.max(1, Math.min(200, Number(settings.worker_limit || 25)));
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || String(defaultLimit))));
  const selectedIds = parseQueueIds(url.searchParams.get("ids"));
  const pickFn = selectedIds.length ? "mail_queue_pick_selected" : "mail_queue_pick";
  const pickPayload = selectedIds.length
    ? { p_ids: selectedIds, p_limit: limit }
    : { p_limit: limit };
  
  await writeLog({
    requestId,
    event: "request_settings_loaded",
    status: "ok",
    meta: { providersCount: providers.length, delayMs, limit, defaultLimit, selectedIds: selectedIds.length },
  });

  // pick batch
  const { data: rows, error } = await sbAdmin.rpc(pickFn, pickPayload);
  if (error) {
    console.error("[mail-worker] queue:pick_failed", { error });
    await writeLog({
      requestId,
      level: "error",
      event: "queue_pick_failed",
      status: "failed",
      error: String(error.message || error),
      meta: { pickFn, selectedIds: selectedIds.length },
    });
    return json({ ok: false, error: "pick_failed" }, 500);
  }
  await writeLog({
    requestId,
    event: "queue_picked",
    status: "ok",
    meta: { count: (rows || []).length, limit, pickFn, selectedIds: selectedIds.length },
  });

  // batch suppression check for all recipients
  const batchEmails = (rows || []).map((r: any) => String(r.to_email || "")).filter(Boolean);
  const suppressedMap = await checkSuppressedEmails(batchEmails).catch((e) => {
    console.warn("[mail-worker] suppression_check_failed", String(e));
    return new Map<string, string>();
  });
  const normEmail = (e: string) => String(e || "").toLowerCase().trim();

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    
    // Sprawdź czy nadal mamy jakieś limity
    const anyLimits = providers.some(p => p.rem_worker > 0);
    if (!anyLimits) {
      console.warn("[mail-worker] all worker limits exhausted, stopping batch");
      await writeLog({
        requestId,
        level: "warn",
        event: "worker_limits_exhausted_stopping",
        status: "partial",
        meta: { processed: i, total: rows.length },
      });
      break;
    }

    try {

      // suppression check
      const skipReason = suppressedMap.get(normEmail(r.to_email));
      if (skipReason) {
        await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: true, p_provider: skipReason, p_error: "" });
        await writeLog({
          requestId,
          event: "email_skipped",
          status: "skipped",
          level: "info",
          queueId: r.id,
          recipientEmail: r.to_email,
          provider: skipReason,
        });
        skipped++;
        continue;
      }

      // Load attachments from storage if any
      let emailAttachments: Attachment[] = [];
      const metaAttachments = (r.meta?.attachments || []) as Array<{filename: string, mime_type: string, storage_path: string}>;
      if (metaAttachments.length) {
        for (const att of metaAttachments) {
          try {
            const storageBucketPath = att.storage_path.replace(/^message-attachments\//, "");
            const { data, error } = await sbAdmin.storage.from("message-attachments").download(storageBucketPath);
            if (!error && data) {
              const buf = await data.arrayBuffer();
              const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
              emailAttachments.push({ filename: att.filename, content: b64, contentType: att.mime_type || "application/octet-stream" });
            }
          } catch (err) {
            console.error("[mail-worker] attachment_load_failed:", att.filename, err);
          }
        }
      }

      const provider = await sendWithFallbacks(r.to_email, r.subject, r.html, providers, r.from_email || undefined, emailAttachments.length ? emailAttachments : undefined, r.text);
      const { error: markOkError } = await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: true, p_provider: provider, p_error: "" });
      if (markOkError) {
        console.error("[mail-worker] queue:mark_sent_failed", { id: r.id, error: markOkError });
        await writeLog({
          requestId,
          level: "error",
          event: "queue_mark_sent_failed",
          status: "failed",
          queueId: r.id,
          recipientEmail: r.to_email,
          error: String(markOkError.message || markOkError),
          meta: { provider },
        });
      }
      await writeLog({
        requestId,
        event: "queue_item_sent",
        status: "sent",
        queueId: r.id,
        recipientEmail: r.to_email,
        provider,
      });
      sent++;
    } catch (e) {
      const errMsg = String((e as any)?.message || e);
      const { error: markErr } = await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: false, p_provider: "", p_error: errMsg });
      if (markErr) {
        console.error("[mail-worker] queue:mark_failed_failed", { id: r.id, error: markErr });
        await writeLog({
          requestId,
          level: "error",
          event: "queue_mark_failed_failed",
          status: "failed",
          queueId: r.id,
          recipientEmail: r.to_email,
          error: String(markErr.message || markErr),
          meta: { originalError: clampError(errMsg) },
        });
      }
      console.error("[mail-worker] queue:item_failed", { id: r.id, to: scrubEmail(r.to_email), error: errMsg });
      await writeLog({
        requestId,
        level: "error",
        event: "queue_item_failed",
        status: "failed",
        queueId: r.id,
        recipientEmail: r.to_email,
        error: errMsg,
      });
      failed++;
    }
    if (delayMs && i < (rows || []).length - 1) await sleep(delayMs);
  }

  await writeLog({
    requestId,
    level: failed ? "warn" : "info",
    event: "request_done",
    status: failed ? "partial_failed" : "ok",
    meta: { picked: (rows || []).length, sent, failed, skipped },
  });
  return json({ ok: true, picked: (rows || []).length, sent, failed, skipped });
});
