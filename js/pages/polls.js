// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const msg = document.getElementById("msg");

const cardMain = document.getElementById("cardMain");
const cardEmpty = document.getElementById("cardEmpty");

const chipKind = document.getElementById("chipKind");
const chipStatus = document.getElementById("chipStatus");

const gName = document.getElementById("gName");
const gMeta = document.getElementById("gMeta");
const pollLinkEl = document.getElementById("pollLink");

const btnCopy = document.getElementById("btnCopy");
const btnOpen = document.getElementById("btnOpen");
const btnStart = document.getElementById("btnStart");
const btnClose = document.getElementById("btnClose");
const btnPreview = document.getElementById("btnPreview");
const votesEl = document.getElementById("votes");

// opcjonalnie: jeśli masz miejsce na QR w HTML
const qrImg = document.getElementById("qrImg"); // <img id="qrImg" ...>

let game = null;

function setMsg(t) {
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 1600);
}

function pollLink(g) {
  const base = new URL("poll.html", location.href);
  base.searchParams.set("id", g.id);
  base.searchParams.set("key", g.share_key_poll);
  return base.toString();
}

function setChips(g) {
  chipKind.textContent = g.kind === "poll" ? "SONDAŻOWA" : "LOKALNA";

  chipStatus.className = "chip status";
  const st = g.status || "draft";
  chipStatus.textContent = st.toUpperCase();

  if (st === "ready") chipStatus.classList.add("ok");
  else if (st === "poll_open") chipStatus.classList.add("warn");
  else chipStatus.classList.add("bad");
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

async function updateGame(patch) {
  const { error } = await sb().from("games").update(patch).eq("id", gameId);
  if (error) throw error;
}

async function loadQuestionsAndAnswers() {
  const { data: qsData, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;

  const qsList = qsData || [];
  const out = [];

  for (const q of qsList) {
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id,ord,text,fixed_points,question_id")
      .eq("question_id", q.id)
      .order("ord", { ascending: true });
    if (aErr) throw aErr;

    out.push({ ...q, answers: ans || [] });
  }

  return out;
}

function validatePollConfig(qsList) {
  if (!qsList.length) return { ok: false, reason: "Ta Familiada nie ma żadnych pytań." };

  // wg Twoich założeń (min 5 pytań finałowych itd. później),
  // tu pilnujemy MIN 5 pytań w zestawie sondażowym.
  if (qsList.length < 5) {
    return { ok: false, reason: `Sondaż wymaga min. 5 pytań. Masz: ${qsList.length}.` };
  }

  for (const q of qsList) {
    const n = q.answers.length;
    if (n < 2) return { ok: false, reason: `Pytanie #${q.ord} ma za mało odpowiedzi (${n}). Min 2.` };
    if (n > 5) return { ok: false, reason: `Pytanie #${q.ord} ma za dużo odpowiedzi (${n}). Max 5.` };
  }

  return { ok: true, reason: "" };
}

async function openPoll() {
  const qsList = await loadQuestionsAndAnswers();
  const chk = validatePollConfig(qsList);
  if (!chk.ok) throw new Error(chk.reason);

  await updateGame({ status: "poll_open", poll_opened_at: new Date().toISOString(), poll_closed_at: null });
}

function normalizeTo100(votesByAnswerId, answers) {
  const votes = answers.map(a => ({ id: a.id, ord: a.ord, v: votesByAnswerId.get(a.id) || 0 }));
  const total = votes.reduce((s, x) => s + x.v, 0);

  if (answers.length === 0) return [];

  // brak głosów -> równo
  if (total === 0) {
    const n = answers.length;
    const base = Math.floor(100 / n);
    let rest = 100 - base * n;
    return votes.map(x => {
      const add = rest > 0 ? 1 : 0;
      if (rest > 0) rest--;
      return { id: x.id, p: base + add };
    });
  }

  // largest remainder
  const exact = votes.map(x => {
    const p = (x.v / total) * 100;
    const f = Math.floor(p);
    return { id: x.id, floor: f, frac: p - f };
  });

  let sumFloors = exact.reduce((s, x) => s + x.floor, 0);
  let remaining = 100 - sumFloors;

  exact.sort((a, b) => b.frac - a.frac);

  const out = new Map();
  exact.forEach(x => out.set(x.id, x.floor));

  let i = 0;
  while (remaining > 0) {
    const id = exact[i % exact.length].id;
    out.set(id, (out.get(id) || 0) + 1);
    remaining--;
    i++;
  }

  return answers.map(a => ({ id: a.id, p: out.get(a.id) || 0 }));
}

async function closePollAndNormalize() {
  const qsList = await loadQuestionsAndAnswers();
  const chk = validatePollConfig(qsList);
  if (!chk.ok) throw new Error(chk.reason);

  for (const q of qsList) {
    // policz głosy per answer z poll_votes
    const { data: votes, error: vErr } = await sb()
      .from("poll_votes")
      .select("answer_id")
      .eq("game_id", gameId)
      .eq("question_id", q.id);
    if (vErr) throw vErr;

    const counts = new Map();
    q.answers.forEach(a => counts.set(a.id, 0));

    for (const v of (votes || [])) {
      if (counts.has(v.answer_id)) counts.set(v.answer_id, (counts.get(v.answer_id) || 0) + 1);
    }

    const norm = normalizeTo100(counts, q.answers);

    // zapis fixed_points
    for (const row of norm) {
      const { error: uErr } = await sb().from("answers").update({ fixed_points: row.p }).eq("id", row.id);
      if (uErr) throw uErr;
    }
  }

  await updateGame({ status: "ready", poll_closed_at: new Date().toISOString() });
}

async function previewVotes() {
  votesEl.style.display = "";
  votesEl.textContent = "Ładuję…";

  const qsList = await loadQuestionsAndAnswers();

  let out = [];
  for (const q of qsList) {
    const { data: votes, error: vErr } = await sb()
      .from("poll_votes")
      .select("answer_id")
      .eq("game_id", gameId)
      .eq("question_id", q.id);
    if (vErr) throw vErr;

    const counts = new Map();
    q.answers.forEach(a => counts.set(a.id, 0));
    for (const v of (votes || [])) {
      if (counts.has(v.answer_id)) counts.set(v.answer_id, (counts.get(v.answer_id) || 0) + 1);
    }

    out.push(`Q${q.ord}: ${q.text}`);
    for (const a of q.answers) {
      out.push(`  - ${a.text}: ${counts.get(a.id) || 0} głosów`);
    }
    out.push("");
  }

  votesEl.textContent = out.join("\n").trim() || "Brak danych.";
}

async function refresh() {
  if (!gameId) {
    cardMain.style.display = "none";
    cardEmpty.style.display = "";
    return;
  }

  game = await loadGame();

  if (game.kind !== "poll") {
    cardMain.style.display = "none";
    cardEmpty.style.display = "";
    setMsg("To nie jest gra sondażowa.");
    return;
  }

  setChips(game);

  cardEmpty.style.display = "none";
  cardMain.style.display = "";

  gName.textContent = game.name;
  gMeta.textContent = "Link sondażu jest unikalny dla tej Familiady. Po zamknięciu przestaje przyjmować głosy.";

  const link = pollLink(game);
  pollLinkEl.value = link;

  // QR (jeśli masz <img id="qrImg">)
  if (qrImg) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
    qrImg.src = qrUrl;
    qrImg.alt = "QR do sondażu";
  }

  const st = game.status || "draft";
  btnStart.disabled = (st === "poll_open" || st === "ready");
  btnClose.disabled = (st !== "poll_open");
}

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  who.textContent = u?.email || "—";

  btnBack.addEventListener("click", () => (location.href = "builder.html"));
  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pollLinkEl.value);
      setMsg("Skopiowano link sondażu.");
    } catch {
      setMsg("Nie udało się skopiować.");
    }
  });

  btnOpen.addEventListener("click", () => {
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnStart.addEventListener("click", async () => {
    if (!game) return;

    const ok = await confirmModal({
      title: "Uruchomić sondaż?",
      text: `Uruchomić sondaż dla "${game.name}"? Link zacznie przyjmować głosy.`,
      okText: "Uruchom",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await openPoll();
      setMsg("Sondaż uruchomiony.");
      await refresh();
    } catch (e) {
      setMsg(e?.message || "Nie udało się uruchomić.");
    }
  });

  btnClose.addEventListener("click", async () => {
    if (!game) return;

    const ok = await confirmModal({
      title: "Zakończyć sondaż?",
      text: `Zamknąć sondaż i przeliczyć wyniki do 100 dla każdego pytania?`,
      okText: "Zakończ",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await closePollAndNormalize();
      setMsg("Sondaż zamknięty. Gra gotowa do zagrania.");
      await refresh();
    } catch (e) {
      setMsg(e?.message || "Nie udało się zamknąć sondażu.");
    }
  });

  btnPreview.addEventListener("click", async () => {
    if (votesEl.style.display === "none" || !votesEl.style.display) {
      try {
        await previewVotes();
      } catch {
        votesEl.style.display = "";
        votesEl.textContent = "Nie udało się wczytać podglądu.";
      }
    } else {
      votesEl.style.display = "none";
    }
  });

  await refresh();
});
