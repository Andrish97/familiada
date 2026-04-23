import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ProviderType = "brevo" | "mailgun" | "sendpulse" | "mailerlite";
type LogLevel = "debug" | "info" | "warn" | "error";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BREVO_KEY = Deno.env.get("BREVO_API_KEY") || "";
const MAILGUN_KEY = Deno.env.get("MAILGUN_API_KEY") || "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();
const SENDPULSE_ID = Deno.env.get("SENDPULSE_ID") || "";
const SENDPULSE_SECRET = Deno.env.get("SENDPULSE_SECRET") || "";
const MAILERLITE_KEY = Deno.env.get("MAILERLITE_API_KEY") || "";

const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Familiada";

const HOOK_SECRET_RAW = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
const HOOK_SECRET = HOOK_SECRET_RAW.replace("v1,whsec_", "");
const webhook = new Webhook(HOOK_SECRET);

function json(obj: any, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
function clampError(message: unknown, max = 2000) { return String(message ?? "").slice(0, max); }

async function writeLog(entry: any) {
  if (!sbAdmin) return;
  try {
    await sbAdmin.from("mail_function_logs").insert({
      function_name: "send-email",
      level: entry.level || "info",
      event: entry.event,
      request_id: entry.requestId,
      actor_user_id: entry.actorUserId || null,
      recipient_email: entry.recipientEmail || null,
      provider: entry.provider || null,
      status: entry.status || null,
      error: entry.error ? clampError(entry.error) : null,
      meta: entry.meta || {},
    });
  } catch (err) { console.warn("[send-email] log:insert_failed", err); }
}

interface EmailProvider { id: string; name: string; type: ProviderType; label: string; priority: number; rem_immediate: number; }

async function loadProviders(): Promise<EmailProvider[]> {
  if (!sbAdmin) return [];
  const { data, error } = await sbAdmin
    .from("email_providers")
    .select("id, name, label, priority, rem_immediate")
    .eq("is_active", true)
    .order("priority", { ascending: true });
  if (error) return [];
  return (data || []).map(p => ({ ...p, type: p.name.split('_')[0] as ProviderType }));
}

async function decrementImmediateLimit(providerId: string) {
  if (!sbAdmin) return;
  await sbAdmin.rpc("decrement_provider_immediate", { p_id: providerId });
}

async function queueEmail(to: string, subject: string, html: string) {
  if (!sbAdmin) return;
  await sbAdmin.from("mail_queue").insert({ to_email: to, subject, html, status: "pending", meta: { queued_reason: "limits_exceeded" } });
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

async function sendViaBrevo(to: string, subject: string, html: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { email: FROM_EMAIL, name: FROM_NAME }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) throw new Error(`brevo_failed:${await res.text().catch(() => "")}`);
}

async function sendViaMailgun(to: string, subject: string, html: string) {
  const base = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const form = new FormData();
  form.append("from", `${FROM_NAME} <${FROM_EMAIL}>`); form.append("to", to); form.append("subject", subject); form.append("html", html);
  const res = await fetch(`${base}/v3/${MAILGUN_DOMAIN}/messages`, { method: "POST", headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` }, body: form });
  if (!res.ok) throw new Error(`mailgun_failed:${await res.text().catch(() => "")}`);
}

async function sendViaSendpulse(to: string, subject: string, html: string) {
  const token = await getSendPulseToken();
  const res = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: { subject, html: btoa(html), from: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: to }] } }),
  });
  if (!res.ok) throw new Error(`sendpulse_failed:${await res.text().catch(() => "")}`);
}

async function sendViaMailerlite(to: string, subject: string, html: string) {
  const res = await fetch("https://connect.mailerlite.com/api/emails/transactional", {
    method: "POST",
    headers: { "Authorization": `Bearer ${MAILERLITE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: { email: FROM_EMAIL, name: FROM_NAME }, to: [{ email: to }], subject, html }),
  });
  if (!res.ok) throw new Error(`mailerlite_failed:${await res.text().catch(() => "")}`);
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const bodyText = await req.text();
  try {
    webhook.verify(bodyText, Object.fromEntries(req.headers.entries()));
  } catch (err) { return json({ error: "Invalid signature" }, 403); }

  const payload = JSON.parse(bodyText);
  const { to, subject, html, userId } = payload.emailData;
  
  const providers = await loadProviders();
  const available = providers.filter(p => p.rem_immediate > 0);
  
  if (available.length === 0) {
    await queueEmail(to, subject, html);
    await writeLog({ requestId, event: "email_queued_due_to_limits", status: "queued", recipientEmail: to, actorUserId: userId });
    return json({ status: "queued" });
  }

  for (const p of available) {
    try {
      if (p.type === "brevo") await sendViaBrevo(to, subject, html);
      else if (p.type === "sendpulse") await sendViaSendpulse(to, subject, html);
      else if (p.type === "mailerlite") await sendViaMailerlite(to, subject, html);
      else await sendViaMailgun(to, subject, html);
      
      await decrementImmediateLimit(p.id);
      await writeLog({ requestId, event: "provider_success", status: "sent", actorUserId: userId, recipientEmail: to, provider: p.name });
      return json({ provider: p.name, status: "sent" });
    } catch (e) { console.error(`Provider ${p.name} failed:`, e); }
  }
  
  await queueEmail(to, subject, html);
  return json({ status: "queued", error: "all_providers_failed" });
});
