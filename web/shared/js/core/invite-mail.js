// Wspólny dokument i transport wiadomości zaproszeń (E19).
import { sb, SUPABASE_URL } from "./supabase.js?v=v2026-10-11T11071";
import { t, getUiLang } from "../../translation/translation.js?v=v2026-10-11T11071";
const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;
const escapeHtml = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function mailLink(path, { withLang = false } = {}) {
  let u;
  try {
    u = new URL(path, location.origin);
  } catch {
    u = new URL(String(path || ""), location.origin);
  }

  if (withLang) u.searchParams.set("lang", getUiLang() || "pl");
  return u.href;
}

function wrapEmailDoc(innerHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>:root { color-scheme: dark; }</style>
</head>
<body style="margin:0;padding:0;background:#050914;color:#ffffff;">
${innerHtml}
</body>
</html>`;
}

function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl, unsubToken, isRegistered }) {
  let footerExtra = "";
  if (isRegistered) {
    const accountUrl = mailLink("account", { withLang: true });
    footerExtra = `<div style="margin-top:10px;font-size:11px;opacity:.55;text-align:center;">
      ${t("pollGo.mailAccountSettings")}
      <a href="${accountUrl}" style="color:#ffeaa6;text-decoration:underline;">${t("pollGo.mailAccountSettingsLink")}</a>
    </div>`;
  } else if (unsubToken) {
    const globalUrl = mailLink(`/go/?u=${encodeURIComponent(unsubToken)}`);
    footerExtra = `<div style="margin-top:10px;font-size:11px;opacity:.55;text-align:center;">
      <a href="${globalUrl}" style="color:#ffeaa6;opacity:.7;text-decoration:underline;">${t("pollGo.mailUnsubGlobal")}</a>
    </div>`;
  }

  const inner = `
<div style="margin:0;padding:0;background:#050914;color:#ffffff;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;background:#050914;">
    <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(subtitle)}</div>
    </div>

    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${escapeHtml(title)}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${escapeHtml(body)}</div>

      <div style="margin:16px 0;">
        <a href="${actionUrl}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:#2a2b1a;background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${escapeHtml(actionLabel)}</a>
      </div>

      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t("pollsHubSubscriptions.mail.ignoreNote")}</div>

      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t("pollsHubSubscriptions.mail.linkHint")}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">${actionUrl}</div>
      </div>
    </div>

    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t("pollsHubSubscriptions.mail.autoNote")}</div>
    ${footerExtra}
  </div>
</div>
`.trim();

  return wrapEmailDoc(inner);
}

async function sendMail({ to, subject, html, cooldownActionKey, cooldownTargetKey }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(t("pollsHubSubscriptions.errors.mailSession"));
  const doReq = async (accessToken) => fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, cooldownActionKey, cooldownTargetKey }),
  });
  let res = await doReq(token);
  if (res.status === 401) {
    const { data: refreshed } = await sb().auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) res = await doReq(freshToken);
  }
  if (!res.ok) throw new Error((await res.text()) || t("pollsHubSubscriptions.errors.mailSend"));
}


export async function sendInviteMail({ to, link, ownerLabel, unsubToken = null, kind = "subscriber", actionKey }) {
  const friend = kind === "friend";
  const subject = friend ? t("contacts.mail.friendTitle", { owner: ownerLabel }) : t("pollsHubSubscriptions.mail.subscriptionTitle", { owner: ownerLabel });
  await sendMail({
    to, subject,
    cooldownActionKey: actionKey || (friend ? "friend:invite" : "poll:resend"),
    cooldownTargetKey: `email:${String(to || "").trim().toLowerCase()}`,
    html: buildMailHtml({
      title: subject,
      subtitle: t("pollsHubSubscriptions.mail.subtitle"),
      body: friend ? t("contacts.mail.friendBody", { owner: ownerLabel }) : t("pollsHubSubscriptions.mail.subscriptionBody", { owner: ownerLabel }),
      actionLabel: friend ? t("contacts.mail.friendAction") : t("pollsHubSubscriptions.mail.subscriptionAction"),
      actionUrl: mailLink(link, { withLang: true }), unsubToken, isRegistered: friend,
    }),
  });
}
