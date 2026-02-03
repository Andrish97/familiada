// familiada/js/pages/polls-hub.js
// Centrum sondaży (rewrite v2) — zgodne z workflow tasks/sub + maile (SendGrid edge fn)

import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

/* ================= Config ================= */
// poll-go page (token landing)
const POLL_GO_URL = "poll-go.html";

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);

// auth bar
const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

// chips
const chipPolls = $("chipPolls");
const chipTasks = $("chipTasks");
const chipSubs = $("chipSubs");
const chipSubsToMe = $("chipSubsToMe");

// lists
const listPolls = $("listPolls");
const listTasks = $("listTasks");
const listSubs = $("listSubs");
const listSubsToMe = $("listSubsToMe");

// empties
const emptyPolls = $("emptyPolls");
const emptyTasks = $("emptyTasks");
const emptySubs = $("emptySubs");
const emptySubsToMe = $("emptySubsToMe");

// seg buttons
const pollsActiveBtn = $("pollsActiveBtn");
const pollsArchBtn = $("pollsArchBtn");
const tasksActiveBtn = $("tasksActiveBtn");
const tasksArchBtn = $("tasksArchBtn");
const subsActiveBtn = $("subsActiveBtn");
const subsArchBtn = $("subsArchBtn");
const subsToMeActiveBtn = $("subsToMeActiveBtn");
const subsToMeArchBtn = $("subsToMeArchBtn");

// filters + sorts
const fltPolls = $("fltPolls");
const fltTasks = $("fltTasks");
const fltSubs = $("fltSubs");
const fltSubsToMe = $("fltSubsToMe");
const sortPolls = $("sortPolls");
const sortTasks = $("sortTasks");
const sortSubs = $("sortSubs");
const sortSubsToMe = $("sortSubsToMe");

// refresh
const btnPollsRefresh = $("btnPollsRefresh");
const btnTasksRefresh = $("btnTasksRefresh");
const btnSubsRefresh = $("btnSubsRefresh");
const btnSubsToMeRefresh = $("btnSubsToMeRefresh");

// add subscriber
const btnAddSubscriber = $("btnAddSubscriber");

// modals
const mSub = $("mSub");
const mSubRecipient = $("mSubRecipient");
const mSubPreview = $("mSubPreview");
const mSubSend = $("mSubSend");
const mSubProg = $("mSubProg");
const mSubProgBar = $("mSubProgBar");
const mSubProgTxt = $("mSubProgTxt");

const mShare = $("mShare");
const mShareGame = $("mShareGame");
const mShareType = $("mShareType");
const mShareList = $("mShareList");
const mShareAll = $("mShareAll");
const mShareExtra = $("mShareExtra");
const mShareSend = $("mShareSend");
const mShareProg = $("mShareProg");
const mShareProgBar = $("mShareProgBar");
const mShareProgTxt = $("mShareProgTxt");

// toast
const toast = $("toast");

/* ================= State ================= */
const view = {
  polls: "active",
  tasks: "active",
  subs: "active",
  subsToMe: "active",
};

const ui = {
  flt: { polls: "", tasks: "", subs: "", subsToMe: "" },
  sort: { polls: "new", tasks: "new", subs: "new", subsToMe: "new" },
};

let myProfile = null; // { id, username, email }

// share modal state
let shareCtx = null; // { game_id, name, poll_type }

/* ================= Utils ================= */
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function setChip(el, n){
  if (!el) return;
  el.textContent = String(n ?? 0);
  el.style.opacity = n ? "1" : ".65";
}

function renderEmpty(listEl, emptyEl, hasAny){
  if (emptyEl) emptyEl.style.display = hasAny ? "none" : "block";
  if (listEl && !hasAny) listEl.innerHTML = "";
}

function isActiveStatus(st){
  const s = String(st || "").toLowerCase();
  return s === "pending" || s === "opened" || s === "open" || s === "active" || s === "draft";
}

function isArchiveStatus(st){
  const s = String(st || "").toLowerCase();
  return s === "done" || s === "closed" || s === "declined" || s === "cancelled";
}

function statusClass(st){
  const s = String(st || "").toLowerCase();
  if (s === "open" || s === "active" || s === "done") return "ok";
  if (s === "pending" || s === "opened" || s === "draft") return "warn";
  if (s === "declined" || s === "cancelled" || s === "closed") return "bad";
  return "dim";
}

function textMatch(row, q){
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  const hay = [
    row?.name, row?.game_name, row?.owner_username, row?.subscriber_username, row?.subscriber_email,
    row?.status, row?.poll_state, row?.poll_type, row?.type,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(s);
}

function sortRows(rows, mode){
  const m = String(mode || "new");
  const getName = (r) => String(r?.name || r?.game_name || r?.subscriber_username || r?.subscriber_email || "");
  const getStatus = (r) => String(r?.status || r?.poll_state || "");
  const getTime = (r) => String(r?.updated_at || r?.created_at || r?.poll_opened_at || "");

  const copy = rows.slice();

  if (m === "name"){
    copy.sort((a,b) => getName(a).localeCompare(getName(b), "pl", { sensitivity:"base" }));
    return copy;
  }
  if (m === "status"){
    copy.sort((a,b) => getStatus(a).localeCompare(getStatus(b), "pl", { sensitivity:"base" }));
    return copy;
  }
  copy.sort((a,b) => getTime(b).localeCompare(getTime(a)));
  return copy;
}

function toastShow(msg, ms = 2200){
  if (!toast) return;
  toast.textContent = String(msg || "");
  toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.hidden = true; }, ms);
}

function pickSubLabel(r){
  return (
    r?.subscriber_username ||
    r?.subscriber_email ||
    r?.username ||
    r?.email ||
    r?.subscriber ||
    "—"
  );
}

/* ================= Modal helpers ================= */
function modalOpen(el){
  if (!el) return;
  el.hidden = false;
  document.documentElement.style.overflow = "hidden";
}

function modalClose(el){
  if (!el) return;
  el.hidden = true;
  document.documentElement.style.overflow = "";
}

function wireModal(el){
  if (!el) return;
  el.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.closest("[data-close]")) modalClose(el);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modalClose(el);
  });
}

/* ================= RPC ================= */
async function rpcList(fn, args = {}){
  const { data, error } = await sb().rpc(fn, args);
  if (error){
    console.warn("[polls_hub] rpcList failed:", fn, error);
    return [];
  }
  return Array.isArray(data) ? data : (data ? [data] : []);
}

async function rpcOne(fn, args = {}){
  const { data, error } = await sb().rpc(fn, args);
  if (error){
    console.warn("[polls_hub] rpcOne failed:", fn, error);
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
}

/* ================= Email (SendGrid Edge Function) ================= */
function emailHtmlWrapper(title, bodyHtml){
  // minimalny layout w stylu Familiada (neon + prosty)
  return `<!doctype html>
  <html><head><meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>${esc(title)}</title>
  </head>
  <body style="margin:0;background:#0b0b12;color:#f2f2ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:18px;">
      <div style="padding:14px 16px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:linear-gradient(180deg,rgba(120,80,255,.20),rgba(0,0,0,.10));">
        <div style="font-weight:900;letter-spacing:.06em;">FAMILIADA</div>
        <div style="opacity:.78;margin-top:2px;font-weight:800;">Centrum sondaży</div>
      </div>

      <div style="margin-top:14px;padding:16px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);">
        ${bodyHtml}
      </div>

      <div style="opacity:.55;font-size:12px;line-height:1.35;margin-top:12px;">
        Jeśli nie spodziewałeś/aś się tego maila — możesz go zignorować.
      </div>
    </div>
  </body></html>`;
}

function emailInviteSubscription({ inviter, link }){
  const title = "Zaproszenie do listy subskrypcji — Familiada";
  const body = `
    <div style="font-weight:900;font-size:18px;margin-bottom:8px;">Zaproszenie do listy znajomych</div>
    <div style="opacity:.9;line-height:1.45;">
      Użytkownik <b>${esc(inviter || "Familiada")}</b> zaprasza Cię do subskrypcji.
    </div>
    <div style="margin:14px 0;">
      <a href="${esc(link)}" style="display:inline-block;padding:12px 14px;border-radius:999px;
         border:1px solid rgba(255,255,255,.16);background:rgba(140,255,180,.18);color:#f2f2ff;
         text-decoration:none;font-weight:900;">
         Otwórz zaproszenie
      </a>
    </div>
    <div style="opacity:.75;font-size:12px;line-height:1.35;">
      Link przeniesie Cię na stronę, gdzie zaakceptujesz lub odrzucisz zaproszenie.
    </div>`;
  return { subject: title, html: emailHtmlWrapper(title, body) };
}

function emailInvitePoll({ inviter, gameName, pollType, link }){
  const title = "Zaproszenie do głosowania — Familiada";
  const typeLabel = pollType === "poll_points" ? "Sondaż punktowy" : "Sondaż tekstowy";
  const body = `
    <div style="font-weight:900;font-size:18px;margin-bottom:8px;">Zaproszenie do głosowania</div>
    <div style="opacity:.9;line-height:1.45;">
      <b>${esc(inviter || "Familiada")}</b> zaprasza Cię do udziału w sondażu:
      <div style="margin-top:8px;font-weight:900;">${esc(gameName || "Sondaż")}</div>
      <div style="opacity:.8;font-size:12px;margin-top:2px;">${esc(typeLabel)}</div>
    </div>
    <div style="margin:14px 0;">
      <a href="${esc(link)}" style="display:inline-block;padding:12px 14px;border-radius:999px;
         border:1px solid rgba(255,255,255,.16);background:rgba(120,80,255,.22);color:#f2f2ff;
         text-decoration:none;font-weight:900;">
         Przejdź do głosowania
      </a>
    </div>
    <div style="opacity:.75;font-size:12px;line-height:1.35;">
      Link działa jako jednorazowe zadanie (token). Po oddaniu głosu zadanie zostanie oznaczone jako wykonane.
    </div>`;
  return { subject: title, html: emailHtmlWrapper(title, body) };
}

async function sendEmail(to, subject, html){
  const { data, error } = await sb().functions.invoke("send-email", {
    body: { to, subject, html },
  });

  if (error){
    console.warn("[polls_hub] send-email error:", error);
    throw new Error(error.message || "send-email failed");
  }
  return data;
}

/* ================= Render row ================= */
function renderRow({ title, status, meta = [], primaryText, onPrimary, secondaryText, onSecondary }){
  const st = String(status || "");
  const stCls = statusClass(st);
  const metaHtml = meta.map((m) => `<span class="badge dim">${esc(m)}</span>`).join(" ");

  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `
    <div class="stDot ${stCls}" title="status: ${esc(st)}"></div>
    <div class="rowMain">
      <div class="rowTitle">${esc(title || "—")}</div>
      <div class="rowMeta">${metaHtml}</div>
    </div>
    <div class="rowActions">
      ${secondaryText ? `<button class="btn sm" data-sec type="button">${esc(secondaryText)}</button>` : ""}
      <button class="btn sm pri" data-pri type="button">${esc(primaryText || "Otwórz")}</button>
    </div>
  `;

  const bPri = el.querySelector("[data-pri]");
  const bSec = el.querySelector("[data-sec]");

  if (bPri) bPri.addEventListener("click", () => onPrimary?.());
  if (bSec) bSec.addEventListener("click", () => onSecondary?.());

  return el;
}

/* ================= Pick meta ================= */
function pickTitle(r){
  if (r?.owner_username) return `${r.owner_username} • ${r?.poll_type || "sondaż"}`;
  if (r?.recipient_email) return r.recipient_email;
  return "—";
}

function pickMetaPieces(r){
  const meta = [];
  if (r?.poll_type) meta.push(`typ: ${r.poll_type}`);
  if (r?.owner_username) meta.push(`od: ${r.owner_username}`);
  if (r?.created_at) meta.push(`utw.: ${String(r.created_at).slice(0,16).replace("T"," ")}`);
  if (r?.done_at) meta.push(`done: ${String(r.done_at).slice(0,16).replace("T"," ")}`);
  if (r?.accepted_at) meta.push(`zaakc.: ${String(r.accepted_at).slice(0,16).replace("T"," ")}`);
  return meta;
}

/* ================= Actions: tasks & subs ================= */
async function taskDeclineByToken(token){
  const row = await rpcOne("polls_action", { p_kind: "task", p_token: token, p_action: "decline" });
  return !!row?.ok;
}

async function subCancelById(id){
  const row = await rpcOne("polls_hub_subscription_cancel", { p_id: id });
  return !!(row?.ok ?? row?.polls_action?.ok ?? row?.polls_hub_subscription_cancel?.ok);
}

async function subRemoveById(id){
  const row = await rpcOne("polls_hub_subscriber_remove", { p_id: id });
  return !!(row?.ok ?? row?.polls_action?.ok ?? row?.polls_hub_subscriber_remove?.ok);
}

/* ================= Refresh: profile + overview ================= */
async function refreshMe(){
  const { data } = await sb().auth.getUser();
  const u = data?.user;
  if (!u) return;

  // profile row (self)
  const { data: p } = await sb().from("profiles").select("id,email,username").eq("id", u.id).maybeSingle();
  myProfile = p || { id: u.id, email: u.email, username: u.email };

  who.textContent = myProfile?.username || myProfile?.email || u.email || "—";
}

async function refreshOverview(){
  const j = await rpcOne("polls_hub_overview");
  const ov = j?.polls_hub_overview || j || {};
  // chips are per-card lists anyway; overview can be used later for badges
  return ov;
}

/* ================= Refresh: Polls ================= */
async function refreshPolls(){
  const rows = await rpcList("polls_hub_list_polls");

  const filtered = rows.filter((r) => {
    const st = String(r?.poll_state || "draft").toLowerCase();
    return view.polls === "active" ? (st === "draft" || st === "open") : (st === "closed");
  });

  const q = ui.flt.polls;
  const filtered2 = filtered.filter(r => textMatch(r, q));
  const finalRows = sortRows(filtered2, ui.sort.polls);

  listPolls.innerHTML = "";
  setChip(chipPolls, finalRows.length);
  renderEmpty(listPolls, emptyPolls, finalRows.length > 0);

  for (const r of finalRows){
    const gameId = r?.game_id;
    const pollState = r?.poll_state || "draft";
    const pollType = r?.poll_type || "poll_text";

    const meta = [];
    meta.push(`typ: ${pollType}`);
    meta.push(`pyt.: ${Number(r?.sessions_total || 0)}`);
    meta.push(`otwarte: ${Number(r?.open_questions || 0)}`);
    meta.push(`zadania: ${Number(r?.tasks_active || 0)} aktywne / ${Number(r?.tasks_done || 0)} done`);

    const prev = Array.isArray(r?.recipients_preview) ? r.recipients_preview : [];
    if (prev.length){
      meta.push(`dla: ${prev.slice(0,6).join(", ")}${prev.length >= 6 ? "…" : ""}`);
    } else if (String(pollState).toLowerCase() === "open"){
      meta.push("dla: (jeszcze nie udostępniono)");
    }

    const canShare = String(pollState).toLowerCase() === "open";

    const el = renderRow({
      title: r?.name || "—",
      status: pollState,
      meta,
      primaryText: "Otwórz",
      onPrimary: async () => {
        if (!gameId) return;
        location.href = `polls.html?id=${encodeURIComponent(gameId)}`;
      },
      secondaryText: canShare ? "Zaproś" : "Zamknięte",
      onSecondary: async () => {
        if (!canShare) return;
        shareCtx = { game_id: gameId, name: r?.name || "Sondaż", poll_type: pollType };
        await openShareModal(shareCtx);
      },
    });

    listPolls.appendChild(el);
  }
}

/* ================= Refresh: Tasks ================= */
async function refreshTasks(){
  const rows = await rpcList("polls_hub_list_tasks");

  const filtered = rows.filter((r) => {
    const st = r?.status;
    return view.tasks === "active" ? isActiveStatus(st) : isArchiveStatus(st);
  });

  const q = ui.flt.tasks;
  const filtered2 = filtered.filter(r => textMatch(r, q));
  const finalRows = sortRows(filtered2, ui.sort.tasks);

  listTasks.innerHTML = "";
  setChip(chipTasks, finalRows.length);
  renderEmpty(listTasks, emptyTasks, finalRows.length > 0);

  for (const r of finalRows){
    const title = r?.game_name || pickTitle(r);
    const meta = pickMetaPieces(r);
    const status = r?.status;

    const pollType = r?.poll_type;
    const gameId = r?.game_id;
    const shareKey = r?.share_key_poll;
    const token = r?.token;

    const canOpen = !!(pollType && gameId && shareKey);
    const primaryText = canOpen ? "Głosuj" : "Szczegóły";

    const el = renderRow({
      title,
      status,
      meta,
      primaryText,
      onPrimary: async () => {
        if (!canOpen){
          toastShow("Brak danych do otwarcia zadania.");
          return;
        }
        // Otwieramy poll-go na tokenie (spójna bramka), a poll-go przekieruje do właściwego poll-text/poll-points
        location.href = `${POLL_GO_URL}?t=${encodeURIComponent(token)}`;
      },
      secondaryText: view.tasks === "active" ? "Odrzuć" : null,
      onSecondary: async () => {
        if (!token) return;
        modalConfirm({
          title: "Odrzucić zadanie?",
          text: "Zadanie zostanie oznaczone jako odrzucone.",
          okText: "Odrzuć",
          onOk: async () => {
            const did = await taskDeclineByToken(token);
            if (did){
              toastShow("Odrzucono ✅");
              await refreshTasks();
              await refreshOverview();
            } else {
              toastShow("Nie udało się odrzucić.");
            }
          }
        });
      },
    });

    listTasks.appendChild(el);
  }
}

/* ================= Refresh: Subs ================= */
async function refreshSubs(){
  const rows = await rpcList("polls_hub_list_my_subscriptions");

  const filtered = rows.filter((r) => {
    const st = r?.status;
    return view.subs === "active" ? isActiveStatus(st) : isArchiveStatus(st);
  });

  const q = ui.flt.subs;
  const filtered2 = filtered.filter(r => textMatch(r, q));
  const finalRows = sortRows(filtered2, ui.sort.subs);

  listSubs.innerHTML = "";
  setChip(chipSubs, finalRows.length);
  renderEmpty(listSubs, emptySubs, finalRows.length > 0);

  for (const r of finalRows){
    const title = pickSubLabel(r);
    const meta = pickMetaPieces(r);
    const status = r?.status;

    const id = r?.id;

    const el = renderRow({
      title,
      status,
      meta,
      primaryText: "Anuluj",
      onPrimary: async () => {
        if (!id) return;
        modalConfirm({
          title: "Anulować subskrypcję?",
          text: "Subskrypcja zostanie anulowana (status: cancelled).",
          okText: "Anuluj",
          onOk: async () => {
            const did = await subCancelById(id);
            toastShow(did ? "Anulowano ✅" : "Nie udało się anulować.");
            if (did) await refreshSubs();
          }
        });
      },
      secondaryText: null,
    });

    listSubs.appendChild(el);
  }
}

/* ================= Refresh: SubsToMe ================= */
async function refreshSubsToMe(){
  const rows = await rpcList("polls_hub_list_my_subscribers");

  const filtered = rows.filter((r) => {
    const st = r?.status;
    return view.subsToMe === "active" ? isActiveStatus(st) : isArchiveStatus(st);
  });

  const q = ui.flt.subsToMe;
  const filtered2 = filtered.filter(r => textMatch(r, q));
  const finalRows = sortRows(filtered2, ui.sort.subsToMe);

  listSubsToMe.innerHTML = "";
  setChip(chipSubsToMe, finalRows.length);
  renderEmpty(listSubsToMe, emptySubsToMe, finalRows.length > 0);

  for (const r of finalRows){
    const title = pickSubLabel(r);
    const meta = pickMetaPieces(r);
    const status = r?.status;
    const id = r?.id;

    const el = renderRow({
      title,
      status,
      meta,
      primaryText: "Usuń",
      onPrimary: async () => {
        if (!id) return;
        modalConfirm({
          title: "Usunąć subskrybenta?",
          text: "Subskrybent zostanie usunięty (status: cancelled).",
          okText: "Usuń",
          onOk: async () => {
            const did = await subRemoveById(id);
            toastShow(did ? "Usunięto ✅" : "Nie udało się usunąć.");
            if (did) await refreshSubsToMe();
          }
        });
      },
      secondaryText: null,
    });

    listSubsToMe.appendChild(el);
  }
}

/* ================= Modal: Confirm (generic) ================= */
function modalConfirm({ title, text, okText = "OK", onOk }){
  // minimalistycznie: użyj mSub jako kontenera? Nie — tworzymy dynamiczny mini modal.
  const el = document.createElement("div");
  el.className = "modal";
  el.innerHTML = `
    <div class="modalBack" data-close></div>
    <div class="modalCard" role="dialog" aria-modal="true">
      <div class="modalHead">
        <div class="modalTitle">${esc(title || "Potwierdź")}</div>
        <button class="btn sm" type="button" data-close>✕</button>
      </div>
      <div class="modalBody">
        <div class="hint">${esc(text || "")}</div>
      </div>
      <div class="modalFoot">
        <button class="btn" type="button" data-close>Anuluj</button>
        <button class="btn pri" type="button" data-ok>${esc(okText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.documentElement.style.overflow = ""; };
  document.documentElement.style.overflow = "hidden";

  el.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) close();
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  el.querySelector("[data-ok]")?.addEventListener("click", async () => {
    try{ await onOk?.(); } finally { close(); }
  });
}

/* ================= Modal: Add subscriber ================= */
async function openAddSubscriberModal(){
  mSubRecipient.value = "";
  mSubPreview.style.display = "none";
  setProgress(mSubProg, mSubProgBar, mSubProgTxt, 0, "");
  mSubProg.style.display = "none";
  modalOpen(mSub);
  setTimeout(() => mSubRecipient.focus(), 50);
}

function setProgress(box, bar, txt, pct, label){
  if (!box || !bar || !txt) return;
  box.style.display = "block";
  bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  txt.textContent = label || "—";
}

async function addSubscriberSend(){
  const rec = String(mSubRecipient.value || "").trim();
  if (!rec){
    toastShow("Wpisz username lub e-mail.");
    mSubRecipient.focus();
    return;
  }

  mSubSend.disabled = true;
  setProgress(mSubProg, mSubProgBar, mSubProgTxt, 10, "Tworzę zaproszenie…");

  const row = await rpcOne("polls_hub_subscription_invite_a", { p_recipient: rec });
  if (!row?.ok){
    mSubSend.disabled = false;
    setProgress(mSubProg, mSubProgBar, mSubProgTxt, 0, "Błąd.");
    toastShow("Nie udało się utworzyć zaproszenia.");
    return;
  }

  const channel = row.channel;
  const already = !!row.already;
  const token = row.token;
  const email = row.email;

  // onsite: wystarczy UI
  if (channel === "onsite"){
    setProgress(mSubProg, mSubProgBar, mSubProgTxt, 100, already ? "Już istniało (onsite)." : "Wysłano (onsite).");
    toastShow(already ? "Już było ✅" : "Zaproszono ✅");
    await refreshSubsToMe();
    mSubSend.disabled = false;
    modalClose(mSub);
    return;
  }

  // email channel: wyślij mail tylko jeśli fresh
  if (channel === "email" && !already){
    try{
      setProgress(mSubProg, mSubProgBar, mSubProgTxt, 60, "Wysyłam e-mail…");
      const link = `${location.origin}${location.pathname.replace(/\/[^/]*$/, "/")}${POLL_GO_URL}?t=${encodeURIComponent(token)}`;
      const { subject, html } = emailInviteSubscription({ inviter: myProfile?.username, link });

      await sendEmail(email, subject, html);
      setProgress(mSubProg, mSubProgBar, mSubProgTxt, 100, "E-mail wysłany ✅");
      toastShow("Mail wysłany ✅");
    } catch (e){
      console.warn("[polls_hub] sendEmail failed:", e);
      toastShow(`Mail nie wysłany: ${String(e?.message || e).slice(0,80)}`);
    }
  } else {
    toastShow("Zaproszenie już istniało.");
  }

  await refreshSubsToMe();
  mSubSend.disabled = false;
  modalClose(mSub);
}

/* ================= Modal: Share poll ================= */
async function openShareModal(ctx){
  if (!ctx?.game_id) return;
  mShareGame.textContent = ctx.name || "Sondaż";
  mShareType.textContent = ctx.poll_type || "—";
  mShareExtra.value = "";
  mShareAll.checked = false;

  setProgress(mShareProg, mShareProgBar, mShareProgTxt, 0, "");
  mShareProg.style.display = "none";

  // load active subscribers list
  mShareList.innerHTML = "";
  const subs = await rpcList("polls_hub_list_my_subscribers");
  const active = subs.filter(s => String(s?.status||"").toLowerCase() === "active");

  for (const s of active){
    const id = s?.id;
    const email = s?.subscriber_email || "";
    const username = s?.subscriber_username || "";
    const label = username ? username : email;

    const row = document.createElement("div");
    row.className = "shareItem";
    row.innerHTML = `
      <input type="checkbox" data-pick value="${esc(label)}" />
      <div class="txt">
        <div class="nm">${esc(username || email || "—")}</div>
        <div class="em">${esc(username ? email : "")}</div>
      </div>
    `;
    mShareList.appendChild(row);
  }

  modalOpen(mShare);
}

function getSelectedShareRecipients(){
  const picked = Array.from(mShareList.querySelectorAll("input[data-pick]"))
    .filter(x => x.checked)
    .map(x => String(x.value || "").trim())
    .filter(Boolean);

  const extra = String(mShareExtra.value || "")
    .split(/[\n,]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const all = [...picked, ...extra];

  // dedupe case-insensitive
  const seen = new Set();
  const out = [];
  for (const it of all){
    const k = it.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

async function shareSend(){
  if (!shareCtx?.game_id) return;

  const recipients = getSelectedShareRecipients();
  if (!recipients.length){
    toastShow("Wybierz lub wpisz odbiorców.");
    return;
  }

  mShareSend.disabled = true;
  setProgress(mShareProg, mShareProgBar, mShareProgTxt, 10, "Tworzę zadania…");

  // Create tasks via canonical RPC (variant A returns tokens for emails)
  const res = await rpcOne("poll_task_send", {
    p_game_id: shareCtx.game_id,
    p_poll_type: shareCtx.poll_type || "poll_text",
    p_recipients: recipients,
  });

  if (!res?.ok){
    mShareSend.disabled = false;
    toastShow("Nie udało się utworzyć zadań.");
    return;
  }

  const emailList = Array.isArray(res.email) ? res.email : [];
  const onsiteList = Array.isArray(res.onsite) ? res.onsite : [];
  const skipped = Number(res.skipped || 0);

  // send emails (each has token)
  if (emailList.length){
    setProgress(mShareProg, mShareProgBar, mShareProgTxt, 50, `Wysyłam e-maile (${emailList.length})…`);
    let ok = 0;
    let fail = 0;

    for (let i=0; i<emailList.length; i++){
      const it = emailList[i];
      const email = it?.email;
      const token = it?.token;
      if (!email || !token) continue;

      const link = `${location.origin}${location.pathname.replace(/\/[^/]*$/, "/")}${POLL_GO_URL}?t=${encodeURIComponent(token)}`;

      try{
        const { subject, html } = emailInvitePoll({
          inviter: myProfile?.username,
          gameName: shareCtx?.name,
          pollType: shareCtx?.poll_type,
          link,
        });
        await sendEmail(email, subject, html);
        ok++;
      } catch (e){
        fail++;
        console.warn("[polls_hub] sendEmail failed:", e);
        toastShow(`Mail nie wysłany: ${String(e?.message || e).slice(0,80)}`);
      }

      const pct = 50 + Math.round(((i+1)/emailList.length) * 45);
      setProgress(mShareProg, mShareProgBar, mShareProgTxt, pct, `E-maile: ${ok} ✅ / ${fail} ❌`);
    }
  }

  setProgress(mShareProg, mShareProgBar, mShareProgTxt, 100, `Gotowe ✅ (onsite: ${onsiteList.length}, e-mail: ${emailList.length}, pominięto: ${skipped})`);

  toastShow("Udostępniono ✅");
  await refreshPolls();
  await refreshOverview();
  mShareSend.disabled = false;
  modalClose(mShare);
}

/* ================= Wiring ================= */
function wireSeg(btnA, btnB, key){
  btnA?.addEventListener("click", async () => {
    btnA.classList.add("on");
    btnB.classList.remove("on");
    view[key] = "active";
    await refreshAll();
  });
  btnB?.addEventListener("click", async () => {
    btnB.classList.add("on");
    btnA.classList.remove("on");
    view[key] = "arch";
    await refreshAll();
  });
}

function wireUi(){
  const bindInput = (key, el, fn) => el?.addEventListener("input", async () => { ui.flt[key] = el.value || ""; await fn(); });
  const bindSort = (key, el, fn) => el?.addEventListener("change", async () => { ui.sort[key] = el.value || "new"; await fn(); });

  bindInput("polls", fltPolls, refreshPolls);
  bindInput("tasks", fltTasks, refreshTasks);
  bindInput("subs", fltSubs, refreshSubs);
  bindInput("subsToMe", fltSubsToMe, refreshSubsToMe);

  bindSort("polls", sortPolls, refreshPolls);
  bindSort("tasks", sortTasks, refreshTasks);
  bindSort("subs", sortSubs, refreshSubs);
  bindSort("subsToMe", sortSubsToMe, refreshSubsToMe);
}

async function refreshAll(){
  await Promise.allSettled([
    refreshPolls(),
    refreshTasks(),
    refreshSubs(),
    refreshSubsToMe(),
  ]);
}

/* ================= Boot ================= */
async function boot(){
  await requireAuth();

  // claim email records on login (safe)
  try{ await sb().rpc("poll_on_login"); } catch {}

  await refreshMe();

  btnBack?.addEventListener("click", () => (location.href = "builder.html"));
  btnLogout?.addEventListener("click", async () => { await signOut(); location.href = "index.html"; });

  btnPollsRefresh?.addEventListener("click", refreshPolls);
  btnTasksRefresh?.addEventListener("click", refreshTasks);
  btnSubsRefresh?.addEventListener("click", refreshSubs);
  btnSubsToMeRefresh?.addEventListener("click", refreshSubsToMe);

  wireSeg(pollsActiveBtn, pollsArchBtn, "polls");
  wireSeg(tasksActiveBtn, tasksArchBtn, "tasks");
  wireSeg(subsActiveBtn, subsArchBtn, "subs");
  wireSeg(subsToMeActiveBtn, subsToMeArchBtn, "subsToMe");

  wireUi();

  wireModal(mSub);
  wireModal(mShare);

  btnAddSubscriber?.addEventListener("click", openAddSubscriberModal);
  mSubSend?.addEventListener("click", addSubscriberSend);

  mShareAll?.addEventListener("change", () => {
    const on = !!mShareAll.checked;
    for (const cb of mShareList.querySelectorAll("input[data-pick]")) cb.checked = on;
  });
  mShareSend?.addEventListener("click", shareSend);

  await refreshAll();
}

boot();
