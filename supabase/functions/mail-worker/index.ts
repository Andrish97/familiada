
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "sendgrid" | "brevo" | "mailgun";
type LogLevel = "debug" | "info" | "warn" | "error";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const WORKER_SECRET = Deno.env.get("MAIL_WORKER_SECRET") || "";

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY") || "";
const BREVO_KEY = Deno.env.get("BREVO_API_KEY") || "";
const MAILGUN_KEY = Deno.env.get("MAILGUN_API_KEY") || "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();

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

function parseProviderOrder(raw: string): Provider[] {
  const allowed: Provider[] = ["sendgrid", "brevo", "mailgun"];
  const out = String(raw || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((x) => allowed.includes(x as Provider)) as Provider[];
  return out.length ? out : ["sendgrid", "brevo", "mailgun"];
}

async function loadSettings() {
  const { data } = await sbAdmin
    .from("mail_settings")
    .select("provider_order,delay_ms,worker_limit")
    .eq("id", 1)
    .maybeSingle();
  return {
    provider_order: String(data?.provider_order || "sendgrid,brevo,mailgun"),
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

// Providers (same jak w send-mail, skrócone)
async function sendViaSendgrid(to: string, subject: string, html: string) {
  if (!SENDGRID_KEY) throw new Error("missing_SENDGRID_API_KEY");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [{ type: "text/html", value: html }],
      tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
    }),
  });
  if (!res.ok) throw new Error(`sendgrid_failed:${await res.text().catch(() => "")}`);
}
async function sendViaBrevo(to: string, subject: string, html: string) {
  if (!BREVO_KEY) throw new Error("missing_BREVO_API_KEY");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { email: FROM_EMAIL, name: FROM_NAME }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) throw new Error(`brevo_failed:${await res.text().catch(() => "")}`);
}
async function sendViaMailgun(to: string, subject: string, html: string) {
  if (!MAILGUN_KEY) throw new Error("missing_MAILGUN_API_KEY");
  if (!MAILGUN_DOMAIN) throw new Error("missing_MAILGUN_DOMAIN");
  const base = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const url = `${base}/v3/${MAILGUN_DOMAIN}/messages`;

  const form = new FormData();
  form.append("from", `${FROM_NAME} <${FROM_EMAIL}>`);
  form.append("to", to);
  form.append("subject", subject);
  form.append("html", html);

  const res = await fetch(url, { method: "POST", headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` }, body: form });
  if (!res.ok) throw new Error(`mailgun_failed:${await res.text().catch(() => "")}`);
}

async function sendWithFallbacks(to: string, subject: string, html: string, order: Provider[]) {
  const errs: string[] = [];
  for (const p of order) {
    try {
      if (p === "sendgrid") { await sendViaSendgrid(to, subject, html); return p; }
      if (p === "brevo") { await sendViaBrevo(to, subject, html); return p; }
      await sendViaMailgun(to, subject, html); return p;
    } catch (e) {
      errs.push(`${p}:${String((e as any)?.message || e)}`);
    }
  }
  throw new Error(errs.join("|"));
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log("[mail-worker] request:start", { requestId, method: req.method, url: req.url });
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
  const order = parseProviderOrder(settings.provider_order);
  const delayMs = Math.max(0, Math.min(5000, Number(settings.delay_ms || 0)));
  const defaultLimit = Math.max(1, Math.min(200, Number(settings.worker_limit || 25)));
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || String(defaultLimit))));
  const selectedIds = parseQueueIds(url.searchParams.get("ids"));
  const pickFn = selectedIds.length ? "mail_queue_pick_selected" : "mail_queue_pick";
  const pickPayload = selectedIds.length
    ? { p_ids: selectedIds, p_limit: limit }
    : { p_limit: limit };
  console.log("[mail-worker] settings", { providerOrder: order, delayMs, limit, selectedIds: selectedIds.length });
  await writeLog({
    requestId,
    event: "request_settings_loaded",
    status: "ok",
    meta: { providerOrder: order.join(","), delayMs, limit, defaultLimit, selectedIds: selectedIds.length },
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
  console.log("[mail-worker] queue:picked", { count: (rows || []).length });
  await writeLog({
    requestId,
    event: "queue_picked",
    status: "ok",
    meta: { count: (rows || []).length, limit, pickFn, selectedIds: selectedIds.length },
  });

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    try {
      console.log("[mail-worker] queue:item_start", { id: r.id, to: scrubEmail(r.to_email), subjectLen: String(r.subject || "").length });
      const provider = await sendWithFallbacks(r.to_email, r.subject, r.html, order);
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
      console.log("[mail-worker] queue:item_sent", { id: r.id, to: scrubEmail(r.to_email), provider });
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

  console.log("[mail-worker] request:done", { picked: (rows || []).length, sent, failed });
  await writeLog({
    requestId,
    level: failed ? "warn" : "info",
    event: "request_done",
    status: failed ? "partial_failed" : "ok",
    meta: { picked: (rows || []).length, sent, failed },
  });
  return json({ ok: true, picked: (rows || []).length, sent, failed });
});
