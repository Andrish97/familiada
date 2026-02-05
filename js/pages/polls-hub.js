// familiada/js/pages/polls-hub.js
// CENTRUM SONDAŻY (dla zalogowanych)

import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

/* ========= DOM ========= */
const $ = (id) => document.getElementById(id);

const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

const chipPolls = $("chipPolls");
const chipTasks = $("chipTasks");
const chipSubs = $("chipSubs");
const chipSubsToMe = $("chipSubsToMe");

const listPolls = $("listPolls");
const listTasks = $("listTasks");
const listSubs = $("listSubs");
const listSubsToMe = $("listSubsToMe");

const emptyPolls = $("emptyPolls");
const emptyTasks = $("emptyTasks");
const emptySubs = $("emptySubs");
const emptySubsToMe = $("emptySubsToMe");

const btnPollsRefresh = $("btnPollsRefresh");
const btnTasksRefresh = $("btnTasksRefresh");
const btnSubsRefresh = $("btnSubsRefresh");
const btnSubsToMeRefresh = $("btnSubsToMeRefresh");

const pollsActiveBtn = $("pollsActiveBtn");
const pollsArchBtn = $("pollsArchBtn");

const tasksActiveBtn = $("tasksActiveBtn");
const tasksArchBtn = $("tasksArchBtn");

const subsActiveBtn = $("subsActiveBtn");
const subsArchBtn = $("subsArchBtn");

const subsToMeActiveBtn = $("subsToMeActiveBtn");
const subsToMeArchBtn = $("subsToMeArchBtn");

const btnAddSubscriber = $("btnAddSubscriber");

/* ==== Modals ==== */
const mAddSub = $("mAddSub");
const mAddSubClose = $("mAddSubClose");
const mAddSubInput = $("mAddSubInput");
const mAddSubSend = $("mAddSubSend");
const mAddSubMsg = $("mAddSubMsg");

const mShare = $("mShare");
const mShareClose = $("mShareClose");
const mShareModeAnon = $("mShareModeAnon");
const mShareModeSubs = $("mShareModeSubs");
const mShareModeMixed = $("mShareModeMixed");
const mShareAnonBox = $("mShareAnonBox");
const mShareSubsBox = $("mShareSubsBox");
const mShareAnonLink = $("mShareAnonLink");
const mShareCopyAnon = $("mShareCopyAnon");
const mShareOpenAnon = $("mShareOpenAnon");
const mShareSubsList = $("mShareSubsList");
const mShareMsg = $("mShareMsg");
const mShareSave = $("mShareSave");

/* ========= State ========= */
let currentUser = null;

const view = {
  polls: "active",
  tasks: "active",
  subs: "active",
  subsToMe: "active",
};

// share modal state
const shareState = {
  game_id: null,
  poll_type: null,
  share_key_poll: null,
  mode: "anon", // anon|subs|mixed
  selectedSubIds: new Set(), // poll_subscriptions.id
  subRows: [], // list_my_subscribers rows
};

/* ========= Utils ========= */
function esc(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
}
function show(el, on){ if (el) el.style.display = on ? "" : "none"; }
function setChip(el, n){ if (el) el.textContent = String(Number(n)||0); }

function isActiveStatus(s){
  const v = String(s||"").toLowerCase();
  return v === "pending" || v === "opened" || v === "active";
}
function isArchiveStatus(s){ return !isActiveStatus(s); }

function statusBadgeClass(s){
  const v = String(s||"").toLowerCase();
  if (v === "done" || v === "active") return "ok";
  if (v === "pending" || v === "opened") return "warn";
  if (v === "declined" || v === "cancelled") return "bad";
  return "dim";
}

function renderEmpty(listEl, emptyEl, hasItems){
  show(emptyEl, !hasItems);
  if (listEl) listEl.style.opacity = "1";
}

async function rpcOne(name, args){
  console.log("[polls_hub] rpc ->", name, args || {});
  const { data, error } = await sb().rpc(name, args || {});
  console.log("[polls_hub] rpc <-", name, { error, data });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function rpcList(name, args){
  console.log("[polls_hub] rpc ->", name, args || {});
  const { data, error } = await sb().rpc(name, args || {});
  console.log("[polls_hub] rpc <-", name, { error, data });
  if (error) throw error;
  return Array.isArray(data) ? data : (data ? [data] : []);
}

function pollTypeToVotingPage(pollType){
  const t = String(pollType||"").toLowerCase();
  if (t === "poll_text" || t === "text") return "poll-text.html";
  if (t === "poll_points" || t === "points") return "poll-points.html";
  return "";
}

function buildAnonVoteLink(pollType, shareKey){
  const page = pollTypeToVotingPage(pollType);
  const key = String(shareKey||"").trim();
  if (!page || !key) return "";
  const url = new URL(page, location.href);
  url.searchParams.set("key", key);
  return url.toString();
}

async function copyToClipboardOrPrompt(text){
  const v = String(text||"");
  if (!v) return false;
  try {
    await navigator.clipboard.writeText(v);
    return true;
  } catch {
    prompt("Skopiuj link:", v);
    return true;
  }
}

function modalMsg(el, text){
  if (!el) return;
  if (!text){
    show(el, false);
    el.textContent = "";
    return;
  }
  el.textContent = String(text);
  show(el, true);
}

function openModal(el){
  modalMsg(mAddSubMsg, "");
  modalMsg(mShareMsg, "");
  show(el, true);
}
function closeModal(el){ show(el, false); }

/* ========= Email via Edge Function =========
   Zakładam, że masz funkcję w Supabase: /functions/v1/send-mail
   Body: {to, subject, html}
*/
async function sendMail({to, subject, html}){
  const { data: sess } = await sb().auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Brak sesji (JWT) do wysyłki maila.");

  const url = new URL("/functions/v1/send-mail", location.origin);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ to, subject, html }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`send-mail failed (${res.status}): ${txt}`);
  try { return JSON.parse(txt); } catch { return { ok: true }; }
}

function emailTemplateSubInvite({ownerLabel, goUrl}){
  const safeOwner = esc(ownerLabel || "Familiada");
  const safeUrl = esc(goUrl || "#");
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4;color:#111">
    <h2 style="margin:0 0 12px">Zaproszenie do subskrypcji</h2>
    <p style="margin:0 0 10px">
      Użytkownik <b>${safeOwner}</b> zaprasza Cię do subskrypcji w Familiada.
    </p>
    <p style="margin:0 0 14px">
      Kliknij, aby zaakceptować lub odrzucić zaproszenie:
    </p>
    <p style="margin:0 0 18px">
      <a href="${safeUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#2b6cff;color:#fff;text-decoration:none">
        Otwórz zaproszenie
      </a>
    </p>
    <p style="margin:0;opacity:.75;font-size:12px">
      Jeśli masz konto, po zalogowaniu trafisz do Centrum Sondaży.
    </p>
  </div>`;
}

function emailTemplateTaskInvite({ownerLabel, pollName, goUrl}){
  const safeOwner = esc(ownerLabel || "Familiada");
  const safePoll = esc(pollName || "Sondaż");
  const safeUrl = esc(goUrl || "#");
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.4;color:#111">
    <h2 style="margin:0 0 12px">Zaproszenie do udziału w sondażu</h2>
    <p style="margin:0 0 10px">
      Użytkownik <b>${safeOwner}</b> zaprasza Cię do sondażu: <b>${safePoll}</b>.
    </p>
    <p style="margin:0 0 18px">
      <a href="${safeUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#16a34a;color:#fff;text-decoration:none">
        Otwórz sondaż
      </a>
    </p>
    <p style="margin:0;opacity:.75;font-size:12px">
      Po oddaniu głosu (jeśli jesteś zalogowany) wrócisz do Centrum Sondaży.
    </p>
  </div>`;
}

/* ========= Render row ========= */
function renderRow({ title, status, meta = [], rightHtml = "", onDblClick = null } = {}){
  const st = String(status||"—");
  const stCls = statusBadgeClass(status);
  const metaHtml = [
    `<span class="badge ${stCls}">status: ${esc(st)}</span>`,
    ...meta.map(m => `<span class="badge dim">${esc(m)}</span>`)
  ].join(" ");

  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `
    <div class="rowMain">
      <div class="rowTitle">${esc(title||"—")}</div>
      <div class="rowMeta">${metaHtml}</div>
    </div>
    <div class="rowActions">${rightHtml || ""}</div>
  `;

  if (typeof onDblClick === "function"){
    el.addEventListener("dblclick", onDblClick);
  }
  return el;
}

/* ========= Actions ========= */
async function actSubscriberRemove(sub_id){
  return await rpcOne("polls_hub_subscriber_remove", { p_id: sub_id });
}
async function actSubscriberResend(sub_id){
  return await rpcOne("polls_hub_subscriber_resend", { p_id: sub_id });
}
async function actSubscriptionAccept(id){
  return await rpcOne("polls_hub_subscription_accept", { p_id: id });
}
async function actSubscriptionReject(id){
  return await rpcOne("polls_hub_subscription_reject", { p_id: id });
}
async function actSubscriptionCancel(id){
  return await rpcOne("polls_hub_subscription_cancel", { p_id: id });
}
async function actSharePoll(game_id, mode, sub_ids){
  return await rpcOne("polls_hub_share_poll", { p_game_id: game_id, p_mode: mode, p_sub_ids: sub_ids });
}
async function actMarkTasksEmailed(task_ids){
  return await rpcOne("polls_hub_tasks_mark_emailed", { p_task_ids: task_ids });
}

/* ========= Refresh: Polls ========= */
async function refreshPolls(){
  const rows = await rpcList("polls_hub_list_polls");

  const filtered = rows.filter((r) => {
    const arch = !!r?.is_archived;
    return view.polls === "active" ? !arch : arch;
  });

  listPolls.innerHTML = "";
  setChip(chipPolls, filtered.length);
  renderEmpty(listPolls, emptyPolls, filtered.length > 0);

  for (const r of filtered){
    const poll_state = String(r?.poll_state || "draft").toLowerCase();
    const canOpen = poll_state !== "draft";
    const canShare = poll_state === "open" || poll_state === "closed";

    const meta = [
      `typ: ${r?.poll_type || "—"}`,
      `pyt.: ${Number(r?.sessions_total || 0)}`,
      `zadania: ${Number(r?.tasks_active || 0)} aktywne / ${Number(r?.tasks_done || 0)} done`,
      `anon: ${Number(r?.anon_votes || 0)}`
    ];

    const rightHtml = `
      ${canShare ? `<button class="btn sm" data-share type="button">Udostępnij</button>` : ``}
      ${canOpen ? `<button class="btn sm" data-open type="button">Otwórz</button>` :
        `<button class="btn sm" data-open type="button" disabled title="Dokończ tworzenie gry w Moje gry">Szkic</button>`
      }
    `;

    const el = renderRow({
      title: r?.name || "—",
      status: r?.poll_state || "draft",
      meta,
      rightHtml,
      onDblClick: async () => {
        if (!canOpen) return;
        location.href = `polls.html?id=${encodeURIComponent(r.game_id)}`;
      }
    });

    el.querySelector("[data-open]")?.addEventListener("click", () => {
      if (!canOpen) return;
      location.href = `polls.html?id=${encodeURIComponent(r.game_id)}`;
    });

    el.querySelector("[data-share]")?.addEventListener("click", async () => {
      await openShareModal(r);
    });

    listPolls.appendChild(el);
  }
}

/* ========= Refresh: Tasks ========= */
async function refreshTasks(){
  const rows = await rpcList("polls_hub_list_tasks");

  const filtered = rows.filter((r) => {
    const arch = !!r?.is_archived;
    return view.tasks === "active" ? !arch : arch;
  });

  listTasks.innerHTML = "";
  setChip(chipTasks, filtered.length);
  renderEmpty(listTasks, emptyTasks, filtered.length > 0);

  for (const r of filtered){
    const pollType = r?.poll_type;
    const gameId = r?.game_id;

    const meta = [
      `utw.: ${String(r?.created_at||"").slice(0,10)}`,
      `typ: ${pollType}`
    ];

    const canVote = !!(pollType && gameId && r?.go_url);

    const rightHtml = `
      <button class="btn sm" data-vote type="button"${canVote ? "" : " disabled"}>Głosuj</button>
      <button class="btn sm" data-decline type="button">Odrzuć</button>
    `;

    const el = renderRow({
      title: r?.game_name || "Sondaż",
      status: r?.status || "pending",
      meta,
      rightHtml,
      onDblClick: async () => {
        if (!canVote) return;
        location.href = r.go_url;
      }
    });

    el.querySelector("[data-vote]")?.addEventListener("click", () => {
      if (!canVote) return;
      location.href = r.go_url;
    });

    el.querySelector("[data-decline]")?.addEventListener("click", async () => {
      if (!confirm("Odrzucić to zadanie?")) return;
      // masz już polls_hub_task_decline w DB (wcześniej)
      const { error } = await sb().rpc("polls_hub_task_decline", { p_token: r?.token });
      if (error) alert("Nie udało się odrzucić zadania.");
      await refreshTasks();
    });

    listTasks.appendChild(el);
  }
}

/* ========= Refresh: My subscriptions ========= */
async function refreshSubs(){
  const rows = await rpcList("polls_hub_list_my_subscriptions");

  const filtered = rows.filter((r) => {
    const arch = !!r?.is_expired; // pending > 5d traktujemy jak arch
    return view.subs === "active" ? !arch : arch;
  });

  listSubs.innerHTML = "";
  setChip(chipSubs, filtered.length);
  renderEmpty(listSubs, emptySubs, filtered.length > 0);

  for (const r of filtered){
    const status = String(r?.status||"").toLowerCase();
    const meta = [`utw.: ${String(r?.created_at||"").slice(0,10)}`];

    const canAccept = status === "pending";
    const rightHtml = `
      ${canAccept ? `<button class="btn sm" data-acc type="button">Akceptuj</button>` : ``}
      <button class="btn sm" data-x type="button">✕</button>
    `;

    const el = renderRow({
      title: r?.owner_label || "—",
      status,
      meta,
      rightHtml
    });

    el.querySelector("[data-acc]")?.addEventListener("click", async () => {
      const out = await actSubscriptionAccept(r.sub_id);
      if (!out?.ok) alert(out?.error || "Nie udało się zaakceptować.");
      await refreshSubs();
    });

    el.querySelector("[data-x]")?.addEventListener("click", async () => {
      if (status === "pending"){
        if (!confirm("Odrzucić zaproszenie?")) return;
        const out = await actSubscriptionReject(r.sub_id);
        if (!out?.ok) alert(out?.error || "Nie udało się odrzucić.");
      } else {
        if (!confirm("Anulować subskrypcję?")) return;
        const out = await actSubscriptionCancel(r.sub_id);
        if (!out?.ok) alert(out?.error || "Nie udało się anulować.");
      }
      await refreshSubs();
    });

    listSubs.appendChild(el);
  }
}

/* ========= Refresh: My subscribers ========= */
async function refreshSubsToMe(){
  const rows = await rpcList("polls_hub_list_my_subscribers");

  const filtered = rows.filter((r) => {
    const expired = !!r?.is_expired;
    return view.subsToMe === "active" ? !expired : expired;
  });

  listSubsToMe.innerHTML = "";
  setChip(chipSubsToMe, filtered.length);
  renderEmpty(listSubsToMe, emptySubsToMe, filtered.length > 0);

  for (const r of filtered){
    const status = String(r?.status||"").toLowerCase();
    const meta = [
      `utw.: ${String(r?.created_at||"").slice(0,10)}`,
      r?.subscriber_email ? `email: ${r.subscriber_email}` : ""
    ].filter(Boolean);

    const canResend = status === "pending" && !!r?.subscriber_email;
    const rightHtml = `
      ${canResend ? `<button class="btn sm" data-resend type="button">↻</button>` : ``}
      <button class="btn sm" data-x type="button">✕</button>
    `;

    const el = renderRow({
      title: r?.subscriber_label || "—",
      status,
      meta,
      rightHtml
    });

    el.querySelector("[data-x]")?.addEventListener("click", async () => {
      if (!confirm(status === "active" ? "Usunąć subskrybenta?" : "Anulować zaproszenie?")) return;
      const out = await actSubscriberRemove(r.sub_id);
      if (!out?.ok) alert(out?.error || "Nie udało się.");
      await refreshSubsToMe();
    });

    el.querySelector("[data-resend]")?.addEventListener("click", async () => {
      const out = await actSubscriberResend(r.sub_id);
      if (!out?.ok) { alert(out?.error || "Nie udało się."); return; }

      try {
        const html = emailTemplateSubInvite({ ownerLabel: currentUser?.user?.email, goUrl: out.link });
        await sendMail({ to: out.to, subject: "Familiada — zaproszenie do subskrypcji", html });
        alert("Wysłano ponownie ✅");
      } catch (e) {
        alert(String(e?.message || e));
      }
    });

    listSubsToMe.appendChild(el);
  }
}

/* ========= Modal: Add subscriber ========= */
function wireAddSubscriberModal(){
  btnAddSubscriber?.addEventListener("click", () => {
    mAddSubInput.value = "";
    modalMsg(mAddSubMsg, "");
    openModal(mAddSub);
    setTimeout(() => mAddSubInput?.focus(), 50);
  });

  mAddSubClose?.addEventListener("click", () => closeModal(mAddSub));
  mAddSub?.addEventListener("click", (e) => { if (e.target === mAddSub) closeModal(mAddSub); });

  mAddSubSend?.addEventListener("click", async () => {
    const v = String(mAddSubInput.value||"").trim();
    if (!v) return;

    mAddSubSend.disabled = true;
    modalMsg(mAddSubMsg, "Wysyłam…");

    try {
      const out = await rpcOne("polls_hub_subscription_invite_a", { p_handle: v });
      if (!out?.ok) throw new Error(out?.error || "invite failed");

      // wysyłamy mail zawsze, jeśli mamy "to"
      if (out?.to){
        const html = emailTemplateSubInvite({ ownerLabel: currentUser?.user?.email, goUrl: out.go_url });
        await sendMail({ to: out.to, subject: "Familiada — zaproszenie do subskrypcji", html });
      }

      modalMsg(mAddSubMsg, out.already ? "Zaproszenie już istnieje (pending/active)." : "Zaproszenie wysłane ✅");
      await refreshSubsToMe();
    } catch (e) {
      modalMsg(mAddSubMsg, String(e?.message || e));
    } finally {
      mAddSubSend.disabled = false;
    }
  });
}

/* ========= Modal: Share ========= */
function setShareMode(mode){
  shareState.mode = mode;

  mShareModeAnon?.classList.toggle("on", mode === "anon");
  mShareModeSubs?.classList.toggle("on", mode === "subs");
  mShareModeMixed?.classList.toggle("on", mode === "mixed");

  show(mShareAnonBox, mode === "anon" || mode === "mixed");
  show(mShareSubsBox, mode === "subs" || mode === "mixed");
}

function renderShareSubs(){
  mShareSubsList.innerHTML = "";

  for (const r of shareState.subRows){
    const id = r.sub_id;
    const label = r.subscriber_label || "—";
    const status = String(r.status||"").toLowerCase();

    const row = document.createElement("div");
    row.className = "subPickRow";
    const checked = shareState.selectedSubIds.has(id);

    row.innerHTML = `
      <div class="subPickLeft">
        <input class="chk" type="checkbox" ${checked ? "checked" : ""} data-id="${esc(id)}"/>
        <div style="min-width:0">
          <div class="subPickLabel">${esc(label)}</div>
          <div class="subPickMeta">status: ${esc(status)}</div>
        </div>
      </div>
      <div class="badge ${statusBadgeClass(status)}">${esc(status)}</div>
    `;

    row.querySelector("input[type=checkbox]")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      if (on) shareState.selectedSubIds.add(id);
      else shareState.selectedSubIds.delete(id);
    });

    mShareSubsList.appendChild(row);
  }
}

async function openShareModal(pollRow){
  shareState.game_id = pollRow.game_id;
  shareState.poll_type = pollRow.poll_type;
  shareState.share_key_poll = pollRow.share_key_poll || pollRow.share_key; // jeśli zwracasz
  shareState.selectedSubIds = new Set();

  // mode z DB
  const mode = String(pollRow.poll_share_mode || "anon").toLowerCase();
  setShareMode(["anon","subs","mixed"].includes(mode) ? mode : "anon");

  // anon link
  mShareAnonLink.value = buildAnonVoteLink(shareState.poll_type, shareState.share_key_poll) || "";

  // load subscribers
  shareState.subRows = await rpcList("polls_hub_list_my_subscribers");
  // zaznaczamy “aktywnych” domyślnie tylko jeśli tryb subs/mixed? nie — zostawiamy puste, bo źródłem jest tasks.
  // Jeżeli chcesz “odczytać current selection” z zadań per poll – dopiszemy RPC poll_share_state (następny krok).
  renderShareSubs();

  modalMsg(mShareMsg, "");
  openModal(mShare);
}

function wireShareModal(){
  mShareClose?.addEventListener("click", () => closeModal(mShare));
  mShare?.addEventListener("click", (e) => { if (e.target === mShare) closeModal(mShare); });

  mShareModeAnon?.addEventListener("click", () => setShareMode("anon"));
  mShareModeSubs?.addEventListener("click", () => setShareMode("subs"));
  mShareModeMixed?.addEventListener("click", () => setShareMode("mixed"));

  mShareCopyAnon?.addEventListener("click", async () => {
    const ok = await copyToClipboardOrPrompt(mShareAnonLink.value);
    modalMsg(mShareMsg, ok ? "Skopiowano ✅" : "Nie udało się skopiować.");
  });

  mShareOpenAnon?.addEventListener("click", () => {
    const url = mShareAnonLink.value;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  mShareSave?.addEventListener("click", async () => {
    if (!shareState.game_id) return;

    mShareSave.disabled = true;
    modalMsg(mShareMsg, "Zapisuję…");

    try {
      const subIds = Array.from(shareState.selectedSubIds);
      const out = await actSharePoll(shareState.game_id, shareState.mode, subIds);
      if (!out?.ok) throw new Error(out?.error || "share failed");

      // wyślij maile dla nowych tasków (mail[] zawiera {task_id,to,link})
      const mail = Array.isArray(out.mail) ? out.mail : [];
      const sentTaskIds = [];

      for (const m of mail){
        if (!m?.to || !m?.link) continue;
        const html = emailTemplateTaskInvite({
          ownerLabel: currentUser?.user?.email,
          pollName: "(Sondaż)",
          goUrl: m.link
        });
        await sendMail({ to: m.to, subject: "Familiada — zaproszenie do sondażu", html });
        if (m.task_id) sentTaskIds.push(m.task_id);
      }

      if (sentTaskIds.length){
        await actMarkTasksEmailed(sentTaskIds);
      }

      modalMsg(mShareMsg, `Zapisano ✅ (created: ${out.created}, cancelled: ${out.cancelled})`);
      await refreshPolls();
      await refreshTasks();
    } catch (e) {
      modalMsg(mShareMsg, String(e?.message || e));
    } finally {
      mShareSave.disabled = false;
    }
  });
}

/* ========= Seg toggles ========= */
function setSeg(aBtn, bBtn, mode){
  aBtn?.classList.toggle("on", mode === "active");
  bBtn?.classList.toggle("on", mode === "archive");
}

function wireSeg(){
  pollsActiveBtn?.addEventListener("click", async () => {
    view.polls = "active";
    setSeg(pollsActiveBtn, pollsArchBtn, "active");
    await refreshPolls();
  });
  pollsArchBtn?.addEventListener("click", async () => {
    view.polls = "archive";
    setSeg(pollsActiveBtn, pollsArchBtn, "archive");
    await refreshPolls();
  });

  tasksActiveBtn?.addEventListener("click", async () => {
    view.tasks = "active";
    setSeg(tasksActiveBtn, tasksArchBtn, "active");
    await refreshTasks();
  });
  tasksArchBtn?.addEventListener("click", async () => {
    view.tasks = "archive";
    setSeg(tasksActiveBtn, tasksArchBtn, "archive");
    await refreshTasks();
  });

  subsActiveBtn?.addEventListener("click", async () => {
    view.subs = "active";
    setSeg(subsActiveBtn, subsArchBtn, "active");
    await refreshSubs();
  });
  subsArchBtn?.addEventListener("click", async () => {
    view.subs = "archive";
    setSeg(subsActiveBtn, subsArchBtn, "archive");
    await refreshSubs();
  });

  subsToMeActiveBtn?.addEventListener("click", async () => {
    view.subsToMe = "active";
    setSeg(subsToMeActiveBtn, subsToMeArchBtn, "active");
    await refreshSubsToMe();
  });
  subsToMeArchBtn?.addEventListener("click", async () => {
    view.subsToMe = "archive";
    setSeg(subsToMeActiveBtn, subsToMeArchBtn, "archive");
    await refreshSubsToMe();
  });
}

/* ========= Boot ========= */
async function boot(){
  currentUser = await requireAuth();
  who.textContent = currentUser?.user?.email || "—";

  btnBack?.addEventListener("click", () => location.href = "builder.html");
  btnLogout?.addEventListener("click", async () => { await signOut(); location.href = "index.html"; });

  btnPollsRefresh?.addEventListener("click", refreshPolls);
  btnTasksRefresh?.addEventListener("click", refreshTasks);
  btnSubsRefresh?.addEventListener("click", refreshSubs);
  btnSubsToMeRefresh?.addEventListener("click", refreshSubsToMe);

  wireSeg();
  wireAddSubscriberModal();
  wireShareModal();

  await Promise.all([
    refreshPolls(),
    refreshTasks(),
    refreshSubs(),
    refreshSubsToMe(),
  ]);
}

boot().catch((e) => {
  console.error(e);
  alert(String(e?.message || e));
});
