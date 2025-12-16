// js/pages/polls.js
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const RULES = { QN: 10, AN: 5 };

const $ = (id) => document.getElementById(id);
function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }
function show(el, yes) { if (el) el.style.display = yes ? "" : "none"; }
function dis(el, yes) { if (el) el.disabled = !!yes; }
function txt(el, t) { if (el) el.textContent = t ?? ""; }
function val(el, v) { if (el) el.value = v ?? ""; }

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBack");
const msg = $("msg");

const cardMain = $("cardMain");
const cardEmpty = $("cardEmpty");

const chipKind = $("chipKind");
const chipStatus = $("chipStatus");

const gName = $("gName");
const gMeta = $("gMeta");
const pollLinkEl = $("pollLink");

const qrBox = $("qr");

const btnCopy = $("btnCopy");
const btnOpen = $("btnOpen");
const btnQrSmall = $("btnQrSmall"); // modal QR
const btnOpenQr = $("btnOpenQr");   // rzutnik QR

const qrOverlay = $("qrOverlay");
const qrInline = $("qrInline");
const qrInlineUrl = $("qrInlineUrl");
const btnCloseQr = $("btnCloseQr");

const btnStart = $("btnStart");
const btnClose = $("btnClose");
const btnReopen = $("btnReopen");

const btnPreview = $("btnPreview");
const votesEl = $("votes");

let game = null;

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 2000);
}

function pollLink(g) {
  const base = new URL("poll.html", location.href);
  base.searchParams.set("id", g.id);
  base.searchParams.set("key", g.share_key_poll);
  return base.toString();
}

function setChips(g) {
  txt(chipKind, g.kind === "poll" ? "SONDAŻOWA" : "LOKALNA");

  if (chipStatus) {
    chipStatus.className = "chip status";
    const st = g.status || "draft";
    chipStatus.textContent = st.toUpperCase();
    if (st === "ready") chipStatus.classList.add("ok");
    else if (st === "poll_open") chipStatus.classList.add("warn");
    else chipStatus.classList.add("bad");
  }
}

async function qrCanvas(link, size) {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, link, { width: size, margin: 1 });
  return canvas;
}

async function renderSmallQr(link) {
  if (!qrBox) return;
  qrBox.innerHTML = "";
  try {
    qrBox.appendChild(await qrCanvas(link, 160));
  } catch (e) {
    console.error("[polls] QR small error:", e);
    qrBox.textContent = "QR error";
  }
}

async function openInlineQr(link) {
  if (!qrOverlay || !qrInline || !qrInlineUrl) {
    setMsg("Brak elementów modala QR w HTML.");
    return;
  }

  qrInline.innerHTML = "";
  qrInlineUrl.textContent = link;

  try {
    qrInline.appendChild(await qrCanvas(link, 240));
  } catch (e) {
    console.error("[polls] QR modal error:", e);
    qrInline.textContent = "Nie udało się wygenerować QR.";
  }

  show(qrOverlay, true);
}

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,share_key_poll")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

// 10 pytań, każde dokładnie 5 odpowiedzi (bierzemy pierwsze 10)
async function pollSetupCheck(gid) {
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord")
    .eq("game_id", gid)
    .order("ord", { ascending: true });

  if (qErr) return { ok: false, reason: "Błąd wczytywania pytań." };
  if (!qs || qs.length < RULES.QN) return { ok: false, reason: `Za mało pytań: ${qs?.length || 0} / ${RULES.QN}.` };

  const ten = qs.slice(0, RULES.QN);

  for (const q of ten) {
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id")
      .eq("question_id", q.id);

    if (aErr) return { ok: false, reason: `Błąd wczytywania odpowiedzi (pytanie #${q.ord}).` };
    if (!ans || ans.length !== RULES.AN) return { ok: false, reason: `Pytanie #${q.ord} ma ${ans?.length || 0} / ${RULES.AN} odpowiedzi.` };
  }

  return { ok: true, reason: "" };
}

function setLinkUi(on) {
  dis(btnCopy, !on);
  dis(btnOpen, !on);
  dis(btnQrSmall, !on);
  dis(btnOpenQr, !on);
  if (!on && qrBox) qrBox.innerHTML = "";
}

async function previewVotes() {
  if (!votesEl) return;

  votesEl.style.display = "";
  votesEl.textContent = "Ładuję…";

  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });

  if (qErr) { votesEl.textContent = "Błąd wczytywania pytań."; return; }

  const ten = (qs || []).slice(0, RULES.QN);
  let out = [];

  for (const q of ten) {
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id,ord,text")
      .eq("question_id", q.id)
      .order("ord", { ascending: true });

    if (aErr) { out.push(`Q${q.ord}: błąd odpowiedzi`); out.push(""); continue; }

    const { data: sess, error: sErr } = await sb()
      .from("poll_sessions")
      .select("id,created_at")
      .eq("game_id", gameId)
      .eq("question_id", q.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) { out.push(`Q${q.ord}: błąd sesji`); out.push(""); continue; }

    const sid = sess?.id;
    const counts = new Map();
    (ans || []).forEach(a => counts.set(a.id, 0));

    if (sid) {
      const { data: votes, error: vErr } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sid);

      if (!vErr) {
        for (const v of (votes || [])) {
          if (counts.has(v.answer_id)) counts.set(v.answer_id, counts.get(v.answer_id) + 1);
        }
      }
    }

    out.push(`Q${q.ord}: ${q.text}`);
    for (const a of (ans || [])) out.push(`  - ${a.text}: ${counts.get(a.id) || 0} głosów`);
    out.push("");
  }

  votesEl.textContent = out.join("\n").trim() || "Brak danych.";
}

async function refresh() {
  if (!gameId) {
    show(cardMain, false);
    show(cardEmpty, true);
    setMsg("Brak parametru id.");
    return;
  }

  game = await loadGame();

  if (game.kind !== "poll") {
    show(cardMain, false);
    show(cardEmpty, true);
    setMsg("To nie jest gra sondażowa.");
    return;
  }

  setChips(game);
  show(cardEmpty, false);
  show(cardMain, true);

  txt(gName, game.name || "Sondaż");
  txt(gMeta, "Link i QR pojawiają się tylko gdy sondaż jest OTWARTY i gra spełnia zasady (10 pytań, 5 odpowiedzi).");

  val(pollLinkEl, "");
  setLinkUi(false);

  const st = game.status || "draft";
  const chk = await pollSetupCheck(game.id);

  dis(btnStart, !chk.ok || st === "poll_open");
  dis(btnClose, st !== "poll_open");
  dis(btnReopen, !chk.ok || st !== "ready");

  if (st === "poll_open" && chk.ok) {
    const link = pollLink(game);
    val(pollLinkEl, link);
    setLinkUi(true);
    await renderSmallQr(link);
    setMsg("");
  } else {
    setLinkUi(false);
    if (!chk.ok) setMsg(chk.reason);
    else if (st === "ready") setMsg("Sondaż jest zamknięty (wyniki policzone). Możesz go otworzyć ponownie.");
    else setMsg("Sondaż jest nieaktywny — uruchom go, żeby pokazać link i QR.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  txt(who, u?.email || "—");

  on(btnBack, "click", () => (location.href = "builder.html"));
  on(btnLogout, "click", async () => { await signOut(); location.href = "index.html"; });

  on(btnCopy, "click", async () => {
    if (!pollLinkEl?.value) return;
    try { await navigator.clipboard.writeText(pollLinkEl.value); setMsg("Skopiowano link sondażu."); }
    catch { setMsg("Nie udało się skopiować."); }
  });

  on(btnOpen, "click", () => {
    if (!pollLinkEl?.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  on(btnQrSmall, "click", async () => {
    if (!pollLinkEl?.value) return;
    await openInlineQr(pollLinkEl.value);
  });

  on(btnOpenQr, "click", () => {
    if (!pollLinkEl?.value) return;
    const u = new URL("poll-qr.html", location.href);
    u.searchParams.set("url", pollLinkEl.value);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  });

  on(btnCloseQr, "click", () => show(qrOverlay, false));
  on(qrOverlay, "click", (e) => { if (e.target === qrOverlay) show(qrOverlay, false); });

  on(btnStart, "click", async () => {
    if (!game) return;

    const chk = await pollSetupCheck(gameId);
    if (!chk.ok) { setMsg(chk.reason); return; }

    const ok = await confirmModal({
      title: "Uruchomić sondaż?",
      text: `Uruchomić sondaż dla "${game.name}"?`,
      okText: "Uruchom",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
      setMsg("Sondaż uruchomiony.");
      await refresh();
    } catch (e) {
      console.error("[polls] open error:", e);
      alert("Nie udało się uruchomić sondażu. Sprawdź konsolę.");
    }
  });

  on(btnReopen, "click", async () => {
    if (!game) return;

    const chk = await pollSetupCheck(gameId);
    if (!chk.ok) { setMsg(chk.reason); return; }

    const ok = await confirmModal({
      title: "Otworzyć ponownie?",
      text: "Otworzyć sondaż ponownie? Utworzy nową sesję głosowania (stare głosy zostają w historii).",
      okText: "Otwórz ponownie",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
      setMsg("Sondaż otwarty ponownie.");
      await refresh();
    } catch (e) {
      console.error("[polls] reopen error:", e);
      alert("Nie udało się otworzyć ponownie. Sprawdź konsolę.");
    }
  });

  on(btnClose, "click", async () => {
    if (!game) return;

    const ok = await confirmModal({
      title: "Zakończyć sondaż?",
      text: "Zamknąć sondaż i przeliczyć punkty do 100 (0 głosów => min 1 pkt)?",
      okText: "Zakończ",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await sb().rpc("poll_close_and_normalize", { p_game_id: gameId, p_key: game.share_key_poll });
      setMsg("Sondaż zamknięty. Gra gotowa do zagrania.");
      await refresh();
    } catch (e) {
      console.error("[polls] close error:", e);
      alert("Nie udało się zamknąć sondażu. Sprawdź konsolę.");
    }
  });

  on(btnPreview, "click", async () => {
    if (!votesEl) return;
    if (votesEl.style.display === "none") await previewVotes();
    else votesEl.style.display = "none";
  });

  await refresh();
});
