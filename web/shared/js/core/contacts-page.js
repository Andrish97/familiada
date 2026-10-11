// Znajomi i subskrybenci: wspólne listy, akcje, zaproszenia i odświeżanie.
import { sb } from "./supabase.js?v=v2026-10-11T09374";
import { initPage } from "./page-init.js?v=v2026-10-11T09374";
import { linkTo } from "./nav-map.js?v=v2026-10-11T09374";
import { toast } from "./toast.js?v=v2026-10-11T09374";
import { confirmModal, alertModal } from "./modal.js?v=v2026-10-11T09374";
import { renderRowSections } from "./share-sections.js?v=v2026-10-11T09374";
import { initListSearch } from "./list-search.js?v=v2026-10-11T09374";
import { sendInviteMail } from "./invite-mail.js?v=v2026-10-11T09374";
import { initI18n, t } from "../../translation/translation.js?v=v2026-10-11T09374";
import "./contact-modal.js?v=v2026-10-11T09374";

export async function initContactsPage(pageId) {
  const friends = pageId === "friends";
  const ready = initI18n({ withSwitcher: true }).finally(() => document.documentElement.classList.remove("page-loading"));
  const user = await initPage(pageId, { ready, back: document.getElementById("btnBack") });
  if (!user) return;
  const host = document.getElementById("contactsHost");
  let rows = [];
  let inFlight = null;
  const ownerLabel = user.user_metadata?.username || user.email || "Familiada";

  async function call(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    if (data?.ok === false) throw Object.assign(new Error(data.err || data.error), { result: data });
    return data;
  }
  async function report(error) {
    const result = error.result;
    const other = result?.err === "has_account" ? "friends" : result?.has_email_only ? "subscribers" : null;
    if (other) {
      const link = document.createElement("a");
      link.className = "btn sm gold";
      link.href = linkTo(other);
      link.textContent = t("contacts.go");
      await alertModal({ text: t(`contacts.errors.${other === "friends" ? "hasAccount" : "emailOnly"}`), body: link });
    } else {
      toast(result?.err === "cooldown" ? t("contacts.errors.cooldown", { date: new Date(result.cooldown_until).toLocaleString() })
        : result?.err === "already" ? t("contacts.errors.already") : t("contacts.errors.action"), { kind: "error" });
      console.warn("[contacts] action:", error);
    }
  }
  async function action(row, kind, button) {
    button.disabled = true;
    try {
      if (["remove", "cancel", "reject"].includes(kind)) {
        if (!await confirmModal({ text: t(`contacts.confirm.${kind}`) })) return;
      }
      const data = await call(friends ? `friends_${kind}` : kind === "resend" ? "polls_hub_subscriber_resend" : "polls_hub_subscriber_remove", { p_id: row.id });
      if (kind === "resend" && data.to && data.link) {
        await sendInviteMail({ to: data.to, link: data.link, ownerLabel, unsubToken: data.unsub_token, kind: friends ? "friend" : "subscriber", actionKey: friends ? "friend:resend" : "poll:resend" });
        toast(t("contacts.sent"));
      }
      await refresh();
    } catch (error) { await report(error); }
    finally { button.disabled = false; }
  }
  function rowOf(row) {
    const actions = [];
    const add = (kind, icon, gold = false, iconOnly = false) => actions.push({ key: kind, icon, gold, iconOnly,
      text: t(`contacts.actions.${kind}`), onClick: (_, button) => action(row, kind, button) });
    if (friends && row.direction === "incoming") { add("accept", "check", true); add("reject", "cancel"); }
    else if (row.status === "pending") { add("resend", "mail"); add(friends ? "cancel" : "remove", "trash", false, true); }
    else add("remove", "trash", false, true);
    return { id: row.id, title: friends ? row.label : row.email, avatar: friends ? row.label : row.email,
      channel: friends ? "friend" : "subscriber", note: friends ? row.email : row.friend_user_id ? t("contacts.accountCreated") : "",
      data: { direction: row.direction || row.status }, actions };
  }
  function render() {
    const sections = friends ? ["incoming", "outgoing", "friend"] : ["pending", "active"];
    renderRowSections(host, sections.map(key => ({ key, title: t(`contacts.sections.${key}`),
      rows: rows.filter(row => (friends ? row.direction : row.status) === key).map(rowOf) })), { emptyText: t(`contacts.${pageId}.empty`) });
  }
  async function refresh() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await call("friend_invites_from_subscriptions");
        const data = await call(friends ? "friends_list" : "subscribers_list");
        rows = Array.isArray(data) ? data : [];
        render();
      } catch (error) { await report(error); }
    })();
    try { await inFlight; } finally { inFlight = null; }
  }
  document.getElementById("btnInvite").addEventListener("click", async () => {
    const input = document.createElement("input");
    input.id = "inviteInput";
    input.className = "inp";
    input.type = friends ? "text" : "email";
    input.placeholder = t(friends ? "contacts.handle" : "contacts.email");
    input.setAttribute("aria-label", input.placeholder);
    const confirmed = await confirmModal({ text: t(friends ? "contacts.handle" : "contacts.email"), body: input,
      initialFocus: input, onReady: ({ okBtn }) => { okBtn.id = "btnInviteOk"; input.addEventListener("keydown", e => { if (e.key === "Enter") okBtn.click(); }); } });
    if (!confirmed || !input.value.trim()) return;
    const button = document.getElementById("btnInvite");
    button.disabled = true;
    try {
      const data = await call(friends ? "friends_invite" : "subscribers_invite", friends ? { p_handle: input.value } : { p_email: input.value });
      let mail = null;
      if (friends && data.mail_allowed) mail = { to: data.to, link: `/go/?f=${data.token}`, actionKey: "friend:invite" };
      if (!friends && !data.already) mail = await call("polls_hub_subscriber_resend", { p_id: data.id });
      await refresh();
      if (mail?.to && mail.link) {
        try { await sendInviteMail({ ...mail, ownerLabel, unsubToken: mail.unsub_token, kind: friends ? "friend" : "subscriber" }); }
        catch (error) { console.warn("[contacts] mail:", error); toast(t("contacts.mailFailed"), { kind: "error" }); return; }
      }
      toast(t(data.already ? "contacts.errors.already" : "contacts.sent"));
    } catch (error) { await report(error); }
    finally { button.disabled = false; }
  });
  initListSearch({ grids: "#contactsHost", tile: ".rowsRow", name: ".rowsTitle" });
  window.addEventListener("i18n:lang", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 20000);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
  await refresh();
  const token = new URLSearchParams(location.search).get("f");
  if (friends && token) {
    try {
      const resolved = await call("poll_go_resolve", { p_token: token });
      host.querySelector(`.rowsRow[data-id="${CSS.escape(resolved.id)}"]`)?.classList.add("rowsFocus");
    } catch (error) { await report(error); }
  }
  document.querySelectorAll("[data-skel-step]").forEach(el => el.classList.add("skel-step-ready"));
}
