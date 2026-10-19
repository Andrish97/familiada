// Znajomi i subskrybenci: wspólne listy, akcje, zaproszenia i odświeżanie.
import { sb } from "./supabase.js?v=v2026-10-19T09385";
import { initPage } from "./page-init.js?v=v2026-10-19T09385";
import { linkTo, PAGES } from "./nav-map.js?v=v2026-10-19T09385";
import { tabFromUrl, setTab } from "./tabs.js?v=v2026-10-19T09385";
import { toast } from "./toast.js?v=v2026-10-19T09385";
import { confirmModal, alertModal } from "./modal.js?v=v2026-10-19T09385";
import { shareSectionEl } from "./share-sections.js?v=v2026-10-19T09385";
import { createCooldownTicker } from "./cooldown.js?v=v2026-10-19T09385";
import { sendInviteMail } from "./invite-mail.js?v=v2026-10-19T09385";
import { initI18n, t } from "../../translation/translation.js?v=v2026-10-19T09385";
import "./contact-modal.js?v=v2026-10-19T09385";


export async function initContactsPage(pageId) {
  const friends = pageId === "friends";
  const ready = initI18n({ withSwitcher: true }).finally(() => document.documentElement.classList.remove("page-loading"));
  const user = await initPage(pageId, { ready, back: document.getElementById("btnBack") });
  if (!user) return;
  const host = document.getElementById("contactsHost");
  const loadState = document.getElementById("contactsLoadState");
  const loadMessage = document.getElementById("contactsLoadMessage");
  const loadRetry = document.getElementById("contactsLoadRetry");
  const cooldowns = createCooldownTicker();
  let rows = [];
  let inFlight = null;
  let contactsLoaded = false;
  let declinedCollapsed = true;
  const mobile = matchMedia("(max-width: 720px), (max-width: 980px) and (orientation: landscape)");
  const allowedTabs = PAGES[pageId].tabs;
  let activeTab = tabFromUrl(allowedTabs, allowedTabs[0]);
  const tabButtons = [...document.querySelectorAll("[data-contact-tab]")];
  const panels = [...document.querySelectorAll("[data-contact-panel]")];
  function applyTab() {
    for (const button of tabButtons) {
      const active = button.dataset.contactTab === activeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) {
      panel.hidden = mobile.matches && panel.dataset.contactPanel !== activeTab;
      if (mobile.matches) {
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", panel.dataset.contactPanel === "invite" ? "contactsTabInvite" : "contactsTabReceived");
      } else {
        panel.removeAttribute("role");
        panel.removeAttribute("aria-labelledby");
      }
    }
  }
  function selectTab(name) { activeTab = name; setTab(name, allowedTabs[0]); applyTab(); }
  for (const button of tabButtons) {
    button.addEventListener("click", () => selectTab(button.dataset.contactTab));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - allowedTabs.indexOf(activeTab);
      selectTab(allowedTabs[index]); tabButtons[index].focus();
    });
  }
  mobile.addEventListener("change", applyTab);
  applyTab();
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
      if (friends && result?.err === "already") {
        await refresh();
        const key = result.status === "active" ? "alreadyFriend"
          : result.status === "declined" ? (result.direction === "incoming" ? "ownDeclined" : "declined")
          : result.direction === "incoming" ? "incomingPending" : "outgoingPending";
        toast(t(`contacts.errors.${key}`));
        if (result.direction === "incoming" && result.status === "declined") { declinedCollapsed = false; render(); }
        focusRow(result.id);
        return;
      }
      toast(result?.err === "cooldown" ? t("contacts.errors.cooldown", { date: new Date(result.cooldown_until).toLocaleString() })
        : result?.err === "already" ? t("contacts.errors.already") : t("contacts.errors.action"), { kind: "error" });
      console.warn("[contacts] action:", error);
    }
  }
  async function action(row, kind, button) {
    button.dataset.locked = "1";
    button.disabled = true;
    try {
      if (["remove", "cancel", "reject"].includes(kind)) {
        if (!await confirmModal({ text: t(`contacts.confirm.${kind}`) })) return;
      }
      const data = await call(friends ? `friends_${kind}` : kind === "resend" ? "polls_hub_subscriber_resend" : "polls_hub_subscriber_remove", { p_id: row.id });
      if (kind === "resend" && data.to && data.link) {
        const queued = await sendInviteMail({ to: data.to, link: data.link, ownerLabel, unsubToken: data.unsub_token, kind: friends ? "friend" : "subscriber", reminder: true, actionKey: friends ? "friend:resend" : "poll:resend" });
        toast(t(queued ? "contacts.sent" : "control.shareDeviceModal.friendMailDisabled"));
      }
      await refresh();
    } catch (error) { await report(error); }
    finally { delete button.dataset.locked; button.disabled = false; cooldowns.tick(); }
  }
  function rowOf(row) {
    const actions = [];
    const add = (kind, icon, gold = false, iconOnly = false) => actions.push({ key: kind, icon, gold, iconOnly,
      title: t(`contacts.actions.${kind}`), onClick: (_, button) => action(row, kind, button),
      countdown: kind === "resend",
      onMount: kind === "resend" ? ({ rowEl, button, labelEl }) => {
        const key = `contact:${row.id}`;
        cooldowns.bind({ key, labelEl, disableEls: [button],
          onTick: (_, active) => { rowEl.classList.toggle("blocked", active); rowEl.classList.toggle("is-cooling-down", active); } });
        cooldowns.setEndMs(key, Date.parse(row.resend_available_at) || 0);
      } : undefined });
    if (friends && row.direction === "incoming") {
      if (row.status === "declined") add("undo_reject", "undo", false, true);
      else { add("accept", "check", true); add("reject", "cancel"); }
    }
    else if (["pending", "declined"].includes(row.status)) {
      if (row.status === "pending" && row.email_enabled !== false) add("resend", "refresh");
      add(friends ? "cancel" : "remove", "trash", false, true);
    }
    else add("remove", "trash", false, true);
    const state = friends && row.direction === "friend" ? "active" : row.status;
    return { id: row.id, label: friends ? row.label : row.email, compact: true,
      tags: state === "active" ? [] : [{ text: t(`contacts.status.${state}`) }],
      note: friends ? row.email : row.friend_user_id ? t("contacts.accountCreated") : "",
      actions };
  }
  function render() {
    cooldowns.resetBindings();
    const make = (key) => {
      const selected = rows.filter(row => key === "declined" && friends
        ? row.direction === "incoming" && row.status === "declined"
        : (!friends && key === "pending" ? ["pending", "declined"].includes(row.status) : (friends ? row.direction : row.status) === key) && !(friends && key === "incoming" && row.status === "declined"));
      const section = shareSectionEl({ key, title: t(`contacts.sections.${!friends && key === "pending" ? "outgoing" : key}`),
        rows: selected.map(rowOf),
        ...(key === "declined" && friends ? { collapsed: declinedCollapsed, onToggle: value => { declinedCollapsed = value; } } : {}),
        emptyText: t(`contacts.empty.${key}`) });
      // Zachowane znaczniki dla wskazania zaproszenia i testów przepływu.
      section.classList.add("rowsSection--" + key);
      if (key === "declined" && !selected.length) section.hidden = true;
      return section;
    };
    document.getElementById("contactsOutgoing").replaceChildren(make(friends ? "outgoing" : "pending"));
    document.getElementById("contactsReceived").replaceChildren(...(friends ? ["friend", "incoming", "declined"] : ["active"]).map(make));
    const counts = {
      invite: rows.filter(row => friends ? row.direction === "outgoing" && row.status === "pending" : row.status === "pending").length,
      received: rows.filter(row => friends ? row.direction === "incoming" && row.status === "pending" : row.status === "active").length,
    };
    for (const badge of document.querySelectorAll("[data-contact-count]")) {
      badge.textContent = counts[badge.dataset.contactCount] || "";
    }
    applyTab();
  }
  function focusRow(id) {
    const row = host.querySelector(`.shareRow[data-id="${CSS.escape(String(id))}"]`);
    if (row) selectTab(row.closest("[data-contact-panel]").dataset.contactPanel);
    row?.classList.add("rowsFocus");
    row?.scrollIntoView({ block: "nearest" });
  }
  async function refresh() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await call("friend_invites_from_subscriptions");
        const data = await call("contacts_list", { p_kind: friends ? "friends" : "subscribers" });
        rows = Array.isArray(data) ? data : [];
        // Najpierw zbuduj wiersze i podepnij ich akcje; dopiero gotowy widok
        // zastępuje komunikat ładowania.
        render();
        contactsLoaded = true;
        if (loadState) loadState.hidden = true;
        host?.classList.add("skel-step-ready");
      } catch (error) {
        if (!contactsLoaded) {
          if (loadMessage) loadMessage.textContent = t("contacts.load.failed");
          if (loadRetry) loadRetry.hidden = false;
        } else await report(error);
      }
    })();
    try { await inFlight; } finally { inFlight = null; }
  }
  loadRetry?.addEventListener("click", () => {
    if (loadMessage) loadMessage.textContent = t("contacts.load.loading");
    loadRetry.hidden = true;
    void refresh();
  });
  document.getElementById("inviteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (document.getElementById("btnInvite").disabled) return;
    const input = document.getElementById("inviteInput");
    if (!input.value.trim()) return;
    const button = document.getElementById("btnInvite");
    button.disabled = true;
    try {
      const data = await call(friends ? "friends_invite" : "subscribers_invite", friends ? { p_handle: input.value } : { p_email: input.value });
      let mail = null;
      if (friends && data.mail_allowed) mail = { to: data.to, link: `/go/?f=${data.token}`, actionKey: "friend:invite" };
      if (!friends && !data.already) mail = await call("polls_hub_subscriber_resend", { p_id: data.id });
      await refresh();
      let mailSkipped = false;
      if (mail?.to && mail.link) {
        try { mailSkipped = !await sendInviteMail({ ...mail, ownerLabel, unsubToken: mail.unsub_token, kind: friends ? "friend" : "subscriber" }); }
        catch (error) { console.warn("[contacts] mail:", error); toast(t("contacts.mailFailed"), { kind: "error" }); return; }
      }
      input.value = "";
      toast(t(data.already ? "contacts.errors.already" : mailSkipped ? "control.shareDeviceModal.friendMailDisabled" : "contacts.sent"));
    } catch (error) { await report(error); }
    finally { button.disabled = false; }
  });
  window.addEventListener("i18n:lang", render);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cooldowns.stop();
    else { cooldowns.start(); void refresh(); }
  });
  const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 20000);
  window.addEventListener("pagehide", () => { clearInterval(timer); cooldowns.stop(); }, { once: true });
  await refresh();
  cooldowns.start();
  const token = new URLSearchParams(location.search).get("f");
  if (friends && token) {
    try {
      const resolved = await call("poll_go_resolve", { p_token: token });
      if (rows.some(row => row.id === resolved.id && row.direction === "incoming" && row.status === "declined")) {
        declinedCollapsed = false; render();
      }
      focusRow(resolved.id);
    } catch (error) { await report(error); }
  }
}
