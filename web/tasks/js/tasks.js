// tasks.js
// Zadania (E19): co mi ktoś przysłał — ankiety do głosowania, bazy do
// zaakceptowania i aktywne udostępnienia urządzeń. Sekcje: Do zrobienia ·
// Zrobione (zwinięte, tylko ankiety). Filtr rodzaju w adresie (?kind=),
// fokus z adresu: ?t=<token ankiety> / ?b=<token bazy>.
// Dane: RPC tasks_list (migracja 320). Wiersze: share-sections.js.

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-10T15330";
import { toast } from "../../shared/js/core/toast.js?v=v2026-10-10T15330";
import { alertModal, confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-10T15330";
import { getUiLang, initI18n, t } from "../../shared/translation/translation.js?v=v2026-10-10T15330";
import { linkTo } from "../../shared/js/core/nav-map.js?v=v2026-10-10T15330";
import { initPage } from "../../shared/js/core/page-init.js?v=v2026-10-10T15330";
import "../../shared/js/core/contact-modal.js?v=v2026-10-10T15330";
import { renderRowSections } from "../../shared/js/core/share-sections.js?v=v2026-10-10T15330";
import { initListSearch } from "../../shared/js/core/list-search.js?v=v2026-10-10T15330";

const i18nReady = initI18n({ withSwitcher: true }).catch((err) => {
  console.error("[tasks] i18n nieaktywny:", err);
}).finally(() => {
  document.documentElement.classList.remove("page-loading");
});

const $ = (id) => document.getElementById(id);
const host = $("tasksHost");

const qs = new URLSearchParams(location.search);
const focusPollToken = qs.get("t");
const focusBaseToken = qs.get("b");
let focusHandled = false;

let tasks = [];

function fmtDate(value) {
  if (!value) return "";
  try { return new Date(value).toLocaleDateString(getUiLang() || "pl"); } catch { return ""; }
}

const ownerOf = (task) => String(task.owner_label || "").trim() || "—";

function pollVoteHref(task) {
  const page = task.poll_type === "poll_points" ? "/polls/vote/points/" : "/polls/vote/text/";
  return `${page}?t=${encodeURIComponent(task.token)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
}

async function declinePoll(task) {
  const ok = await confirmModal({
    title: t("tasks.declinePoll.title"),
    text: t("tasks.declinePoll.text"),
    okText: t("tasks.declinePoll.ok"),
    cancelText: t("tasks.declinePoll.cancel"),
  });
  if (!ok) return;
  const { data, error } = await sb().rpc("polls_hub_task_decline", { p_task_id: task.id });
  if (error || !data) { toast(t("tasks.errors.decline"), { kind: "error" }); return; }
  await refresh();
}

async function respondBase(task, rpcName, errorKey) {
  const { data, error } = await sb().rpc(rpcName, { p_task_id: task.id });
  if (error || data !== true) {
    await alertModal({ text: t(errorKey) });
  }
  await refresh();
}

function rowOf(task) {
  const owner = t("tasks.from", { owner: ownerOf(task) });
  const base = {
    id: task.id,
    avatar: ownerOf(task),
    data: { kind: task.kind, ...(task.token ? { token: task.token } : {}) },
  };
  if (task.kind === "poll") {
    const type = t(task.poll_type === "poll_points" ? "tasks.pollType.points" : "tasks.pollType.text");
    const done = task.state === "done";
    return {
      ...base,
      title: task.title,
      note: [type, owner, done ? t("tasks.doneAt", { date: fmtDate(task.done_at) }) : t("tasks.received", { date: fmtDate(task.created_at) })].join(" · "),
      actions: done ? [] : [
        { key: "vote", text: t("tasks.actions.vote"), icon: "polls", gold: true, onClick: () => { location.href = pollVoteHref(task); } },
        { key: "decline", text: t("tasks.actions.decline"), icon: "cancel", onClick: () => declinePoll(task) },
      ],
    };
  }
  if (task.kind === "base") {
    const role = t(task.role === "editor" ? "tasks.role.editor" : "tasks.role.viewer");
    return {
      ...base,
      title: task.title,
      note: [owner, role, t("tasks.received", { date: fmtDate(task.created_at) })].join(" · "),
      actions: [
        { key: "accept", text: t("tasks.actions.accept"), icon: "check", gold: true, onClick: () => respondBase(task, "base_share_accept", "tasks.errors.accept") },
        { key: "decline", text: t("tasks.actions.decline"), icon: "cancel", onClick: () => respondBase(task, "base_share_decline", "tasks.errors.baseDecline") },
      ],
    };
  }
  const typeLabel = t(`tasks.deviceType.${task.device_type}`) || task.device_type;
  return {
    ...base,
    title: task.title,
    note: [typeLabel, owner, task.expires_at ? t("tasks.expires", { date: fmtDate(task.expires_at) }) : ""].filter(Boolean).join(" · "),
    actions: [
      { key: "connect", text: t("tasks.actions.connect"), icon: "arrow-right", gold: true, onClick: () => { location.href = linkTo("connectDevice", { share: task.id }); } },
    ],
  };
}

function render() {
  // Bazy: tylko do zaakceptowania (po decyzji wiersz znika); urządzenia: tylko aktywne;
  // „Zrobione” zostaje wyłącznie dla ankiet.
  const todo = tasks.filter((x) => x.state === "todo");
  const done = tasks.filter((x) => x.kind === "poll" && x.state === "done");
  renderRowSections(host, [
    { key: "todo", title: t("tasks.sections.todo"), rows: todo.map(rowOf) },
    { key: "done", title: t("tasks.sections.done"), rows: done.map(rowOf), collapsed: true },
  ], { emptyText: t("tasks.empty") });
}

function focusFromUrl() {
  if (focusHandled) return;
  focusHandled = true;
  const token = focusPollToken || focusBaseToken;
  if (!token) return;
  const kind = focusPollToken ? "poll" : "base";
  const row = host.querySelector(`.rowsRow[data-kind="${kind}"][data-token="${CSS.escape(token)}"]`);
  if (row) {
    const list = row.closest(".rowsList");
    if (list?.hidden) list.parentElement.querySelector(".rowsSectionHead")?.click();
    row.classList.add("rowsFocus");
    row.scrollIntoView({ block: "center" });
  }
  const url = new URL(location.href);
  url.searchParams.delete("t");
  url.searchParams.delete("b");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
}

let inFlight = null;
async function refresh() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data, error } = await sb().rpc("tasks_list", { p_kind: null });
      if (error) throw error;
      tasks = Array.isArray(data) ? data : [];
      render();
      focusFromUrl();
    } catch (e) {
      console.error("[tasks] tasks_list:", e);
      toast(t("tasks.errors.load"), { kind: "error" });
    }
  })();
  try { await inFlight; } finally { inFlight = null; }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await initPage("tasks", { ready: i18nReady, back: $("btnBack") });
  if (!user) return;

  initListSearch({
    grids: "#tasksHost",
    tile: ".rowsRow",
    name: ".rowsTitle",
    filter: {
      param: "kind",
      attr: "kind",
      allKey: "tasks.filter.all",
      ariaKey: "tasks.filter.aria",
      options: [
        { value: "poll", labelKey: "tasks.filter.poll" },
        { value: "base", labelKey: "tasks.filter.base" },
        { value: "device", labelKey: "tasks.filter.device" },
      ],
    },
  });

  window.addEventListener("i18n:lang", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 20000);

  await refresh();
  document.querySelectorAll("[data-skel-step]").forEach((el) => el.classList.add("skel-step-ready"));
});
