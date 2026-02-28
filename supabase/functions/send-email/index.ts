import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { getEmailCopy, type EmailLang } from "./email-templates.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const sbAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

type HookPayload = {
  user: {
    id?: string;
    email: string;
    user_metadata?: Record<string, unknown>;
    email_new?: string;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    action_link?: string;
    old_email?: string;
    new_email?: string;
    redirect_to?: string;
    email_action_type:
      | "signup"
      | "recovery"
      | "email_change"
      | "email_change_current"
      | "email_change_new"
      | string;
  };
};

type Provider = "sendgrid" | "brevo" | "mailgun";
type LogLevel = "debug" | "info" | "warn" | "error";

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

async function loadProviderOrder(): Promise<Provider[]> {
  if (!sbAdmin) {
    console.warn("[send-email] no sbAdmin → fallback default order");
    return ["sendgrid", "brevo", "mailgun"];
  }

  try {
    const { data, error } = await sbAdmin
      .from("mail_settings")
      .select("provider_order")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    const order = parseProviderOrder(data?.provider_order || "");
    console.log("[send-email] provider_order from DB:", order);

    return order;
  } catch (e) {
    console.warn(
      "[send-email] provider_order load failed → default",
      String((e as any)?.message || e)
    );
    return ["sendgrid", "brevo", "mailgun"];
  }
}


const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY");
const BREVO_KEY = Deno.env.get("BREVO_API_KEY") || "";
const MAILGUN_KEY = Deno.env.get("MAILGUN_API_KEY") || "";
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN") || "";
const MAILGUN_REGION = (Deno.env.get("MAILGUN_REGION") || "eu").toLowerCase();

const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Familiada";

const HOOK_SECRET_RAW = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
const HOOK_SECRET = HOOK_SECRET_RAW.replace("v1,whsec_", "");
const webhook = new Webhook(HOOK_SECRET);

function scrubEmail(email: string) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at <= 1) return e ? "***" : "";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

function clampError(message: unknown, max = 2000) {
  return String(message ?? "").slice(0, max);
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
  if (!sbAdmin) return;
  try {
    const { error } = await sbAdmin.from("mail_function_logs").insert({
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
    if (error) {
      console.warn("[send-email] log:insert_failed", { error });
    }
  } catch (err) {
    console.warn("[send-email] log:insert_failed", { error: String(err) });
  }
}

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
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    }),
  });
  if (!res.ok) throw new Error(`sendgrid_failed:${await res.text().catch(() => "")}`);
}

async function sendViaBrevo(to: string, subject: string, html: string) {
  if (!BREVO_KEY) throw new Error("missing_BREVO_API_KEY");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
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

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` },
    body: form,
  });
  if (!res.ok) throw new Error(`mailgun_failed:${await res.text().catch(() => "")}`);
}

async function sendWithFallbacks(
  to: string,
  subject: string,
  html: string,
  opts: { requestId: string; actorUserId?: string | null } | null = null,
) {
  const order = await loadProviderOrder();

  console.log("[send-email] send start", {
    to: scrubEmail(to),
    order,
  });

  const errs: string[] = [];

  for (const p of order) {
    try {
      console.log("[send-email] try provider:", p);

      if (p === "sendgrid") await sendViaSendgrid(to, subject, html);
      else if (p === "brevo") await sendViaBrevo(to, subject, html);
      else await sendViaMailgun(to, subject, html);

      console.log("[send-email] success via", p);
      if (opts?.requestId) {
        await writeLog({
          requestId: opts.requestId,
          event: "provider_success",
          status: "sent",
          actorUserId: opts.actorUserId || null,
          recipientEmail: to,
          provider: p,
        });
      }
      return { provider: p };
    } catch (e) {
      const msg = String((e as any)?.message || e);
      console.warn("[send-email] provider failed", { provider: p, error: msg });
      if (opts?.requestId) {
        await writeLog({
          requestId: opts.requestId,
          level: "warn",
          event: "provider_failed",
          status: "failed",
          actorUserId: opts.actorUserId || null,
          recipientEmail: to,
          provider: p,
          error: msg,
        });
      }
      errs.push(`${p}:${msg}`);
    }
  }

  console.error("[send-email] all providers failed", errs);
  if (opts?.requestId) {
    await writeLog({
      requestId: opts.requestId,
      level: "error",
      event: "all_providers_failed",
      status: "failed",
      actorUserId: opts.actorUserId || null,
      recipientEmail: to,
      error: errs.join("|"),
    });
  }
  throw new Error(errs.join("|"));
}

function getRedirectUrl(payload: HookPayload): URL | null {
  const redirect = String(payload.email_data.redirect_to || "").trim();
  if (!redirect) return null;
  try {
    return new URL(redirect);
  } catch {
    console.warn("[send-email] invalid redirect_to (ignored)", { redirect });
    return null;
  }
}

function getBaseOrigin(payload: HookPayload, redirectUrl: URL | null): string {
  if (redirectUrl) return redirectUrl.origin;

  const actionLink = String(payload.email_data.action_link || "").trim();
  if (actionLink) {
    try {
      return new URL(actionLink).origin;
    } catch {
      console.warn("[send-email] invalid action_link origin (ignored)");
    }
  }

  const siteUrl = String(Deno.env.get("SITE_URL") || "").trim();
  if (siteUrl) {
    try {
      return new URL(siteUrl).origin;
    } catch {
      console.warn("[send-email] invalid SITE_URL origin (ignored)");
    }
  }

  throw new Error("Cannot resolve base origin (no valid redirect_to/action_link/SITE_URL)");
}

function getLangFromRedirect(url: URL): EmailLang | "" {
  const lang = (url.searchParams.get("lang") || "").toLowerCase();
  if (lang === "uk") return "uk";
  if (lang === "en") return "en";
  if (lang === "pl") return "pl";
  return "";
}

function extractTargetEmail(payload: HookPayload, redirectUrl: URL | null): string {
  const fromRedirect =
    String(redirectUrl?.searchParams.get("to") || "").trim() ||
    String(redirectUrl?.searchParams.get("email") || "").trim() ||
    String(redirectUrl?.searchParams.get("new_email") || "").trim() ||
    String(redirectUrl?.searchParams.get("email_new") || "").trim();
  if (fromRedirect) return fromRedirect;

  const actionLink = String(payload.email_data.action_link || "").trim();
  if (actionLink) {
    try {
      const u = new URL(actionLink);
      const fromAction =
        String(u.searchParams.get("to") || "").trim() ||
        String(u.searchParams.get("email") || "").trim() ||
        String(u.searchParams.get("new_email") || "").trim() ||
        String(u.searchParams.get("email_new") || "").trim();
      if (fromAction) return fromAction;
    } catch {
      console.warn("[send-email] invalid action_link while extracting target email");
    }
  }

  const fromUserNew = String(payload.user.email_new || "").trim();
  if (fromUserNew) return fromUserNew;

  const fromEmailDataNew = String(payload.email_data.new_email || "").trim();
  if (fromEmailDataNew) return fromEmailDataNew;

  const fromEmailDataOld = String(payload.email_data.old_email || "").trim();
  if (fromEmailDataOld) return fromEmailDataOld;

  const fromMeta = String(payload.user.user_metadata?.familiada_email_change_pending || "").trim();
  if (fromMeta) return fromMeta;

  return "";
}

function firstEmail(...values: (string | undefined)[]): string {
  for (const value of values) {
    const email = String(value || "").trim();
    if (email) return email;
  }
  return "";
}

async function loadUserEmailFallbacks(userId: string): Promise<{
  email: string;
  emailNew: string;
  pendingMetaEmail: string;
}> {
  if (!sbAdmin) return { email: "", emailNew: "", pendingMetaEmail: "" };

  try {
    const { data, error } = await sbAdmin.auth.admin.getUserById(userId);
    if (error) throw error;

    const user = data?.user;
    const pendingMetaEmail = String(user?.user_metadata?.familiada_email_change_pending || "").trim();
    return {
      email: String(user?.email || "").trim(),
      emailNew: String((user as { email_change?: string } | undefined)?.email_change || "").trim(),
      pendingMetaEmail,
    };
  } catch (err) {
    console.warn("[send-email] fallback user load failed", { userId, error: String(err) });
    return { email: "", emailNew: "", pendingMetaEmail: "" };
  }
}


function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts: { requestId: string; actorUserId?: string | null } | null = null,
) {
  await sendWithFallbacks(to, subject, html, opts);
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log("[send-email] request:start", { requestId, method: req.method, contentType: req.headers.get("content-type") || "" });
  await writeLog({
    requestId,
    event: "request_start",
    status: "started",
    meta: { method: req.method, contentType: req.headers.get("content-type") || "" },
  });

  if (req.method !== "POST") {
    await writeLog({
      requestId,
      level: "warn",
      event: "method_not_allowed",
      status: "failed",
      meta: { method: req.method },
    });
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!SENDGRID_KEY) {
    console.error("[send-email] config:missing_SENDGRID_API_KEY");
    await writeLog({
      requestId,
      level: "error",
      event: "config_missing_sendgrid_key",
      status: "failed",
    });
    return json({ ok: false, error: "Missing SENDGRID_API_KEY env" }, 500);
  }

  if (!HOOK_SECRET) {
    console.error("[send-email] config:missing_SEND_EMAIL_HOOK_SECRET");
    await writeLog({
      requestId,
      level: "error",
      event: "config_missing_hook_secret",
      status: "failed",
    });
    return json({ ok: false, error: "Missing SEND_EMAIL_HOOK_SECRET env" }, 500);
  }

  const raw = await req.text();
  const sig = req.headers.get("webhook-signature") || "";
  const ts = req.headers.get("webhook-timestamp") || "";
  const id = req.headers.get("webhook-id") || "";

  let payload: HookPayload;
  try {
    payload = webhook.verify(raw, {
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": sig,
    }) as HookPayload;
  } catch (err) {
    console.error("[send-email] request:invalid_signature", { error: String(err) });
    await writeLog({
      requestId,
      level: "error",
      event: "request_invalid_signature",
      status: "failed",
      error: String(err),
    });
    return json({ ok: false, error: `Invalid signature: ${String(err)}` }, 401);
  }

  try {
    const redirectUrl = getRedirectUrl(payload);
    const actorUserId = String(payload.user.id || "").trim() || null;
    await writeLog({
      requestId,
      event: "payload_verified",
      status: "ok",
      actorUserId,
      meta: {
        actionType: payload.email_data.email_action_type,
        redirectTo: payload.email_data.redirect_to || "",
      },
    });
    console.log("[send-email] payload:verified", { actionType: payload.email_data.email_action_type, userEmail: scrubEmail(payload.user.email || ""), userEmailNew: scrubEmail(payload.user.email_new || ""), redirectTo: payload.email_data.redirect_to || "" });
    const baseOrigin = getBaseOrigin(payload, redirectUrl);
    const lang = pickLang(payload, redirectUrl);
    const type = payload.email_data.email_action_type;
    console.log("ACTION", payload.email_data.email_action_type);
    console.log("user.email", payload.user.email);
    console.log("user.email_new", payload.user.email_new);
    console.log("has token_hash", !!payload.email_data.token_hash);
    console.log("has token_hash_new", !!payload.email_data.token_hash_new);
    console.log("email_data.old_email", (payload.email_data as { old_email?: string }).old_email);
    console.log("email_data.new_email", payload.email_data.new_email);
    console.log("redirect_to", payload.email_data.redirect_to);

    if (type === "email_change" || type === "email_change_current" || type === "email_change_new") {
      const userId = String(payload.user.id || "").trim();
      const fallbackUser = userId ? await loadUserEmailFallbacks(userId) : { email: "", emailNew: "", pendingMetaEmail: "" };
      const currentEmail = firstEmail(payload.user.email, fallbackUser.email).trim();
      const currentEmailNormalized = currentEmail.toLowerCase();
      const oldEmail = String(payload.email_data.old_email || "").trim();
      const newEmail = String(payload.email_data.new_email || "").trim();
      const pendingMetaEmail = firstEmail(
        String(payload.user.user_metadata?.familiada_email_change_pending || ""),
        fallbackUser.pendingMetaEmail,
      ).trim();
      const intent = String(payload.user.user_metadata?.familiada_email_change_intent || "").trim().toLowerCase();
      const isGuestMigrate = intent === "guest_migrate";

      const redirect = String(payload.email_data.redirect_to || "").trim();
      const targetEmail = firstEmail(
        extractTargetEmail(payload, redirectUrl),
        newEmail,
        payload.user.email_new,
        fallbackUser.emailNew,
        pendingMetaEmail,
        // Supabase potrafi wysłać pusty user.email przy konwersji konta gościa.
        // Wtedy old_email bywa jedynym dostępnym adresem nowego konta.
        oldEmail,
      ).trim();
      const targetEmailNormalized = targetEmail.toLowerCase();

      console.log("redirect_to", redirect);
      console.log("targetEmail", targetEmail);
      const tokenHash = payload.email_data.token_hash || "";
      const tokenHashNew = payload.email_data.token_hash_new || "";

      const emailTemplate = isGuestMigrate ? "guest_migrate" : "email_change";
      const subject = subjectFor(emailTemplate, lang);

      // mapping zgodny z Supabase:
      // - token_hash      => current email
      // - token_hash_new  => new email (lub token_hash jeśli secure email change OFF)
      const thCurrent = tokenHash;
      const thNew = tokenHashNew || tokenHash;

      const linkCurrent =
        `${baseOrigin}/confirm.html?token_hash=${encodeURIComponent(thCurrent)}&type=email_change&lang=${lang}`;
      const linkTarget =
        `${baseOrigin}/confirm.html?token_hash=${encodeURIComponent(thNew)}&type=email_change&lang=${lang}`;

      // ✅ CURRENT mail zawsze na payload.user.email
      if (currentEmail && thCurrent) {
        const htmlCurrent = emailTemplate === "guest_migrate"
          ? renderSignupMigrate(lang, linkCurrent)
          : renderEmailChange(lang, linkCurrent);
        await sendEmail(currentEmail, subject, htmlCurrent, { requestId, actorUserId });
        console.log("[send-email] sent:email_change_current", { to: scrubEmail(currentEmail) });
      }

      // ✅ NEW mail tylko jeśli znamy adres z redirect_to?to=
      // I to działa zarówno dla email_change_new, jak i dla “pojedynczego” email_change
      if (targetEmail && thNew && targetEmailNormalized !== currentEmailNormalized) {
        const htmlTarget = emailTemplate === "guest_migrate"
          ? renderSignupMigrate(lang, linkTarget)
          : renderEmailChange(lang, linkTarget);
        await sendEmail(targetEmail, subject, htmlTarget, { requestId, actorUserId });
        console.log("[send-email] sent:email_change_new", { to: scrubEmail(targetEmail) });
      }

      await writeLog({
        requestId,
        event: "request_done",
        status: "ok",
        actorUserId,
        meta: { actionType: type, flow: "email_change" },
      });
      return json({ ok: true });
    }


    const actionLink = buildActionLink(payload, lang, baseOrigin);
    const subject = subjectFor(type, lang);
    const html = renderHtml(type, lang, actionLink);

    const to =
      type === "email_change_new"
        ? payload.user.email_new || payload.user.email
        : payload.user.email;

    await sendEmail(to, subject, html, { requestId, actorUserId: String(payload.user.id || "").trim() || null });
    console.log("[send-email] sent", { actionType: type, to: scrubEmail(to) });
    await writeLog({
      requestId,
      event: "request_done",
      status: "ok",
      actorUserId: String(payload.user.id || "").trim() || null,
      recipientEmail: to,
      meta: { actionType: type },
    });

    return json({ ok: true });
  } catch (err) {
    console.error("[send-email] request:error", { error: String(err) });
    await writeLog({
      requestId,
      level: "error",
      event: "request_error",
      status: "failed",
      actorUserId: String(payload.user.id || "").trim() || null,
      error: String(err),
      meta: { actionType: payload.email_data.email_action_type || "" },
    });
    return json({ ok: false, error: `Hook error: ${String(err)}` }, 500);
  }
});

function pickLang(payload: HookPayload, redirectUrl?: URL): EmailLang {
  const url = redirectUrl || (() => {
    return getRedirectUrl(payload);
  })();

  if (url) {
    const l = getLangFromRedirect(url);
    if (l) return l;
  }

  const metaLang = String(payload.user.user_metadata?.language || "").toLowerCase();
  if (metaLang === "uk") return "uk";
  if (metaLang === "en") return "en";
  return "pl";
}

function buildActionLink(payload: HookPayload, lang: EmailLang, baseOrigin: string): string {
  const type = payload.email_data.email_action_type;
        const tokenHash = payload.email_data.token_hash || "";
  const tokenHashNew = payload.email_data.token_hash_new || "";

  const mk = (page: "confirm.html" | "reset.html", th: string, t: string) => {
    if (!th) throw new Error(`Missing token_hash for type=${type}`);
    return `${baseOrigin}/${page}?token_hash=${encodeURIComponent(th)}&type=${encodeURIComponent(t)}&lang=${lang}`;
  };

  if (type === "signup") return mk("confirm.html", tokenHash, "signup");
  if (type === "recovery") return mk("reset.html", tokenHash, "recovery");

  if (type === "email_change") return mk("confirm.html", tokenHash, "email_change");
  if (type === "email_change_current") return mk("confirm.html", tokenHash, "email_change");
  if (type === "email_change_new") return mk("confirm.html", tokenHashNew || tokenHash, "email_change");

  return mk("confirm.html", tokenHash, type);
}

function subjectFor(type: string, lang: EmailLang): string {
  const normalized =
    type === "email_change_current" || type === "email_change_new" || type === "email_change"
      ? "email_change"
      : type;

  const map: Record<string, Record<"pl" | "en" | "uk", string>> = {
    signup: {
      pl: "FAMILIADA — Potwierdzenie konta",
      en: "FAMILIADA — Confirm your account",
      uk: "FAMILIADA — Підтвердження облікового запису",
    },
    guest_migrate: {
      pl: "FAMILIADA — Potwierdź migrację",
      en: "FAMILIADA — Confirm migration",
      uk: "FAMILIADA — Підтвердіть міграцію",
    },
    recovery: {
      pl: "FAMILIADA — Reset hasła",
      en: "FAMILIADA — Password reset",
      uk: "FAMILIADA — Скидання пароля",
    },
    email_change: {
      pl: "FAMILIADA — Zmiana e-mail",
      en: "FAMILIADA — Email change",
      uk: "FAMILIADA — Зміна e-mail",
    },
  };

  return map[normalized]?.[lang] || "FAMILIADA";
}

function renderHtml(type: string, lang: EmailLang, actionLink: string): string {
  if (type === "signup") {
    return renderSignup(lang, actionLink);
  }
  if (type === "guest_migrate") {
    return renderSignupMigrate(lang, actionLink);
  }
  if (type === "recovery") {
    return renderRecovery(lang, actionLink);
  }
  if (type === "email_change" || type === "email_change_current" || type === "email_change_new") {
    return renderEmailChange(lang, actionLink);
  }
  return renderSignup(lang, actionLink);
}

function wrapEmailDoc(innerHtml: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>:root{color-scheme:dark}</style>
</head>
<body style="margin:0;padding:0;background:#050914;color:#ffffff;">
${innerHtml}
</body>
</html>`;
}


function renderSignup(lang: EmailLang, link: string): string {
  const t = getEmailCopy("signup", lang);
  return wrapEmailDoc(`
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
    <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${t.subtitle}</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${t.title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${t.desc}</div>
      <div style="margin:16px 0;">
        <a href="${link}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${t.btn}</a>
      </div>
      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t.ignore}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t.linkLabel ?? t.copyHint}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">${link}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t.footer}</div>
  </div>
</div>
`);
}

function renderSignupMigrate(lang: EmailLang, link: string): string {
  const t = getEmailCopy("guest_migrate", lang);
  return wrapEmailDoc(`
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
    <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${t.subtitle}</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${t.title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${t.desc}</div>
      <div style="margin:16px 0;">
        <a href="${link}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${t.btn}</a>
      </div>
      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t.ignore}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t.linkLabel ?? t.copyHint}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">${link}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t.footer}</div>
  </div>
</div>
`);
}

function renderEmailChange(lang: EmailLang, link: string): string {
  const t = getEmailCopy("email_change", lang);
  return wrapEmailDoc(`
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#ffffff;">
    <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${t.subtitle}</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${t.title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${t.desc}</div>
      <div style="margin:16px 0;">
        <a href="${link}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;text-transform:uppercase;">${t.btn}</a>
      </div>
      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t.ignore}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t.copyHint}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">${link}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t.footer}</div>
  </div>
</div>
`);
}

function renderRecovery(lang: EmailLang, link: string): string {
  const t = getEmailCopy("recovery", lang);
  return wrapEmailDoc(`
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
    <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${t.subtitle}</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${t.title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${t.desc}</div>
      <div style="margin:16px 0;">
        <a href="${link}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${t.btn}</a>
      </div>
      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t.ignore}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t.copyHint}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">${link}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t.footer}</div>
  </div>
</div>
`);
}
