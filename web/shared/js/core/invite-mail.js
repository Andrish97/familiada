// Wspólny dokument i transport wiadomości zaproszeń (E19).
import { sb, SUPABASE_URL } from "./supabase.js?v=v2026-10-13T00230";
import { t, getUiLang } from "../../translation/translation.js?v=v2026-10-13T00230";
import { renderMailDocument } from "./mail-document.js?v=v2026-10-13T00230";
const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;
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

function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl, unsubToken, isRegistered }) {
  const footerLinks = isRegistered
    ? [{ url: mailLink("/account/", { withLang: true }), label: t("pollGo.mailAccountSettingsLink") }]
    : unsubToken ? [{ url: mailLink(`/go/?u=${encodeURIComponent(unsubToken)}`, { withLang: true }), label: t("pollGo.mailUnsubGlobal") }] : [];
  return renderMailDocument({ lang: getUiLang(), title, subtitle, body, actionLabel, actionUrl,
    ignoreNote: t("pollsHubSubscriptions.mail.ignoreNote"),
    linkHint: t("pollsHubSubscriptions.mail.linkHint"), autoNote: t("pollsHubSubscriptions.mail.autoNote"),
    footerText: isRegistered ? t("pollGo.mailAccountSettings") : "", footerLinks });
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
  const payload = await res.json();
  if (!payload?.ok) throw new Error(t("pollsHubSubscriptions.errors.mailSend"));
  return payload.results?.[0]?.queued ?? (Number(payload.queued) > 0);
}


export async function sendInviteMail({ to, link, ownerLabel, unsubToken = null, kind = "subscriber", actionKey, reminder = false }) {
  const friend = kind === "friend";
  const subject = reminder ? t(friend ? "sharingMail.friendReminderSubject" : "sharingMail.subscriberReminderSubject", { owner: ownerLabel }) : friend ? t("contacts.mail.friendTitle", { owner: ownerLabel }) : t("pollsHubSubscriptions.mail.subscriptionTitle", { owner: ownerLabel });
  return sendMail({
    to, subject,
    cooldownActionKey: actionKey || (friend ? "friend:invite" : "poll:resend"),
    cooldownTargetKey: `email:${String(to || "").trim().toLowerCase()}`,
    html: buildMailHtml({
      title: subject,
      subtitle: t("pollsHubSubscriptions.mail.subtitle"),
      body: reminder ? t(friend ? "sharingMail.friendReminderBody" : "sharingMail.subscriberReminderBody", { owner: ownerLabel }) : friend ? t("contacts.mail.friendBody", { owner: ownerLabel }) : t("pollsHubSubscriptions.mail.subscriptionBody", { owner: ownerLabel }),
      actionLabel: friend ? t("contacts.mail.friendAction") : t("pollsHubSubscriptions.mail.subscriptionAction"),
      actionUrl: mailLink(link, { withLang: true }), unsubToken, isRegistered: friend,
    }),
  });
}
