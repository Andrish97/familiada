import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "sendgrid" | "brevo" | "mailgun";
type MailItem = { to: string; subject: string; html: string; meta?: Record<string, unknown> };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY") || "";
const BREVO_KEY = Deno.env.get("BREVO_API_KEY") || "";
const MAILGUN_KEY = Deno.env.get("MAILGUN_API_KEY") || "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();

const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Familiada";

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

function parseItems(body: any): { items: MailItem[]; mode: "batch" | "single" } {
  if (body && Array.isArray(body.items)) {
    const items: MailItem[] = body.items
      .map((x: any) => ({
        to: String(x?.to || "").trim(),
        subject: String(x?.subject || "").trim(),
        html: String(x?.html || "").trim(),
        meta: x?.meta && typeof x.meta === "object" ? x.meta : undefined,
      }))
      .filter((x: MailItem) => x.to && x.subject && x.html);
    return { items, mode: "batch" };
  }

  const to = String(body?.to || "").trim();
  const subject = String(body?.subject || "").trim();
  const html = String(body?.html || "").trim();
  return to && subject && html
    ? { items: [{ to, subject, html }], mode: "single" }
    : { items: [], mode: "single" };
}

// ---- Providers ----

async function sendViaSendgrid(it: MailItem) {
  if (!SENDGRID_KEY) throw new Error("missing_SENDGRID_API_KEY");

  const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: it.to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: it.subject,
      content: [{ type: "text/html", value: it.html }],
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    }),
  });

  if (!sgRes.ok) {
    const errTxt = await sgRes.text().catch(() => "");
    throw new Error(`sendgrid_failed:${errTxt || sgRes.status}`);
  }
}

async function sendViaBrevo(it: MailItem) {
  if (!BREVO_KEY) throw new Error("missing_BREVO_API_KEY");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: it.to }],
      subject: it.subject,
      htmlContent: it.html,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`brevo_failed:${txt || res.status}`);
  }
}

async function sendViaMailgun(it: MailItem) {
  if (!MAILGUN_KEY) throw new Error("missing_MAILGUN_API_KEY");
  if (!MAILGUN_DOMAIN) throw new Error("missing_MAILGUN_DOMAIN");

  const base = MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const url = `${base}/v3/${MAILGUN_DOMAIN}/messages`;

  const form = new FormData();
  form.append("from", `${FROM_NAME} <${FROM_EMAIL}>`);
  form.append("to", it.to);
  form.append("subject", it.subject);
  form.append("html", it.html);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` },
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`mailgun_failed:${txt || res.status}`);
  }
}

async function sendWithFallbacks(it: MailItem, order: Provider[]) {
  const errs: string[] = [];
  for (const p of order) {
    try {
      if (p === "sendgrid") await sendViaSendgrid(it);
      else if (p === "brevo") await sendViaBrevo(it);
      else await sendViaMailgun(it);
      return { provider: p as Provider };
    } catch (e) {
      errs.push(`${p}:${String((e as any)?.message || e)}`);
    }
  }
  throw new Error(errs.join("|"));
}

async function loadSettings() {
  const { data, error } = await sbAdmin
    .from("mail_settings")
    .select("queue_enabled,provider_order,delay_ms,batch_max")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  return {
    queue_enabled: !!data?.queue_enabled,
    provider_order: String(data?.provider_order || "sendgrid,brevo,mailgun"),
    delay_ms: Number.isFinite(Number(data?.delay_ms)) ? Number(data?.delay_ms) : 250,
    batch_max: Number.isFinite(Number(data?.batch_max)) ? Number(data?.batch_max) : 100,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    // ---- AUTH ----
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const { data: userData, error: authError } = await sbAnon.auth.getUser(token);
    if (authError || !userData?.user) return json({ ok: false, error: "Invalid JWT" }, 401);
    const uid = userData.user.id;

    // ---- BODY ----
    const raw = await req.text();
    if (!raw.trim()) return json({ ok: false, error: "Empty body" }, 400);

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Invalid JSON body", body_preview: raw.slice(0, 200) }, 400);
    }

    const { items, mode } = parseItems(body);
    if (!items.length) return json({ ok: false, error: "Missing fields (to, subject, html)" }, 400);

    // ---- SETTINGS (DB) ----
    let settings;
    try {
      settings = await loadSettings();
    } catch {
      settings = { queue_enabled: true, provider_order: "sendgrid,brevo,mailgun", delay_ms: 250, batch_max: 100 };
    }

    const order = parseProviderOrder(settings.provider_order);
    const delayMs = Math.max(0, Math.min(5000, Number(settings.delay_ms || 0)));
    const batchMax = Math.max(1, Math.min(500, Number(settings.batch_max || 100)));
    const sliced = items.slice(0, batchMax);

    // ---- QUEUE MODE ----
    if (settings.queue_enabled) {
      const rows = sliced.map((it) => ({
        created_by: uid,
        to_email: it.to,
        subject: it.subject,
        html: it.html,
        status: "pending",
        not_before: new Date().toISOString(),
        attempts: 0,
        provider_order: order.join(","),
        meta: it.meta || {},
      }));

      const { error } = await sbAdmin.from("mail_queue").insert(rows);
      if (error) return json({ ok: false, error: "queue_insert_failed" }, 500);

      return json({
        ok: true,
        mode,
        results: rows.map((r) => ({ to: r.to_email, ok: true, queued: true })),
      });
    }

    // ---- SEND NOW MODE ----
    const results: any[] = [];
    for (let i = 0; i < sliced.length; i++) {
      const it = sliced[i];
      try {
        const out = await sendWithFallbacks(it, order);
        results.push({ to: it.to, ok: true, provider: out.provider });
      } catch (e) {
        results.push({ to: it.to, ok: false, error: String((e as any)?.message || e) });
      }
      if (delayMs && i < sliced.length - 1) await sleep(delayMs);
    }

    return json({ ok: true, mode, results });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
