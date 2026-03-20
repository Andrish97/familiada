import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "sendgrid" | "brevo" | "mailgun" | "ses";
type MailItem = { to: string; subject: string; html: string; meta?: Record<string, unknown> };
type LogLevel = "debug" | "info" | "warn" | "error";

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
const SES_ACCESS_KEY = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || "";
const SES_SECRET_KEY = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || "";
const SES_REGION = Deno.env.get("AWS_SES_REGION") || "us-east-1";

const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Familiada";

function scrubEmail(email: string) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at <= 1) return e ? "***" : "";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

function clampError(message: unknown, max = 2000) {
  return String(message ?? "").slice(0, max);
}

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
  const allowed: Provider[] = ["sendgrid", "brevo", "mailgun", "ses"];
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

async function sendViaSes(it: MailItem, region: string) {
  if (!SES_ACCESS_KEY || !SES_SECRET_KEY) throw new Error("missing_AWS_SES_credentials");

  // AWS SES v2 REST API z Signature V4
  const sesRegion = region || "us-east-1";
  const endpoint = `https://email.${sesRegion}.amazonaws.com/v2/email/outbound-emails`;

  const payload = JSON.stringify({
    FromEmailAddress: `${FROM_NAME} <${FROM_EMAIL}>`,
    Destination: { ToAddresses: [it.to] },
    Content: {
      Simple: {
        Subject: { Data: it.subject, Charset: "UTF-8" },
        Body: { Html: { Data: it.html, Charset: "UTF-8" } },
      },
    },
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const service = "ses";
  const host = `email.${sesRegion}.amazonaws.com`;

  // Canonical request
  const bodyHash = await sha256Hex(payload);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = ["POST", "/v2/email/outbound-emails", "", canonicalHeaders, signedHeaders, bodyHash].join("\n");

  // String to sign
  const credentialScope = `${dateStamp}/${sesRegion}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

  // Signing key
  const signingKey = await hmacSha256(
    await hmacSha256(
      await hmacSha256(
        await hmacSha256(new TextEncoder().encode("AWS4" + SES_SECRET_KEY), dateStamp),
        sesRegion
      ),
      service
    ),
    "aws4_request"
  );
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  const authHeader = `AWS4-HMAC-SHA256 Credential=${SES_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amz-Date": amzDate,
      "Authorization": authHeader,
    },
    body: payload,
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(`ses_failed:${errTxt || res.status}`);
  }
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: Uint8Array | ArrayBuffer, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function hmacSha256Hex(key: Uint8Array, data: string): Promise<string> {
  const buf = await hmacSha256(key, data);
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sendWithFallbacks(it: MailItem, order: Provider[]) {
  const errs: string[] = [];
  for (const p of order) {
    try {
      if (p === "sendgrid") await sendViaSendgrid(it);
      else if (p === "brevo") await sendViaBrevo(it);
      else if (p === "ses") await sendViaSes(it, SES_REGION);
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

function normEmail(e: string) {
  const s = String(e || "").trim().toLowerCase();
  return s.includes("@") ? s : "";
}

async function writeLog(entry: {
  requestId: string;
  level?: LogLevel;
  event: string;
  status?: string;
  actorUserId?: string | null;
  recipientEmail?: string | null;
  provider?: string | null;
  error?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const { error } = await sbAdmin.from("mail_function_logs").insert({
      function_name: "send-mail",
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
    if (error) {
      console.warn("[send-mail] log:insert_failed", { error });
    }
  } catch (err) {
    console.warn("[send-mail] log:insert_failed", { error: String(err) });
  }
}

async function filterByEmailNotifications(items: MailItem[]) {
  // 1) zbierz unikalne maile
  const emails = [...new Set(items.map((it) => normEmail(it.to)).filter(Boolean))];
  if (!emails.length) return { filtered: items, skipped: 0 };

  // 2) resolve email -> user_id (profiles)
  const { data: profs, error: pErr } = await sbAdmin
    .from("profiles")
    .select("id,email")
    .in("email", emails);

  if (pErr) throw pErr;

  const emailToUid = new Map<string, string>();
  for (const p of profs || []) {
    const em = normEmail((p as any).email);
    if (em) emailToUid.set(em, (p as any).id);
  }

  // 3) user_flags: email_notifications (dla zarejestrowanych)
  const uids = [...new Set([...emailToUid.values()])];
  const uidAllowed = new Map<string, boolean>();
  if (uids.length) {
    const { data: flags, error: fErr } = await sbAdmin
      .from("user_flags")
      .select("user_id,email_notifications")
      .in("user_id", uids);
    if (fErr) throw fErr;
    for (const uid of uids) uidAllowed.set(uid, true); // default: true
    for (const r of flags || []) {
      uidAllowed.set((r as any).user_id, (r as any).email_notifications !== false);
    }
  }

  // 4) email_unsub_tokens: suppressed_at IS NOT NULL (dla niezarejestrowanych)
  const unregisteredEmails = emails.filter((em) => !emailToUid.has(em));
  const suppressedEmails = new Set<string>();
  if (unregisteredEmails.length) {
    const { data: suppressed } = await sbAdmin
      .from("email_unsub_tokens")
      .select("email")
      .in("email", unregisteredEmails)
      .not("suppressed_at", "is", null);
    for (const r of suppressed || []) {
      suppressedEmails.add(normEmail((r as any).email));
    }
  }

  // 5) filtruj
  let skipped = 0;
  const skippedItems: Array<{ email: string; reason: "skipped_user_flag" | "skipped_suppression" }> = [];
  const filtered = items.filter((it) => {
    const em = normEmail(it.to);
    if (!em) return true;
    const uid = emailToUid.get(em);
    if (uid) {
      const ok = uidAllowed.get(uid) !== false;
      if (!ok) { skipped++; skippedItems.push({ email: it.to, reason: "skipped_user_flag" }); }
      return ok;
    }
    // niezarejestrowany — sprawdź suppression
    if (suppressedEmails.has(em)) { skipped++; skippedItems.push({ email: it.to, reason: "skipped_suppression" }); return false; }
    return true;
  });

  return { filtered, skipped, skippedItems };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  let actorUserId: string | null = null;

  try {

    console.log("[send-mail] request:start", {
      requestId,
      method: req.method,
      contentType: req.headers.get("content-type") || "",
      hasAuth: !!req.headers.get("authorization"),
    });
    await writeLog({
      requestId,
      event: "request_start",
      status: "started",
      meta: { method: req.method, contentType: req.headers.get("content-type") || "" },
    });

    // ---- AUTH ----
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      await writeLog({ requestId, level: "warn", event: "auth_missing_bearer", status: "failed" });
      return json({ ok: false, error: "Missing Bearer token" }, 401);
    }

    const { data: userData, error: authError } = await sbAnon.auth.getUser(token);
    if (authError || !userData?.user) {
      await writeLog({
        requestId,
        level: "warn",
        event: "auth_invalid_jwt",
        status: "failed",
        error: String(authError?.message || authError || "invalid_jwt"),
      });
      return json({ ok: false, error: "Invalid JWT" }, 401);
    }
    const uid = userData.user.id;
    actorUserId = uid;
    console.log("[send-mail] auth:ok", { uid });

    // ---- BODY ----
    const raw = await req.text();
    if (!raw.trim()) {
      await writeLog({
        requestId,
        level: "warn",
        event: "body_empty",
        status: "failed",
        actorUserId,
      });
      return json({ ok: false, error: "Empty body" }, 400);
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      await writeLog({
        requestId,
        level: "warn",
        event: "body_invalid_json",
        status: "failed",
        actorUserId,
        error: raw.slice(0, 300),
      });
      return json({ ok: false, error: "Invalid JSON body", body_preview: raw.slice(0, 200) }, 400);
    }

    const { items, mode } = parseItems(body);
    if (!items.length) {
      await writeLog({
        requestId,
        level: "warn",
        event: "body_missing_fields",
        status: "failed",
        actorUserId,
      });
      return json({ ok: false, error: "Missing fields (to, subject, html)" }, 400);
    }
    console.log("[send-mail] body:parsed", {
      mode,
      itemsIn: items.length,
      preview: items.slice(0, 3).map((x) => ({
        to: scrubEmail(x.to),
        subjectLen: x.subject.length,
        htmlLen: x.html.length,
        hasMeta: !!x.meta,
      })),
    });


    // ---- SETTINGS (DB) ----
    let settings;
    try {
      settings = await loadSettings();
    } catch (err) {
      await writeLog({
        requestId,
        level: "warn",
        event: "settings_load_failed",
        status: "degraded",
        actorUserId,
        error: String((err as any)?.message || err),
      });
      settings = { queue_enabled: true, provider_order: "sendgrid,brevo,mailgun", delay_ms: 250, batch_max: 100 };
    }

    const order = parseProviderOrder(settings.provider_order);
    const delayMs = Math.max(0, Math.min(5000, Number(settings.delay_ms || 0)));
    const batchMax = Math.max(1, Math.min(500, Number(settings.batch_max || 100)));
    const sliced = items.slice(0, batchMax);
    // ---- EMAIL NOTIFICATIONS FILTER (per recipient account) ----
    const f = await filterByEmailNotifications(sliced);
    const finalItems = f.filtered;

    // log per-skipped email
    for (const sk of f.skippedItems) {
      await writeLog({
        requestId,
        event: "email_skipped",
        status: "skipped",
        level: "info",
        actorUserId,
        recipientEmail: sk.email,
        provider: sk.reason,
      });
    }

    console.log("[send-mail] filter:email_notifications", {
      in: sliced.length,
      out: finalItems.length,
      skipped: f.skipped,
    });

    console.log("[send-mail] settings", {
      queue_enabled: settings.queue_enabled,
      provider_order_raw: settings.provider_order,
      order,
      delayMs,
      batchMax,
    });

    console.log("[send-mail] batch:slice", { requested: items.length, used: finalItems.length });
    await writeLog({
      requestId,
      event: "request_parsed",
      status: "ok",
      actorUserId,
      meta: {
        mode,
        itemsIn: items.length,
        itemsAfterBatch: sliced.length,
        itemsAfterFilter: finalItems.length,
        skippedByRecipientSettings: f.skipped,
        queueEnabled: settings.queue_enabled,
        delayMs,
        batchMax,
        providerOrder: order.join(","),
      },
    });

    if (!finalItems.length) {
      await writeLog({
        requestId,
        event: "request_done",
        status: "ok",
        actorUserId,
        meta: { mode, total: 0, failed: 0, skipped: f.skipped },
      });
      return json({ ok: true, mode, results: [], skipped: f.skipped });
    }


    // ---- QUEUE MODE ----
    if (settings.queue_enabled) {
      const rows = finalItems.map((it) => ({
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

      console.log("[send-mail] mode:queue", {
        count: rows.length,
        not_before: rows[0]?.not_before,
        provider_order: rows[0]?.provider_order,
      });


      const { error } = await sbAdmin.from("mail_queue").insert(rows);
      if (error) {
        await writeLog({
          requestId,
          level: "error",
          event: "queue_insert_failed",
          status: "failed",
          actorUserId,
          error: String(error.message || error),
          meta: { count: rows.length },
        });
        return json({ ok: false, error: "queue_insert_failed" }, 500);
      }

      console.log("[send-mail] queue:insert_ok", { count: rows.length });
      await writeLog({
        requestId,
        event: "queue_inserted",
        status: "queued",
        actorUserId,
        meta: { count: rows.length, providerOrder: order.join(",") },
      });

      return json({
        ok: true,
        mode,
        results: rows.map((r) => ({ to: r.to_email, ok: true, queued: true })),
      });
    }

    // ---- SEND NOW MODE ----
    console.log("[send-mail] mode:send_now", { count: finalItems.length, delayMs, order });
    const results: any[] = [];
    for (let i = 0; i < finalItems.length; i++) {
      const it = finalItems[i];
      console.log("[send-mail] send:item_start", { i: i + 1, n: finalItems.length, to: scrubEmail(it.to) });
      try {
        const out = await sendWithFallbacks(it, order);
        results.push({ to: it.to, ok: true, provider: out.provider });
        console.log("[send-mail] send:item_ok", { to: scrubEmail(it.to), provider: out.provider });
        await writeLog({
          requestId,
          event: "send_item_ok",
          status: "sent",
          actorUserId,
          recipientEmail: it.to,
          provider: out.provider,
        });
      } catch (e) {
        const errMsg = String((e as any)?.message || e);
        results.push({ to: it.to, ok: false, error: errMsg });
        console.warn("[send-mail] send:item_fail", { to: scrubEmail(it.to), error: errMsg });
        await writeLog({
          requestId,
          level: "error",
          event: "send_item_failed",
          status: "failed",
          actorUserId,
          recipientEmail: it.to,
          error: errMsg,
        });
      }
      if (delayMs && i < finalItems.length - 1) await sleep(delayMs);
    }

    const failed = results.filter((r) => !r.ok).length;
    console.log("[send-mail] request:done", { mode, total: results.length, failed });
    await writeLog({
      requestId,
      level: failed ? "warn" : "info",
      event: "request_done",
      status: failed ? "partial_failed" : "ok",
      actorUserId,
      meta: { mode, total: results.length, failed },
    });
    return json({ ok: failed === 0, mode, results, failed });
  } catch (e) {
    await writeLog({
      requestId,
      level: "error",
      event: "request_error",
      status: "failed",
      actorUserId,
      error: String((e as any)?.message || e),
    });
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
