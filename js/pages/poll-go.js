// js/pages/poll-go.js
// Public gateway dla tokenów: sub_invite / poll_task + fallback subscribe by email.
// Wymaga RPC: resolve_token, sub_invite_accept, sub_invite_reject,
// poll_task_opened, poll_task_decline, poll_task_done, subscribe_by_email.

import { sb } from "../core/supabase.js";
import { getUser } from "../core/auth.js";

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);

const who = $("who");
const btnLogin = $("btnLogin");

const title = $("title");
const sub = $("sub");
const msg = $("msg");

const subActions = $("subActions");
const btnAccept = $("btnAccept");
const btnReject = $("btnReject");

const fallbackSep = $("fallbackSep");
const fallback = $("fallback");
const fallbackHint = $("fallbackHint");
const fallbackTiny = $("fallbackTiny");
const emailInp = $("email");
const btnSubscribe = $("btnSubscribe");

const taskActions = $("taskActions");
const btnGoVote = $("btnGoVote");
const btnTaskDecline = $("btnTaskDecline");

/* ================= State ================= */
let ownerUsername = "";  // do fallback subscribe (u=... albo z resolve_token)
let token = "";          // t=...
let kind = "";           // sub_invite | poll_task
let status = "";         // status z DB
let pollType = "";       // poll_text | poll_points
let gameId = "";
let shareKey = "";

/* ================= Utils ================= */
function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setMsg(text) {
  if (!msg) return;
  msg.textContent = text || "";
  show(msg, !!text);
}

function disableAll(on) {
  if (btnAccept) btnAccept.disabled = on;
  if (btnReject) btnReject.disabled = on;
  if (btnSubscribe) btnSubscribe.disabled = on;
  if (emailInp) emailInp.disabled = on;
  if (btnGoVote) btnGoVote.disabled = on;
  if (btnTaskDecline) btnTaskDecline.disabled = on;
}

function looksLikeEmail(s) {
  const t = String(s || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function qp(name) {
  const qs = new URLSearchParams(location.search);
  return String(qs.get(name) || "").trim();
}

function safeLower(s) {
  return String(s || "").trim().toLowerCase();
}

/* ================= Auth UI (opcjonalne) ================= */
async function refreshWho() {
  try {
    const u = await getUser();
    const label = u?.username || u?.email || "—";
    if (who) who.textContent = label;
    if (btnLogin) btnLogin.textContent = u ? "Konto" : "Zaloguj";
    if (btnLogin) btnLogin.href = u ? "builder.html" : "index.html";
  } catch {
    if (who) who.textContent = "—";
    if (btnLogin) btnLogin.textContent = "Zaloguj";
    if (btnLogin) btnLogin.href = "index.html";
  }
}

/* ================= Resolve + Routing ================= */
async function resolveToken() {
  // token musi być uuid — jeśli nie, traktujemy jak brak/zużyty
  const t = qp("t");
  token = t;

  // optional owner username for fallback
  ownerUsername = qp("u");

  // jeśli nie mamy nawet kontekstu właściciela, fallback nie ma sensu
  if (!token && !ownerUsername) {
    if (title) title.textContent = "Sondaż";
    if (sub) sub.textContent = "Brak zaproszenia.";
    setMsg("Ten link nie zawiera tokena ani właściciela subskrypcji.");
    showFallback(false);
    return;
  }

  // jeśli nie ma tokena, ale jest u=... → tylko fallback subscribe
  if (!token && ownerUsername) {
    if (title) title.textContent = "Subskrypcja";
    if (sub) sub.textContent = `Subskrypcja sondaży użytkownika: ${ownerUsername}`;
    setMsg("");
    showSubInviteActions(false);
    showFallback(true);
    return;
  }

  // token jest – próbujemy resolve_token
  let data, error;
  try {
    ({ data, error } = await sb().rpc("resolve_token", { p_token: token }));
  } catch (e) {
    error = e;
  }

  if (error) {
    console.warn("[poll_go] resolve_token error:", error);
    if (title) title.textContent = "Sondaż";
    if (sub) sub.textContent = "Nie udało się odczytać zaproszenia.";
    setMsg("Błąd połączenia. Spróbuj ponownie.");
    showFallback(!!ownerUsername);
    return;
  }

  // resolve_token returns table; supabase rpc usually returns array
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || row.ok !== true) {
    if (title) title.textContent = "Sondaż";
    if (sub) sub.textContent = "To zaproszenie jest nieaktywne.";
    setMsg("Token nie istnieje albo został zużyty.");
    showSubInviteActions(false);
    showFallback(!!ownerUsername);
    return;
  }

  kind = row.kind || "";
  status = row.status || "";
  ownerUsername = ownerUsername || (row.owner_username || "");

  if (kind === "sub_invite") {
    renderSubInvite(row);
    return;
  }

  if (kind === "poll_task") {
    renderPollTask(row);
    return;
  }

  // nieznany typ
  if (title) title.textContent = "Sondaż";
  if (sub) sub.textContent = "Nieznany typ zaproszenia.";
  setMsg("Ten link jest nieprawidłowy.");
  showFallback(!!ownerUsername);
}

/* ================= UI: Sub Invite ================= */
function showSubInviteActions(on) {
  show(subActions, !!on);
}

function showFallback(on) {
  show(fallbackSep, !!on);
  show(fallback, !!on);

  if (fallbackTiny) {
    fallbackTiny.textContent = ownerUsername
      ? `Subskrybujesz sondaże użytkownika: ${ownerUsername}`
      : "";
  }
}

function showTaskActions(on) {
  show(taskActions, !!on);
}

function renderSubInvite(row) {
  if (title) title.textContent = "Subskrypcja";
  if (sub) sub.textContent = ownerUsername
    ? `Zaproszenie do subskrypcji sondaży użytkownika: ${ownerUsername}`
    : "Zaproszenie do subskrypcji sondaży.";
  
  showTaskActions(false);

  // statusy: pending | accepted | rejected | cancelled
  if (status === "pending") {
    setMsg("");
    showSubInviteActions(true);
    showFallback(false);
    return;
  }

  // zużyte
  showSubInviteActions(false);
  if (status === "accepted") setMsg("To zaproszenie zostało już zaakceptowane ✅");
  else if (status === "rejected") setMsg("To zaproszenie zostało odrzucone.");
  else if (status === "cancelled") setMsg("To zaproszenie zostało anulowane.");
  else setMsg("To zaproszenie jest nieaktywne.");

  // pozwól zasubskrybować z e-maila, jeśli znamy właściciela (u= albo z resolve)
  showFallback(!!ownerUsername);
}

/* ================= UI: Poll Task ================= */
async function renderPollTask(row) {
  pollType = row.poll_type || "";
  gameId = row.game_id || "";
  shareKey = row.share_key_poll || "";

  if (title) title.textContent = "Głosowanie";
  if (sub) sub.textContent = ownerUsername
    ? `Zaproszenie do głosowania od: ${ownerUsername}`
    : "Zaproszenie do głosowania.";

  showSubInviteActions(false);

  // statusy: pending | opened | done | declined | cancelled
  if (status === "done") {
    setMsg("Już wziąłeś udział w głosowaniu ✅");
    showTaskActions(false);
    showFallback(false);
    return;
  }
  if (status === "declined") {
    setMsg("To głosowanie zostało odrzucone.");
    showTaskActions(false);
    showFallback(false);
    return;
  }
  if (status === "cancelled") {
    setMsg("To głosowanie zostało anulowane.");
    showTaskActions(false);
    showFallback(false);
    return;
  }

  // pending/opened → pokaż akcje (bez auto-redirectu)
  setMsg("");
  showTaskActions(true);
  showFallback(false);
}

/* ================= Actions ================= */
async function onAccept() {
  if (!token) return;
  disableAll(true);
  setMsg("Zapisywanie…");

  try {
    const { data, error } = await sb().rpc("sub_invite_accept", { p_token: token });
    if (error) throw error;

    if (data === "ok") {
      setMsg("Subskrypcja aktywna ✅");
      showSubInviteActions(false);
      showFallback(false);
      return;
    }
    if (data === "already_used") {
      setMsg("To zaproszenie jest już zużyte.");
      showSubInviteActions(false);
      showFallback(!!ownerUsername);
      return;
    }
    setMsg("Nie udało się.");
    showFallback(!!ownerUsername);
  } catch (e) {
    console.warn("[poll_go] accept error:", e);
    setMsg("Nie udało się. Spróbuj ponownie.");
    showFallback(!!ownerUsername);
  } finally {
    disableAll(false);
  }
}

async function onReject() {
  if (!token) return;
  disableAll(true);
  setMsg("Zapisywanie…");

  try {
    const { data, error } = await sb().rpc("sub_invite_reject", { p_token: token });
    if (error) throw error;

    if (data === "ok") {
      setMsg("Odrzucono.");
      showSubInviteActions(false);
      showFallback(!!ownerUsername);
      return;
    }
    if (data === "already_used") {
      setMsg("To zaproszenie jest już zużyte.");
      showSubInviteActions(false);
      showFallback(!!ownerUsername);
      return;
    }
    setMsg("Nie udało się.");
    showFallback(!!ownerUsername);
  } catch (e) {
    console.warn("[poll_go] reject error:", e);
    setMsg("Nie udało się. Spróbuj ponownie.");
    showFallback(!!ownerUsername);
  } finally {
    disableAll(false);
  }
}

async function onSubscribe() {
  const email = safeLower(emailInp?.value);
  if (!looksLikeEmail(email)) {
    setMsg("Podaj poprawny e-mail.");
    return;
  }
  if (!ownerUsername) {
    setMsg("Brak informacji kogo subskrybujesz (u=...).");
    return;
  }

  disableAll(true);
  setMsg("Zapisywanie…");

  try {
    const { data, error } = await sb().rpc("subscribe_by_email", {
      p_owner_username: ownerUsername,
      p_email: email,
    });
    if (error) throw error;

    if (data === "ok") {
      setMsg("Subskrypcja aktywna ✅");
      showSubInviteActions(false);
      // zostaw formularz, ale zablokuj dla czytelności
      showFallback(true);
      if (btnSubscribe) btnSubscribe.disabled = true;
      if (emailInp) emailInp.disabled = true;
      return;
    }

    if (data === "owner_not_found") setMsg("Nie znaleziono właściciela subskrypcji.");
    else if (data === "bad_email") setMsg("Niepoprawny e-mail.");
    else setMsg("Nie udało się.");

  } catch (e) {
    console.warn("[poll_go] subscribe error:", e);
    setMsg("Nie udało się. Spróbuj ponownie.");
  } finally {
    disableAll(false);
  }
}

async function onGoVote() {
  // sanity
  if (!gameId || !shareKey) {
    setMsg("Brak danych głosowania.");
    return;
  }

  disableAll(true);
  setMsg("Przekierowuję do głosowania…");

  // oznacz opened tylko gdy pending (idempotentnie)
  if (status === "pending" && token) {
    try {
      await sb().rpc("poll_task_opened", { p_token: token });
      status = "opened";
    } catch (e) {
      console.warn("[poll_go] poll_task_opened error:", e);
      // nie blokujemy redirectu
    }
  }

  const base = pollType === "poll_text" ? "poll-text.html" : "poll-points.html";
  const url = new URL(base, location.href);
  url.searchParams.set("id", gameId);
  url.searchParams.set("key", shareKey);
  if (token) url.searchParams.set("t", token);

  location.href = url.toString();
}

async function onTaskDecline() {
  if (!token) return;

  disableAll(true);
  setMsg("Zapisywanie…");

  try {
    const { data, error } = await sb().rpc("poll_task_decline", { p_token: token });
    if (error) throw error;

    // nie zakładam formatu "ok"/"already_used" — przyjmuję: sukces = brak error
    status = "declined";
    setMsg("Odrzucono.");
    showTaskActions(false);
    showFallback(!!ownerUsername);

  } catch (e) {
    console.warn("[poll_go] task_decline error:", e);
    setMsg("Nie udało się. Spróbuj ponownie.");
  } finally {
    disableAll(false);
  }
}

/* ================= Wire ================= */
btnAccept?.addEventListener("click", onAccept);
btnReject?.addEventListener("click", onReject);
btnSubscribe?.addEventListener("click", onSubscribe);
emailInp?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") onSubscribe();
});
btnGoVote?.addEventListener("click", onGoVote);
btnTaskDecline?.addEventListener("click", onTaskDecline);

/* ================= Boot ================= */
(async function boot() {
  const u = await getUser();
  await refreshWho();
  if (u) {
    location.href = "polls-hub.html";
    return;
  }
  await resolveToken();
})();
