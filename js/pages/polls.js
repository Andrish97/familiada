// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

// topbar
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");

// ui
const msg = document.getElementById("msg");
const hintTop = document.getElementById("hintTop");

const cardMain = document.getElementById("cardMain");
const cardEmpty = document.getElementById("cardEmpty");

const chipKind = document.getElementById("chipKind");
const chipStatus = document.getElementById("chipStatus");

const gName = document.getElementById("gName");
const gMeta = document.getElementById("gMeta");

const pollLinkEl = document.getElementById("pollLink");
const btnCopy = document.getElementById("btnCopy");
const btnOpen = document.getElementById("btnOpen");
const btnOpenQr = document.getElementById("btnOpenQr");
const qrBox = document.getElementById("qr");

const btnPollAction = document.getElementById("btnPollAction");
const btnPreview = document.getElementById("btnPreview");

const resultsCard = document.getElementById("resultsCard");
const resultsMeta = document.getElementById("resultsMeta");
const resultsList = document.getElementById("resultsList");

const QN_MIN = 10;
const AN_MIN = 3;
const AN_MAX = 6;

let game = null;

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
}

function typeLabel(t) {
  if (t === "poll_points") return "PUNKTACJA";
  if (t === "poll_text") return "TYPOWY SONDAŻ";
  if (t === "prepared") return "PREPAROWANY";
  return String(t || "—").toUpperCase();
}

function statusLabel(st) {
  if (st === "draft") return "SZKIC";
  if (st === "poll_open") return "OTWARTY";
  if (st === "ready") return "ZAMKNIĘTY";
  return String(st || "—").toUpperCase();
}

function clearQr() {
  if (qrBox) qrBox.innerHTML = "";
}

async function renderSmallQr(link) {
  if (!qrBox) return;
  qrBox.innerHTML = "";
  if (!link) return;

  try {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, link, { width: 260, margin: 1 });
    qrBox.appendChild(canvas);
  } catch (e) {
    console.error("[polls] QR error:", e);
    qrBox.textContent = "QR nie działa.";
  }
}

function pollLinkForGame(g) {
  // publiczny poll zależy od typu
  const page = (g.type === "poll_points") ? "poll-points.html" : "poll-text.html";
  const u = new URL(page, location.href);
  u.searchParams.set("key", g.share_key_poll);
  // id opcjonalnie (nie wymagamy w poll-points, ale nie szkodzi)
  u.searchParams.set("id", g.id);
  return u.toString();
}

function setLinkUiVisible(on) {
  btnCopy && (btnCopy.disabled = !on);
  btnOpen && (btnOpen.disabled = !on);
  btnOpenQr && (btnOpenQr.disabled = !on);
  if (!on) clearQr();
}

async function loadGameRow() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_poll,poll_opened_at,poll_closed_at")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

/* ===== validation for enabling buttons ===== */

async function getQuestionsWithAnswers(gameId) {
  const { data: qsRows, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });

  if (qErr) throw qErr;

  const qs = qsRows || [];
  const out = [];

  for (const q of qs) {
    const { data: as, error: aErr } = await sb()
      .from("answers")
      .select("ord,text")
      .eq("question_id", q.id)
      .order("ord", { ascending: true });

    if (aErr) throw aErr;

    out.push({
      id: q.id,
      ord: Number(q.ord),
      text: q.text,
      answers: (as || []).map(a => ({ ord: Number(a.ord), text: a.text })),
    });
  }

  return out;
}

async function canStartPoll(g) {
  // Start: tylko w szkicu
  if (g.status !== "draft") return { ok: false, reason: "" };

  const qs = await getQuestionsWithAnswers(g.id);

  if (qs.length < QN_MIN) {
    return { ok: false, reason: `Żeby uruchomić: liczba pytań ≥ ${QN_MIN} (masz ${qs.length}).` };
  }

  if (g.type === "poll_text") {
    // w typowym sondażu edytujesz tylko pytania — tu OK
    return { ok: true, reason: "" };
  }

  if (g.type === "poll_points") {
    // tu wymagamy: każde pytanie ma 3..6 odpowiedzi
    for (const q of qs.slice(0, QN_MIN)) {
      const cnt = q.answers.length;
      if (cnt < AN_MIN || cnt > AN_MAX) {
        return { ok: false, reason: `Żeby uruchomić: każde pytanie 3–6 odpowiedzi (Pyt. ${q.ord} ma ${cnt}).` };
      }
    }
    return { ok: true, reason: "" };
  }

  return { ok: false, reason: "To nie jest tryb sondażowy." };
}

async function countDistinctVotedAnswersForQuestion(gameId, qOrd) {
  // bierzemy najnowszą sesję dla qOrd i liczymy różne answer_ord w poll_votes
  const { data: sess, error: sErr } = await sb()
    .from("poll_sessions")
    .select("id,created_at")
    .eq("game_id", gameId)
    .eq("question_ord", qOrd)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr) throw sErr;
  const sid = sess?.id;
  if (!sid) return 0;

  const { data: votes, error: vErr } = await sb()
    .from("poll_votes")
    .select("answer_ord")
    .eq("poll_session_id", sid);

  if (vErr) throw vErr;

  const set = new Set();
  for (const v of (votes || [])) set.add(Number(v.answer_ord));
  return set.size;
}

async function canClosePoll(g) {
  if (g.status !== "poll_open") return { ok: false, reason: "" };

  // poll_text: nie mamy jeszcze tabeli na tekstowe odpowiedzi -> tu będzie kolejny etap
  if (g.type === "poll_text") {
    return {
      ok: false,
      reason: "Typowy sondaż (tekstowy) wymaga tabeli na wpisy — na razie nie da się go zamknąć i policzyć w tej bazie.",
    };
  }

  if (g.type === "poll_points") {
    // warunek: w każdym pytaniu co najmniej 2 różne odpowiedzi dostały głosy (nie-0)
    for (let qOrd = 1; qOrd <= QN_MIN; qOrd++) {
      const distinct = await countDistinctVotedAnswersForQuestion(g.id, qOrd);
      if (distinct < 2) {
        return { ok: false, reason: `Żeby zamknąć: w każdym pytaniu min. 2 różne odpowiedzi muszą mieć głosy (P${qOrd} ma ${distinct}).` };
      }
    }
    return { ok: true, reason: "" };
  }

  return { ok: false, reason: "To nie jest tryb sondażowy." };
}

function actionLabelForStatus(st) {
  if (st === "draft") return "Uruchomić sondaż";
  if (st === "poll_open") return "Zamknąć sondaż";
  if (st === "ready") return "Uruchomić ponownie";
  return "—";
}

/* ===== results preview (poll_points only for now) ===== */

async function buildPollPointsPreview(gameId) {
  const qs = await getQuestionsWithAnswers(gameId);
  const ten = qs.slice(0, QN_MIN);

  const blocks = [];

  for (const q of ten) {
    // latest session
    const { data: sess } = await sb()
      .from("poll_sessions")
      .select("id,created_at")
      .eq("game_id", gameId)
      .eq("question_ord", q.ord)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sid = sess?.id || null;

    const counts = new Map();
    for (const a of q.answers) counts.set(a.ord, 0);

    if (sid) {
      const { data: votes } = await sb()
        .from("poll_votes")
        .select("answer_ord")
        .eq("poll_session_id", sid);

      for (const v of (votes || [])) {
        const ao = Number(v.answer_ord);
        if (counts.has(ao)) counts.set(ao, (counts.get(ao) || 0) + 1);
      }
    }

    blocks.push({ q, counts });
  }

  return blocks;
}

function renderPreviewBlocks(blocks) {
  if (!resultsList) return;

  resultsList.innerHTML = "";
  for (const b of blocks) {
    const wrap = document.createElement("div");
    wrap.className = "resultQ";

    const t = document.createElement("div");
    t.className = "qTitle";
    t.textContent = `P${b.q.ord}: ${b.q.text || "—"}`;
    wrap.appendChild(t);

    for (const a of b.q.answers) {
      const row = document.createElement("div");
      row.className = "aRow";

      const txt = document.createElement("div");
      txt.className = "aTxt";
      txt.textContent = a.text || "—";

      const val = document.createElement("div");
      val.className = "aVal";
      val.textContent = `${b.counts.get(a.ord) || 0} głosów`;

      row.appendChild(txt);
      row.appendChild(val);
      wrap.appendChild(row);
    }

    resultsList.appendChild(wrap);
  }
}

/* ===== main refresh ===== */

async function refresh() {
  if (!gameId) {
    cardMain && (cardMain.style.display = "none");
    cardEmpty && (cardEmpty.style.display = "");
    setMsg("Brak parametru id.");
    return;
  }

  game = await loadGameRow();

  // chips
  if (chipKind) chipKind.textContent = typeLabel(game.type);

  if (chipStatus) {
    chipStatus.className = "chip status";
    chipStatus.textContent = statusLabel(game.status);

    if (game.status === "ready") chipStatus.classList.add("ok");
    else if (game.status === "poll_open") chipStatus.classList.add("warn");
    else chipStatus.classList.add("bad");
  }

  cardEmpty && (cardEmpty.style.display = "none");
  cardMain && (cardMain.style.display = "");

  if (gName) gName.textContent = game.name || "Sondaż";
  if (gMeta) gMeta.textContent =
    `Status: ${statusLabel(game.status)} • Typ: ${typeLabel(game.type)} • Minimalnie ${QN_MIN} pytań.`;

  // default hide results
  if (resultsCard) resultsCard.style.display = "none";

  // link+qr visible only when poll_open
  const st = game.status;
  if (pollLinkEl) pollLinkEl.value = "";
  setLinkUiVisible(false);

  const label = actionLabelForStatus(st);
  if (btnPollAction) btnPollAction.textContent = label;

  // enable logic + hints
  let enabled = false;
  let hint = "";

  if (st === "draft") {
    const chk = await canStartPoll(game);
    enabled = chk.ok;
    hint = chk.ok ? "Sondaż gotowy do uruchomienia." : chk.reason;
  } else if (st === "poll_open") {
    const chk = await canClosePoll(game);
    enabled = chk.ok;
    hint = chk.ok ? "Możesz zamknąć sondaż." : chk.reason;
  } else if (st === "ready") {
    // reopen = start conditions, plus ostrzeżenie o kasowaniu
    const chk = await canStartPoll({ ...game, status: "draft" });
    enabled = chk.ok;
    hint = chk.ok ? "Uruchomienie ponowne usunie poprzednie dane." : chk.reason;
  }

  if (hintTop) hintTop.textContent = hint || "—";
  if (btnPollAction) btnPollAction.disabled = !enabled;

  if (st === "poll_open") {
    const link = pollLinkForGame(game);
    if (pollLinkEl) pollLinkEl.value = link;
    setLinkUiVisible(true);
    await renderSmallQr(link);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  if (who) who.textContent = u?.email || "—";

  btnBack?.addEventListener("click", () => (location.href = "builder.html"));
  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnCopy?.addEventListener("click", async () => {
    if (!pollLinkEl?.value) return;
    try {
      await navigator.clipboard.writeText(pollLinkEl.value);
      setMsg("Skopiowano link sondażu.");
    } catch {
      setMsg("Nie udało się skopiować.");
    }
  });

  btnOpen?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnOpenQr?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    const u = new URL("poll-qr.html", location.href);
    u.searchParams.set("url", pollLinkEl.value);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  });

  btnPollAction?.addEventListener("click", async () => {
    if (!game) return;

    const st = game.status;

    // START
    if (st === "draft") {
      const chk = await canStartPoll(game);
      if (!chk.ok) return setMsg(chk.reason);

      const ok = await confirmModal({
        title: "Uruchomić sondaż?",
        text: `Uruchomić sondaż dla "${game.name}"?`,
        okText: "Uruchom",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      const { error } = await sb().rpc("poll_open", { p_game_id: game.id, p_key: game.share_key_poll });
      if (error) {
        alert(`Nie udało się uruchomić sondażu.\n\n${error.message}`);
        return;
      }

      setMsg("Sondaż uruchomiony.");
      await refresh();
      return;
    }

    // CLOSE
    if (st === "poll_open") {
      const chk = await canClosePoll(game);
      if (!chk.ok) return setMsg(chk.reason);

      const ok = await confirmModal({
        title: "Zamknąć sondaż?",
        text: "Zamknąć sondaż i przeliczyć punkty do 100?",
        okText: "Zamknij",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      const { error } = await sb().rpc("poll_close_and_normalize", { p_game_id: game.id, p_key: game.share_key_poll });
      if (error) {
        alert(`Nie udało się zamknąć sondażu.\n\n${error.message}`);
        return;
      }

      setMsg("Sondaż zamknięty.");
      await refresh();
      return;
    }

    // REOPEN (ready)
    if (st === "ready") {
      const chk = await canStartPoll({ ...game, status: "draft" });
      if (!chk.ok) return setMsg(chk.reason);

      const ok = await confirmModal({
        title: "Uruchomić ponownie?",
        text: "Uruchomienie ponowne usunie poprzednie dane (głosy i sesje) i otworzy sondaż od nowa.",
        okText: "Uruchom ponownie",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      // kasujemy poprzednie dane (zgodnie z Twoją specyfikacją)
      // (RLS pozwala właścicielowi)
      await sb().from("poll_votes").delete().eq("game_id", game.id);
      await sb().from("poll_sessions").delete().eq("game_id", game.id);

      const { error } = await sb().rpc("poll_open", { p_game_id: game.id, p_key: game.share_key_poll });
      if (error) {
        alert(`Nie udało się otworzyć ponownie.\n\n${error.message}`);
        return;
      }

      setMsg("Sondaż otwarty ponownie.");
      await refresh();
    }
  });

  btnPreview?.addEventListener("click", async () => {
    if (!resultsCard) return;

    // tylko poll_points na ten moment
    if (!game || game.type !== "poll_points") {
      setMsg("Podgląd wyników działa teraz dla PUNKTACJI.");
      return;
    }

    if (resultsCard.style.display === "none") {
      resultsCard.style.display = "";
      if (resultsMeta) resultsMeta.textContent = "Zliczanie głosów z najnowszej sesji dla każdego pytania.";
      if (resultsList) resultsList.innerHTML = "Ładuję…";

      const blocks = await buildPollPointsPreview(game.id);
      renderPreviewBlocks(blocks);
    } else {
      resultsCard.style.display = "none";
    }
  });

  await refresh();
});
