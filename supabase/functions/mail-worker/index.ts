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

function json(obj: any, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function htmlToText(html: string): string { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500); }

interface EmailProvider { id: string; name: string; type: ProviderType; label: string; priority: number; rem_worker: number; }

async function loadProviders(): Promise<EmailProvider[]> {
  const { data, error } = await sbAdmin.from("email_providers").select("*").eq("is_active", true).order("priority", { ascending: true });
  if (error) return [];
  return (data || []).map(p => ({ ...p, type: p.name.split('_')[0] as ProviderType }));
}

async function decrementWorkerLimit(providerId: string) {
  await sbAdmin.rpc("decrement_provider_worker", { p_id: providerId });
}

async function writeLog(entry: any) {
  try {
    sbAdmin.from("mail_function_logs").insert({
      function_name: "mail-worker",
      level: entry.level || "info",
      event: entry.event,
      request_id: entry.requestId,
      queue_id: entry.queueId || null,
      recipient_email: entry.recipientEmail || null,
      provider: entry.provider || null,
      status: entry.status || null,
      error: entry.error ? entry.error.slice(0, 2000) : null,
      meta: entry.meta || {},
    }).then();
  } catch (err) { console.warn("[mail-worker] log:insert_failed", err); }
}

async function getSendPulseToken() {
  const res = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: SENDPULSE_ID, client_secret: SENDPULSE_SECRET })
  });
  const data = await res.json();
  return data.access_token;
}

async function sendViaBrevo(to: string, subject: string, html: string, fromEmail?: string, text?: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { email: fromEmail || FROM_EMAIL, name: FROM_NAME }, to: [{ email: to }], subject, htmlContent: html, textContent: text || htmlToText(html) }),
  });
  if (!res.ok) throw new Error(`brevo_failed:${await res.text().catch(() => "")}`);
}

async function sendViaMailgun(to: string, subject: string, html: string, fromEmail?: string, text?: string) {
  const base = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const form = new FormData();
  form.append("from", `${FROM_NAME} <${fromEmail || FROM_EMAIL}>`); form.append("to", to); form.append("subject", subject); form.append("html", html); form.append("text", text || htmlToText(html));
  const res = await fetch(`${base}/v3/${MAILGUN_DOMAIN}/messages`, { method: "POST", headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` }, body: form });
  if (!res.ok) throw new Error(`mailgun_failed:${await res.text().catch(() => "")}`);
}

async function sendViaSendpulse(to: string, subject: string, html: string, fromEmail?: string) {
  const token = await getSendPulseToken();
  const res = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: { subject, html: btoa(html), from: { name: FROM_NAME, email: fromEmail || FROM_EMAIL }, to: [{ email: to }] } }),
  });
  if (!res.ok) throw new Error(`sendpulse_failed:${await res.text().catch(() => "")}`);
}

async function sendViaMailerlite(to: string, subject: string, html: string, fromEmail?: string) {
  const res = await fetch("https://connect.mailerlite.com/api/emails/transactional", {
    method: "POST",
    headers: { "Authorization": `Bearer ${MAILERLITE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: { email: fromEmail || FROM_EMAIL, name: FROM_NAME }, to: [{ email: to }], subject, html }),
  });
  if (!res.ok) throw new Error(`mailerlite_failed:${await res.text().catch(() => "")}`);
}

async function sendWithFallbacks(to: string, subject: string, html: string, providers: EmailProvider[], fromEmail?: string, text?: string) {
  const available = providers.filter(p => p.rem_worker > 0);
  if (available.length === 0) throw new Error("no_available_worker_limits");
  for (const p of available) {
    try {
      if (p.type === "brevo") await sendViaBrevo(to, subject, html, fromEmail, text);
      else if (p.type === "sendpulse") await sendViaSendpulse(to, subject, html, fromEmail);
      else if (p.type === "mailerlite") await sendViaMailerlite(to, subject, html, fromEmail);
      else await sendViaMailgun(to, subject, html, fromEmail, text);
      await decrementWorkerLimit(p.id);
      return p.name;
    } catch (e) { console.error(`[mail-worker] provider ${p.name} failed:`, e); }
  }
  throw new Error("all_providers_failed");
}

serve(async (req) => {
    // ... reszta logiki
});
