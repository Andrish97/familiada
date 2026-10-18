// Maile z zaproszeniem do ankiety / przypomnieniem — wspólne dla strony ankiety
// (i, do czasu usunięcia, Centrum ankiet). Baza rezerwuje cooldown "poll:share"
// przed wysyłką; tu budujemy treść, wysyłamy i oznaczamy zaproszenia jako wysłane.
import { sb, SUPABASE_URL } from "./supabase.js?v=v2026-10-18T17232";
import { t, getUiLang } from "../../translation/translation.js?v=v2026-10-18T17232";

import { renderMailDocument } from "./mail-document.js?v=v2026-10-18T17232";
const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

export function mailLink(path) {
  try {
    const url = new URL(path, location.origin);
    url.searchParams.set("lang", getUiLang() || "pl");
    return url.href;
  } catch {
    return path;
  }
}

export function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl, subToken, unsubToken, ownerLabel, isRegistered }) {
  const footerLinks = [];
  if (isRegistered) footerLinks.push({ url: mailLink("/account/"), label: t("pollGo.mailAccountSettingsLink") });
  else {
    if (subToken) footerLinks.push({ url: mailLink(`/go/?s=${encodeURIComponent(subToken)}&action=unsub`), label: t("pollGo.mailUnsubOwner", { owner: ownerLabel || "" }) });
    if (unsubToken) footerLinks.push({ url: mailLink(`/go/?u=${encodeURIComponent(unsubToken)}`), label: t("pollGo.mailUnsubGlobal") });
  }
  return renderMailDocument({ lang: getUiLang(), title, subtitle, body, actionLabel, actionUrl,
    ignoreNote: t("pollsHubPolls.mail.ignoreNote"), linkHint: t("pollsHubPolls.mail.linkHint"),
    autoNote: t("pollsHubPolls.mail.autoNote"),
    footerText: isRegistered ? t("pollGo.mailAccountSettings") : "", footerLinks });
}

export async function sendMailBatch(items) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(t("pollsHubPolls.errors.mailSession"));

  const doReq = async (accessToken) => fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  let res = await doReq(token);
  if (res.status === 401) {
    const { data: refreshed } = await sb().auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) res = await doReq(freshToken);
  }

  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || t("pollsHubPolls.errors.mailSend"));
  }

  // send-mail jest kolejką: { ok:true, queued:N } albo (starsza wersja) wyniki per adres.
  if (Array.isArray(payload.results)) return payload;

  const queued = Number(payload.queued);
  if (!Number.isInteger(queued) || queued !== items.length) {
    throw new Error(payload?.error || t("pollsHubPolls.errors.mailSend"));
  }
  return {
    ...payload,
    results: items.map((item) => ({ to: item.to, ok: true, queued: true })),
  };
}

/**
 * Wysyła maile dla elementów `mail` zwróconych przez poll_share_send /
 * poll_share_remind i oznacza zaproszenia jako wysłane.
 * Zwraca { total, sent, failed }. Błąd wysyłki nie rzuca — liczy się w `failed`.
 */
export async function sendPollInviteMails({ mailItems, pollName, currentUser, reminder = false }) {
  const list = (Array.isArray(mailItems) ? mailItems : []).filter((it) => it?.to && it?.link);
  if (!list.length) return { total: 0, sent: 0, failed: 0, skipped: 0 };

  const ownerLabel = currentUser?.username || currentUser?.email || t("pollsHubPolls.ownerFallback");
  const name = pollName || t("pollsHubPolls.pollFallback");
  const safeName = pollName ? t("pollsHubPolls.pollNameLabel", { name: pollName }) : t("pollsHubPolls.pollFallback");

  // sub_token + unsub_token dla odbiorców bez konta (stopka z wypisaniem)
  const unsubInfoByEmail = new Map();
  try {
    const { data: unsubRows } = await sb().rpc("get_unsub_info_for_task_emails", {
      p_owner_id: currentUser.id,
      p_emails: list.map((it) => String(it.to).toLowerCase()),
    });
    for (const row of unsubRows || []) {
      if (row.email) unsubInfoByEmail.set(String(row.email).toLowerCase(), row);
    }
  } catch { /* nieblokujące — mail pójdzie bez linków wypisania */ }

  const emailToTaskId = new Map();
  const items = list.map((item) => {
    const emailKey = String(item.to).toLowerCase();
    emailToTaskId.set(emailKey, item.task_id || null);
    const unsubInfo = unsubInfoByEmail.get(emailKey);
    return {
      to: item.to,
      subject: reminder
        ? t("polls.share.mailReminderSubject", { name })
        : t("pollsHubPolls.mail.taskSubject", { name }),
      html: buildMailHtml({
        title: reminder ? t("polls.share.mailReminderTitle") : t("pollsHubPolls.mail.taskTitle"),
        subtitle: t("pollsHubPolls.mail.subtitle"),
        body: t(reminder ? "sharingMail.pollReminderBody" : "pollsHubPolls.mail.taskBody", { owner: ownerLabel, name: safeName }),
        actionLabel: t("pollsHubPolls.mail.taskAction"),
        actionUrl: mailLink(item.link),
        subToken: unsubInfo?.sub_token || null,
        unsubToken: unsubInfo?.unsub_token || null,
        ownerLabel,
        isRegistered: !unsubInfo,
      }),
      // cooldown poll:share rezerwuje baza przed wysyłką (trigger na mail_queue
      // sprawdza tylko akcję + odbiorcę)
      cooldownActionKey: "poll:share",
      cooldownTargetKey: `email:${emailKey}`,
    };
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const sentTaskIds = [];
  try {
    const out = await sendMailBatch(items);
    for (const r of Array.isArray(out?.results) ? out.results : []) {
      const emailKey = String(r?.to || "").toLowerCase();
      if (r?.ok && r?.queued !== false) {
        sent += 1;
        const tid = emailToTaskId.get(emailKey);
        if (tid) sentTaskIds.push(tid);
      } else if (r?.skipped) {
        skipped += 1;
      } else if (emailKey) {
        failed += 1;
      }
    }
  } catch {
    failed = items.length;
  }

  if (sentTaskIds.length) {
    try { await sb().rpc("polls_hub_tasks_mark_emailed", { p_task_ids: sentTaskIds }); } catch { /* nieblokujące */ }
  }
  return { total: items.length, sent, failed, skipped };
}
