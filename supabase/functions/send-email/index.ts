import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { getEmailCopy, type EmailLang } from "./email-templates.ts";

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

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY");

// Provider switch + fallback
// USE_AWS_SES=true  => primary = AWS SES, fallback = SendGrid
// USE_AWS_SES=false => primary = SendGrid, fallback = AWS SES
const USE_AWS_SES = (Deno.env.get("USE_AWS_SES") || "").toLowerCase() === "true";

// SendGrid click tracking rewrites links (e.g. buttons) to a SendGrid redirect URL.
// For auth emails it is usually preferable to disable click tracking.
const SG_DISABLE_CLICK_TRACKING = (Deno.env.get("SENDGRID_DISABLE_CLICK_TRACKING") || "true").toLowerCase() === "true";

// AWS SES (SigV4)
const AWS_REGION = Deno.env.get("AWS_REGION") || Deno.env.get("AWS_DEFAULT_REGION") || "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";

const HOOK_SECRET_RAW = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
const HOOK_SECRET = HOOK_SECRET_RAW.replace("v1,whsec_", "");
const webhook = new Webhook(HOOK_SECRET);

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
  // Primary/fallback based on USE_AWS_SES
  if (USE_AWS_SES) {
    try {
      await sendViaSes(to, subject, html);
      return;
    } catch (e1) {
      console.error("SES primary failed:", String(e1));
      await sendViaSendGrid(to, subject, html); // throws if fails
      return;
    }
  } else {
    try {
      await sendViaSendGrid(to, subject, html);
      return;
    } catch (e1) {
      console.error("SendGrid primary failed:", String(e1));
      await sendViaSes(to, subject, html); // throws if fails
      return;
    }
  }
}

async function sendViaSendGrid(to: string, subject: string, html: string) {
  if (!SENDGRID_KEY) throw new Error("Missing SENDGRID_API_KEY env");

  const body: Record<string, unknown> = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: "no-reply@familiada.online", name: "Familiada" },
    subject,
    content: [{ type: "text/html", value: html }],
  };

  if (SG_DISABLE_CLICK_TRACKING) {
    body["tracking_settings"] = {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
    };
  }

  const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!sgRes.ok) {
    const errTxt = await sgRes.text();
    throw new Error(`SendGrid failed (${to}): ${errTxt}`);
  }
}

/**
 * AWS SES v2 SendEmail via raw HTTPS + SigV4 signing.
 * Requires:
 *  - AWS_REGION
 *  - AWS_ACCESS_KEY_ID
 *  - AWS_SECRET_ACCESS_KEY
 *
 * Notes:
 *  - Your From domain/address must be verified in SES.
 *  - In SES sandbox you can only send to verified recipients.
 */
async function sendViaSes(to: string, subject: string, html: string) {
  if (!AWS_REGION) throw new Error("Missing AWS_REGION env");
  if (!AWS_ACCESS_KEY_ID) throw new Error("Missing AWS_ACCESS_KEY_ID env");
  if (!AWS_SECRET_ACCESS_KEY) throw new Error("Missing AWS_SECRET_ACCESS_KEY env");

  const host = `email.${AWS_REGION}.amazonaws.com`;
  const url = `https://${host}/v2/email/outbound-emails`;

  const payload = {
    FromEmailAddress: "no-reply@familiada.online",
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" } },
      },
    },
  };

  const body = JSON.stringify(payload);

  const headers = new Headers({
    "content-type": "application/json",
    host,
  });

  const signed = await signAwsRequest({
    method: "POST",
    url,
    headers,
    body,
    service: "ses",
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: signed,
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SES failed (${to}): ${txt}`);
  }
}

// --------------------------
// Minimal SigV4 signing utils
// --------------------------

type SignAwsRequestArgs = {
  method: string;
  url: string;
  headers: Headers;
  body: string;
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

async function signAwsRequest(args: SignAwsRequestArgs): Promise<Headers> {
  const url = new URL(args.url);

  // yyyyMMdd'T'HHmmss'Z'
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(args.body);

  const headers = new Headers(args.headers);
  headers.set("x-amz-date", amzDate);
  headers.set("x-amz-content-sha256", payloadHash);

  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers);

  const canonicalRequest = [
    args.method.toUpperCase(),
    encodePath(url.pathname),
    url.searchParams.toString(), // no special params used here
    canonicalHeaders + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${args.region}/${args.service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(args.secretAccessKey, dateStamp, args.region, args.service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `${algorithm} Credential=${args.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers.set("Authorization", authorization);

  return headers;
}

function toAmzDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function encodePath(pathname: string): string {
  // AWS expects each path segment URI-encoded, but "/" preserved
  return pathname.split("/").map(encodeURIComponent).join("/");
}

function canonicalizeHeaders(headers: Headers): { canonicalHeaders: string; signedHeaders: string } {
  const pairs: Array<[string, string]> = [];
  headers.forEach((v, k) => {
    const key = k.toLowerCase().trim();
    const val = String(v).replace(/\s+/g, " ").trim();
    pairs.push([key, val]);
  });
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const canonicalHeaders = pairs.map(([k, v]) => `${k}:${v}`).join("\n");
  const signedHeaders = pairs.map(([k]) => k).join(";");
  return { canonicalHeaders, signedHeaders };
}

async function sha256Hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmacRaw(key, data);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  const kSigning = await hmacRaw(kService, "aws4_request");
  return kSigning;
}


serve(async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Validate primary provider env (fallback provider env is optional, but recommended)
  if (USE_AWS_SES) {
    if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return json({ ok: false, error: "Missing AWS SES env (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)" }, 500);
    }
  } else {
    if (!SENDGRID_KEY) {
      return json({ ok: false, error: "Missing SENDGRID_API_KEY env" }, 500);
    }
  }

  if (!HOOK_SECRET) {
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
    return json({ ok: false, error: `Invalid signature: ${String(err)}` }, 401);
  }

  try {
    const redirectUrl = mustGetRedirectUrl(payload);
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
      }

      // ✅ NEW mail tylko jeśli znamy adres z redirect_to?to=
      // I to działa zarówno dla email_change_new, jak i dla “pojedynczego” email_change
      if (targetEmail && targetEmailNormalized !== currentEmailNormalized) {
        await sendEmail(targetEmail, subject, renderEmailChange(lang, linkTarget));
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

    return json({ ok: true });
  } catch (err) {
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
