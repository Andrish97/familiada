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
const SENDPULSE_KEY = Deno.env.get("SENDPULSE_API_KEY") || "";
const MAILERLITE_KEY = Deno.env.get("MAILERLITE_API_KEY") || "";

const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Familiada";

// Helpers
function json(obj: any, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function scrubEmail(email: string) { const e = String(email || "").trim(); const at = e.indexOf("@"); if (at <= 1) return e ? "***" : ""; return `${e.slice(0, 2)}***${e.slice(at)}`; }
function clampError(message: unknown, max = 2000) { return String(message ?? "").slice(0, max); }
function htmlToText(html: string): string { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500); }

interface EmailProvider { id: string; name: string; type: ProviderType; label: string; priority: number; rem_worker: number; }

function parseQueueIds(raw: string | null): string[] {
  if (!raw) return [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uniq = new Set<string>();
  String(raw).split(",").map((v) => v.trim()).filter(Boolean).forEach((id) => { if (uuidRe.test(id)) uniq.add(id); });
  return [...uniq].slice(0, 200);
}

async function loadProviders(): Promise<EmailProvider[]> {
  const { data, error } = await sbAdmin.from("email_providers").select("*").eq("is_active", true).order("priority", { ascending: true });
  if (error) return [];
  return (data || []).map(p => ({ ...p, type: p.name.split('_')[0] as ProviderType }));
}

async function decrementWorkerLimit(providerId: string) {
  await sbAdmin.rpc("decrement_provider_worker", { p_id: providerId });
}

async function loadSettings() {
  const { data } = await sbAdmin.from("mail_settings").select("delay_ms,worker_limit").eq("id", 1).maybeSingle();
  return {
    delay_ms: Number.isFinite(Number(data?.delay_ms)) ? Number(data?.delay_ms) : 250,
    worker_limit: Number.isFinite(Number(data?.worker_limit)) ? Number(data?.worker_limit) : 25,
  };
}

async function writeLog(entry: any) {
  try {
    await sbAdmin.from("mail_function_logs").insert({
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
  } catch (err) { console.warn("[mail-worker] log:insert_failed", err); }
}

async function sendViaBrevo(to: string, subject: string, html: string, fromEmail?: string, text?: string) {
  if (!BREVO_KEY) throw new Error("missing_BREVO_API_KEY");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { email: fromEmail || FROM_EMAIL, name: FROM_NAME }, to: [{ email: to }], subject, htmlContent: html, textContent: text || htmlToText(html) }),
  });
  if (!res.ok) throw new Error(`brevo_failed:${await res.text().catch(() => "")}`);
}

async function sendViaMailgun(to: string, subject: string, html: string, fromEmail?: string, text?: string) {
  if (!MAILGUN_KEY || !MAILGUN_DOMAIN) throw new Error("missing_MAILGUN_CREDENTIALS");
  const base = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const form = new FormData();
  form.append("from", `${FROM_NAME} <${fromEmail || FROM_EMAIL}>`); form.append("to", to); form.append("subject", subject); form.append("html", html); form.append("text", text || htmlToText(html));
  const res = await fetch(`${base}/v3/${MAILGUN_DOMAIN}/messages`, { method: "POST", headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` }, body: form });
  if (!res.ok) throw new Error(`mailgun_failed:${await res.text().catch(() => "")}`);
}

async function sendViaSendpulse(to: string, subject: string, html: string, fromEmail?: string) {
  if (!SENDPULSE_KEY) throw new Error("missing_SENDPULSE_API_KEY");
  const res = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${SENDPULSE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: { subject, html: btoa(html), from: { name: FROM_NAME, email: fromEmail || FROM_EMAIL }, to: [{ email: to }] } }),
  });
  if (!res.ok) throw new Error(`sendpulse_failed:${await res.text().catch(() => "")}`);
}

async function sendViaMailerlite(to: string, subject: string, html: string, fromEmail?: string) {
  if (!MAILERLITE_KEY) throw new Error("missing_MAILERLITE_API_KEY");
  const res = await fetch("https://connect.mailerlite.com/api/emails/transactional", {
    method: "POST",
    headers: { "Authorization": `Bearer ${MAILERLITE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: { email: fromEmail || FROM_EMAIL, name: FROM_NAME }, to: { email: to }, subject, html }),
  });
  if (!res.ok) throw new Error(`mailerlite_failed:${await res.text().catch(() => "")}`);
}

async function sendWithFallbacks(to: string, subject: string, html: string, providers: EmailProvider[], fromEmail?: string, text?: string) {
  const available = providers.filter(p => p.rem_worker > 0);
  if (available.length === 0) throw new Error("no_available_worker_limits");
  for (const p of available) {
    try {
      if (p.type === "brevo") await sendViaBrevo(to, subject, html, fromEmail, undefined, text);
      else if (p.type === "sendpulse") await sendViaSendpulse(to, subject, html, fromEmail);
      else if (p.type === "mailerlite") await sendViaMailerlite(to, subject, html, fromEmail);
      else await sendViaMailgun(to, subject, html, fromEmail, undefined, text);
      await decrementWorkerLimit(p.id);
      return p.name;
    } catch (e) { console.error(`[mail-worker] provider ${p.name} failed:`, e); }
  }
  throw new Error("all_providers_failed");
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST" && req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
  await writeLog({ requestId, event: "request_start", status: "started", meta: { method: req.method, url: req.url } });

  const url = new URL(req.url);
  if (WORKER_SECRET) {
    const got = req.headers.get("x-mail-worker-secret") || req.headers.get("authorization")?.slice(7) || url.searchParams.get("secret") || "";
    if (got !== WORKER_SECRET) {
      await writeLog({ requestId, level: "warn", event: "request_forbidden_bad_secret", status: "failed" });
      return json({ ok: false, error: "forbidden" }, 403);
    }
  }

  const settings = await loadSettings();
  const providers = await loadProviders();
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || String(settings.worker_limit))));
  const selectedIds = parseQueueIds(url.searchParams.get("ids"));
  const { data: rows, error } = await sbAdmin.rpc(selectedIds.length ? "mail_queue_pick_selected" : "mail_queue_pick", selectedIds.length ? { p_ids: selectedIds, p_limit: limit } : { p_limit: limit });
  
  if (error) {
    await writeLog({ requestId, level: "error", event: "queue_pick_failed", status: "failed", error: String(error.message) });
    return json({ ok: false, error: "pick_failed" }, 500);
  }

  let sent = 0, failed = 0;
  for (const r of (rows || [])) {
    if (!providers.some(p => p.rem_worker > 0)) break;
    try {
      const provider = await sendWithFallbacks(r.to_email, r.subject, r.html, providers, r.from_email, r.text);
      await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: true, p_provider: provider, p_error: "" });
      sent++;
    } catch (e) {
      await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: false, p_provider: "", p_error: String(e) });
      failed++;
    }
    if (settings.delay_ms) await sleep(settings.delay_ms);
  }

  await writeLog({ requestId, level: failed ? "warn" : "info", event: "request_done", status: failed ? "partial_failed" : "ok", meta: { sent, failed } });
  return json({ ok: true, sent, failed });
});
