import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "sendgrid" | "brevo" | "mailgun";

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
    .select("provider_order,delay_ms")
    .eq("id", 1)
    .maybeSingle();
  return {
    provider_order: String(data?.provider_order || "sendgrid,brevo,mailgun"),
    delay_ms: Number.isFinite(Number(data?.delay_ms)) ? Number(data?.delay_ms) : 250,
  };
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
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  if (WORKER_SECRET) {
    const got = req.headers.get("x-mail-worker-secret") || "";
    if (got !== WORKER_SECRET) return json({ ok: false, error: "forbidden" }, 403);
  }

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "25")));

  const settings = await loadSettings();
  const order = parseProviderOrder(settings.provider_order);
  const delayMs = Math.max(0, Math.min(5000, Number(settings.delay_ms || 0)));

  // pick batch
  const { data: rows, error } = await sbAdmin.rpc("mail_queue_pick", { p_limit: limit });
  if (error) return json({ ok: false, error: "pick_failed" }, 500);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    try {
      const provider = await sendWithFallbacks(r.to_email, r.subject, r.html, order);
      await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: true, p_provider: provider, p_error: "" });
      sent++;
    } catch (e) {
      await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: false, p_provider: "", p_error: String((e as any)?.message || e) });
      failed++;
    }
    if (delayMs && i < (rows || []).length - 1) await sleep(delayMs);
  }

  return json({ ok: true, picked: (rows || []).length, sent, failed });
});
