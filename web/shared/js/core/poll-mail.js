// Maile z zaproszeniem do ankiety / przypomnieniem — wspólne dla strony ankiety
// (i, do czasu usunięcia, Centrum ankiet). Baza rezerwuje cooldown "poll:share"
// przed wysyłką; tu budujemy treść, wysyłamy i oznaczamy zaproszenia jako wysłane.
import { sb, SUPABASE_URL } from "./supabase.js?v=v2026-10-09T22502";
import { t } from "../../translation/translation.js?v=v2026-10-09T22502";

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

export function mailLink(path) {
  try {
    return new URL(path, location.origin).href;
  } catch {
    return path;
  }
}

function wrapEmailDoc(innerHtml) {
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

export function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl, subToken, unsubToken, ownerLabel: ownerLabelUnsub, isRegistered }) {
  let footerExtra = "";
  if (isRegistered) {
    const accountUrl = new URL("/account/", location.origin).href;
    footerExtra = `<div style="margin-top:10px;font-size:11px;opacity:.55;text-align:center;">
      ${t("pollGo.mailAccountSettings")}
      <a href="${accountUrl}" style="color:#ffeaa6;text-decoration:underline;">${t("pollGo.mailAccountSettingsLink")}</a>
    </div>`;
  } else if (subToken || unsubToken) {
    const parts = [];
    if (subToken) {
      const unsubOwnerUrl = new URL(`/go/?s=${encodeURIComponent(subToken)}&action=unsub`, location.origin).href;
      parts.push(`<a href="${unsubOwnerUrl}" style="color:#ffeaa6;opacity:.7;text-decoration:underline;">${t("pollGo.mailUnsubOwner", { owner: ownerLabelUnsub || "" })}</a>`);
    }
    if (unsubToken) {
      const globalUrl = new URL(`/go/?u=${encodeURIComponent(unsubToken)}`, location.origin).href;
      parts.push(`<a href="${globalUrl}" style="color:#ffeaa6;opacity:.7;text-decoration:underline;">${t("pollGo.mailUnsubGlobal")}</a>`);
    }
    if (parts.length) {
      footerExtra = `<div style="margin-top:10px;font-size:11px;opacity:.55;text-align:center;">${parts.join(" &nbsp;·&nbsp; ")}</div>`;
    }
  }

  const inner = `
    <div style="margin:0;padding:0;background:#050914;color:#ffffff;">
      <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;background:#050914;">
        <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
          <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
          <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${subtitle}</div>
        </div>

        <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
          <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${title}</div>
          <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${body}</div>

          <div style="margin:16px 0;">
            <a href="${actionUrl}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:#2a2b1a;background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;text-transform:uppercase;">${actionLabel}</a>
          </div>

          <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t("pollsHubPolls.mail.ignoreNote")}</div>

          <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
            ${t("pollsHubPolls.mail.linkHint")}
            <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">${actionUrl}</div>
          </div>
        </div>

        <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t("pollsHubPolls.mail.autoNote")}</div>
        ${footerExtra}
      </div>
    </div>
  `.trim();

  return wrapEmailDoc(inner);
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
 * Wysyła maile dla elementów `mail` zwróconych przez polls_hub_share_poll /
 * poll_share_remind i oznacza zaproszenia jako wysłane.
 * Zwraca { total, sent, failed }. Błąd wysyłki nie rzuca — liczy się w `failed`.
 */
export async function sendPollInviteMails({ mailItems, pollName, currentUser, reminder = false }) {
  const list = (Array.isArray(mailItems) ? mailItems : []).filter((it) => it?.to && it?.link);
  if (!list.length) return { total: 0, sent: 0, failed: 0 };

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
        body: t("pollsHubPolls.mail.taskBody", { owner: ownerLabel, name: safeName }),
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
  const sentTaskIds = [];
  try {
    const out = await sendMailBatch(items);
    for (const r of Array.isArray(out?.results) ? out.results : []) {
      const emailKey = String(r?.to || "").toLowerCase();
      if (r?.ok) {
        sent += 1;
        const tid = emailToTaskId.get(emailKey);
        if (tid) sentTaskIds.push(tid);
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
  return { total: items.length, sent, failed };
}
