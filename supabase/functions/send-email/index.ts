import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { getEmailCopy, type EmailLang } from "../../../translation/email-templates.ts";

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
      | "email_change_current"
      | "email_change_new"
      | string;
  };
};

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY");
const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://www.familiada.online";
const HOOK_SECRET_RAW = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
const HOOK_SECRET = HOOK_SECRET_RAW.replace("v1,whsec_", "");
const webhook = new Webhook(HOOK_SECRET);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!SENDGRID_KEY) {
    return new Response("Missing SENDGRID_API_KEY env", { status: 500 });
  }

  if (!HOOK_SECRET) {
    return new Response("Missing SEND_EMAIL_HOOK_SECRET env", { status: 500 });
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
    return new Response(`Invalid signature: ${String(err)}`, { status: 401 });
  }

  try {
    const lang = pickLang(payload);
    const type = payload.email_data.email_action_type;
    const actionLink = buildActionLink(payload, lang);
    const subject = subjectFor(type, lang);
    const html = renderHtml(type, lang, actionLink);

    const to =
      type === "email_change_new"
        ? payload.user.email_new || payload.user.email
        : payload.user.email;

    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: "no-reply@familiada.online", name: "Familiada" },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });

    if (!sgRes.ok) {
      const errTxt = await sgRes.text();
      return new Response(`SendGrid failed: ${errTxt}`, { status: 500 });
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    return new Response(`Hook error: ${String(err)}`, { status: 500 });
  }
});

function pickLang(payload: HookPayload): EmailLang {
  const redirect = payload.email_data.redirect_to || "";
  try {
    const url = new URL(redirect);
    const lang = (url.searchParams.get("lang") || "").toLowerCase();
    if (lang === "uk") return "uk";
    if (lang === "en") return "en";
    if (lang === "pl") return "pl";
  } catch {
    // ignore invalid URL
  }

  const metaLang = String(payload.user.user_metadata?.language || "").toLowerCase();
  if (metaLang === "uk") return "uk";
  if (metaLang === "en") return "en";
  return "pl";
}

function buildActionLink(payload: HookPayload, lang: EmailLang): string {
  const type = payload.email_data.email_action_type;
  const tokenHash = payload.email_data.token_hash;

  if (!tokenHash) {
    throw new Error("Missing token_hash in email_data");
  }

  if (type === "signup") {
    return `${PUBLIC_SITE_URL}/confirm.html?token_hash=${encodeURIComponent(tokenHash)}&type=signup&lang=${lang}`;
  }

  if (type === "recovery") {
    return `${PUBLIC_SITE_URL}/reset.html?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&lang=${lang}`;
  }

  if (type === "email_change_current" && payload.email_data.token_hash_new) {
    return `${PUBLIC_SITE_URL}/confirm.html?token_hash=${encodeURIComponent(payload.email_data.token_hash_new)}&type=email_change&lang=${lang}`;
  }

  if (type === "email_change_new") {
    return `${PUBLIC_SITE_URL}/confirm.html?token_hash=${encodeURIComponent(tokenHash)}&type=email_change&lang=${lang}`;
  }

  return `${PUBLIC_SITE_URL}/confirm.html?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&lang=${lang}`;
}

function subjectFor(type: string, lang: EmailLang): string {
  const normalized =
    type === "email_change_current" || type === "email_change_new" ? "email_change" : type;

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
  if (type === "email_change_current" || type === "email_change_new") {
    return renderEmailChange(lang, actionLink);
  }
  return renderSignup(lang, actionLink);
}

function renderSignup(lang: EmailLang, link: string): string {
  const t = getEmailCopy("signup", lang);
  return `
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
    <div style="padding:14px 14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${t.subtitle}</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${t.title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${t.desc}</div>
      <div style="margin:16px 0;">
        <a href="${link}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${t.btn}</a>
      </div>
      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t.ignore}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t.linkLabel ?? t.copyHint}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">${link}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t.footer}</div>
  </div>
</div>
`;
}

function renderEmailChange(lang: EmailLang, link: string): string {
  const t = getEmailCopy("email_change", lang);
  return `
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#ffffff;">
    <div style="padding:14px 14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${t.subtitle}</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${t.title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${t.desc}</div>
      <div style="margin:16px 0;">
        <a href="${link}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;text-transform:uppercase;">${t.btn}</a>
      </div>
      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t.ignore}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t.copyHint}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">${link}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t.footer}</div>
  </div>
</div>
`;
}

function renderRecovery(lang: EmailLang, link: string): string {
  const t = getEmailCopy("recovery", lang);
  return `
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
    <div style="padding:14px 14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${t.subtitle}</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${t.title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${t.desc}</div>
      <div style="margin:16px 0;">
        <a href="${link}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${t.btn}</a>
      </div>
      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t.ignore}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t.copyHint}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">${link}</div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t.footer}</div>
  </div>
</div>
`;
}
