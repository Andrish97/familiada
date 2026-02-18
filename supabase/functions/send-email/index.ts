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
    email: string;
    user_metadata?: Record<string, unknown>;
    email_new?: string;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
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

async function sendWithFallbacks(to: string, subject: string, html: string) {
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
      return { provider: p };
    } catch (e) {
      const msg = String((e as any)?.message || e);
      console.warn("[send-email] provider failed", { provider: p, error: msg });
      errs.push(`${p}:${msg}`);
    }
  }

  console.error("[send-email] all providers failed", errs);
  throw new Error(errs.join("|"));
}

function mustGetRedirectUrl(payload: HookPayload): URL {
  const redirect = String(payload.email_data.redirect_to || "").trim();
  if (!redirect) {
    throw new Error(
      "Missing email_data.redirect_to. Pass an absolute emailRedirectTo from the frontend (use window.location.origin)."
    );
  }
  try {
    return new URL(redirect);
  } catch {
    throw new Error(
      `Invalid email_data.redirect_to URL: "${redirect}". It must be absolute (including https://...).`
    );
  }
}

function getLangFromRedirect(url: URL): EmailLang | "" {
  const lang = (url.searchParams.get("lang") || "").toLowerCase();
  if (lang === "uk") return "uk";
  if (lang === "en") return "en";
  if (lang === "pl") return "pl";
  return "";
}

function extractTargetEmail(payload: HookPayload, redirectUrl: URL): string {
  const fromTo = String(redirectUrl.searchParams.get("to") || "").trim();
  if (fromTo) return fromTo;

  const fromUserNew = String(payload.user.email_new || "").trim();
  if (fromUserNew) return fromUserNew;

  const fromEmailDataNew = String((payload.email_data as unknown as { new_email?: string }).new_email || "").trim();
  if (fromEmailDataNew) return fromEmailDataNew;

  const fromMeta = String(payload.user.user_metadata?.familiada_email_change_pending || "").trim();
  if (fromMeta) return fromMeta;

  return "";
}


function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  await sendWithFallbacks(to, subject, html);
}

serve(async (req) => {
  console.log("[send-email] request:start", { method: req.method, contentType: req.headers.get("content-type") || "" });
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!SENDGRID_KEY) {
    console.error("[send-email] config:missing_SENDGRID_API_KEY");
    return json({ ok: false, error: "Missing SENDGRID_API_KEY env" }, 500);
  }

  if (!HOOK_SECRET) {
    console.error("[send-email] config:missing_SEND_EMAIL_HOOK_SECRET");
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
    return json({ ok: false, error: `Invalid signature: ${String(err)}` }, 401);
  }

  try {
    const redirectUrl = mustGetRedirectUrl(payload);
    console.log("[send-email] payload:verified", { actionType: payload.email_data.email_action_type, userEmail: scrubEmail(payload.user.email || ""), userEmailNew: scrubEmail(payload.user.email_new || ""), redirectTo: payload.email_data.redirect_to || "" });
    const baseOrigin = redirectUrl.origin;
    const lang = pickLang(payload, redirectUrl);
    const type = payload.email_data.email_action_type;
    console.log("ACTION", payload.email_data.email_action_type);
    console.log("user.email", payload.user.email);
    console.log("user.email_new", payload.user.email_new);
    console.log("has token_hash", !!payload.email_data.token_hash);
    console.log("has token_hash_new", !!payload.email_data.token_hash_new);
    console.log("email_data.old_email", (payload.email_data as { old_email?: string }).old_email);
    console.log("email_data.new_email", (payload.email_data as { new_email?: string }).new_email);
    console.log("redirect_to", payload.email_data.redirect_to);


  if (type === "email_change" || type === "email_change_current" || type === "email_change_new") {
      const currentEmail = String(payload.user.email || "").trim();
      const currentEmailNormalized = currentEmail.toLowerCase();

      const redirect = String(payload.email_data.redirect_to || "").trim();
      const targetEmail = extractTargetEmail(payload, redirectUrl).trim();
      const targetEmailNormalized = targetEmail.toLowerCase();

      console.log("redirect_to", redirect);
      console.log("targetEmail", targetEmail);
const tokenHash = payload.email_data.token_hash || "";
      const tokenHashNew = payload.email_data.token_hash_new || "";

      const subject = subjectFor("email_change", lang);

      // linki (fallbacki na wypadek zamiany nazw przez Supabase)
      const linkCurrent =
        `${baseOrigin}/confirm.html?token_hash=${encodeURIComponent(tokenHashNew || tokenHash)}&type=email_change&lang=${lang}`;
      const linkTarget =
        `${baseOrigin}/confirm.html?token_hash=${encodeURIComponent(tokenHash || tokenHashNew)}&type=email_change&lang=${lang}`;

      // ✅ CURRENT mail zawsze na payload.user.email
      if (currentEmail) {
        await sendEmail(currentEmail, subject, renderEmailChange(lang, linkCurrent));
        console.log("[send-email] sent:email_change_current", { to: scrubEmail(currentEmail) });
      }

      // ✅ NEW mail tylko jeśli znamy adres z redirect_to?to=
      // I to działa zarówno dla email_change_new, jak i dla “pojedynczego” email_change
      if (targetEmail && targetEmailNormalized !== currentEmailNormalized) {
        await sendEmail(targetEmail, subject, renderEmailChange(lang, linkTarget));
        console.log("[send-email] sent:email_change_new", { to: scrubEmail(targetEmail) });
      }

      return json({ ok: true });
    }


    const actionLink = buildActionLink(payload, lang, baseOrigin);
    const subject = subjectFor(type, lang);
    const html = renderHtml(type, lang, actionLink);

    const to =
      type === "email_change_new"
        ? payload.user.email_new || payload.user.email
        : payload.user.email;

    await sendEmail(to, subject, html);
    console.log("[send-email] sent", { actionType: type, to: scrubEmail(to) });

    return json({ ok: true });
  } catch (err) {
    console.error("[send-email] request:error", { error: String(err) });
    return json({ ok: false, error: `Hook error: ${String(err)}` }, 500);
  }
});

function pickLang(payload: HookPayload, redirectUrl?: URL): EmailLang {
  const url = redirectUrl || (() => {
    try { return mustGetRedirectUrl(payload); } catch { return null; }
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
