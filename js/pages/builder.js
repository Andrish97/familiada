// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

/* ===== DOM ===== */
const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

const btnNew = document.getElementById("btnNew");      // (opcjonalne)
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const btnExport = document.getElementById("btnExport"); // (opcjonalne)
const btnImport = document.getElementById("btnImport"); // (opcjonalne)

const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

const importOverlay = document.getElementById("importOverlay");
const importFile = document.getElementById("importFile");
const btnImportFile = document.getElementById("btnImportFile");
const btnImportJson = document.getElementById("btnImportJson");
const btnCancelImport = document.getElementById("btnCancelImport");
const importTa = document.getElementById("importTa");
const importMsg = document.getElementById("importMsg");

/* ===== state ===== */
let currentUser = null;
let games = [];
let selectedId = null;

// cache walidacji, żeby nie mielić bazy co klik
let selectedMeta = {
  loaded: false,
  kind: null,        // "fixed" | "poll"
  canPlay: false,
  canPoll: false,
  reasonPlay: "",
  reasonPoll: "",
};

/* ===== helpers ===== */
const QN_MIN = 10;
const AN_REQ = 5;

function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setImportMsg(t) {
  if (!importMsg) return;
  importMsg.textContent = t || "";
}

function safeDisable(el, disabled) {
  if (!el) return;
  el.disabled = !!disabled;
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readFileAsText(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
    r.readAsText(file);
  });
}

/* ===== payload normalize / validate ===== */
function normalizeImportedPayload(raw) {
  // Akceptujemy:
  // { game:{name, kind}, questions:[{ord,text,answers:[{ord,text,fixed_points}]}] }
  const p = raw || {};
  const g = p.game || {};
  const kind = (String(g.kind || "").toLowerCase() === "poll") ? "poll" : "fixed";
  const name = String(g.name || "Zaimportowana Familiada").slice(0, 80) || "Zaimportowana Familiada";

  const qs = Array.isArray(p.questions) ? p.questions : [];

  const outQs = [];
  for (let i = 0; i < QN_MIN; i++) {
    const srcQ = qs[i] || {};
    const qText = String(srcQ.text || `Pytanie ${i + 1}`).slice(0, 200);

    const srcA = Array.isArray(srcQ.answers) ? srcQ.answers : [];
    const answers = [];

    for (let j = 0; j < AN_REQ; j++) {
      const a = srcA[j] || {};
      const aText = String(a.text || `ODP ${j + 1}`).slice(0, 17);

      let pts = 0;
      if (kind === "fixed") {
        const n = Number(a.fixed_points);
        pts = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 0;
      }

      answers.push({
        ord: j + 1,
        text: aText || `ODP ${j + 1}`,
        fixed_points: (kind === "fixed") ? pts : null,
      });
    }

    outQs.push({
      ord: i + 1,
      text: qText || `Pytanie ${i + 1}`,
      mode: (kind === "poll") ? "poll" : "fixed",
      answers,
    });
  }

  return { game: { name, kind }, questions: outQs };
}

/* ===== Supabase reads ===== */
async function listGames() {
  // U Ciebie games nie zawsze ma kind/status — więc bierzemy minimum.
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,share_key_poll,owner_id")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadQuestions(gameId) {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadAnswers(qid) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function ensureLive(gameId) {
  const { data } = await sb().from("live_state").select("game_id").eq("game_id", gameId).maybeSingle();
  if (data?.game_id) return;
  await sb().from("live_state").insert({ game_id: gameId });
}

/* ===== create/delete ===== */
async function createGame(kind) {
  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name: kind === "poll" ? "Nowa Familiada (Sondaż)" : "Nowa Familiada",
      owner_id: currentUser.id,
    })
    .select("*")
    .single();

  if (error) throw error;

  await ensureLive(game.id);

  // od razu 10 pytań + 5 odpowiedzi
  for (let i = 1; i <= QN_MIN; i++) {
    const { data: q, error: qErr } = await sb()
      .from("questions")
      .insert({
        game_id: game.id,
        ord: i,
        text: `Pytanie ${i}`,
        mode: kind === "poll" ? "poll" : "fixed",
      })
      .select("*")
      .single();
    if (qErr) throw qErr;

    for (let j = 1; j <= AN_REQ; j++) {
      const fp = (kind === "fixed") ? 0 : null;
      const { error: aErr } = await sb()
        .from("answers")
        .insert({
          question_id: q.id,
          ord: j,
          text: `ODP ${j}`,
          fixed_points: fp,
        });
      if (aErr) throw aErr;
    }
  }

  return game;
}

async function deleteGame(game) {
  const ok = await confirmModal({
    title: "Usuń Familiadę",
    text: `Na pewno usunąć "${game.name}"? Tego nie da się łatwo odkręcić.`,
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  const { error } = await sb().from("games").delete().eq("id", game.id);
  if (error) {
    console.error("[builder] delete error:", error);
    alert("Nie udało się usunąć. Sprawdź konsolę.");
  }
}

/* ===== kind inference ===== */
function guessKindFromQuestions(qs) {
  // jeśli jakiekolwiek pytanie ma poll -> traktujemy jako sondażową
  return (qs || []).some((q) => q.mode === "poll") ? "poll" : "fixed";
}

/* ===== readiness checks ===== */
async function computeMetaForGame(gameId) {
  // Zasady:
  // - min 10 pytań
  // - 5 odpowiedzi na pytanie
  // - fixed: suma pkt <= 100, pkt 0..100
  // - poll: żeby GRAĆ, fixed_points muszą być policzone (liczby) — tzn po zamknięciu sondażu

  const qs = await loadQuestions(gameId);
  const kind = guessKindFromQuestions(qs);

  if (qs.length < QN_MIN) {
    return {
      kind,
      canPlay: false,
      canPoll: (kind === "poll"), // sondaż można przygotować, ale i tak brak pytań blokujemy link w polls.html
      reasonPlay: `Za mało pytań (${qs.length}/${QN_MIN}).`,
      reasonPoll: `Za mało pytań (${qs.length}/${QN_MIN}).`,
    };
  }

  // walidujemy odpowiedzi
  for (const q of qs.slice(0, QN_MIN)) {
    const ans = await loadAnswers(q.id);

    if (ans.length !== AN_REQ) {
      const r = `Pytanie #${q.ord}: liczba odpowiedzi = ${ans.length} (wymagane ${AN_REQ}).`;
      return {
        kind,
        canPlay: false,
        canPoll: false,
        reasonPlay: r,
        reasonPoll: r,
      };
    }

    if (kind === "fixed") {
      let sum = 0;
      for (const a of ans) {
        const n = Number(a.fixed_points);
        if (!Number.isFinite(n)) {
          return {
            kind,
            canPlay: false,
            canPoll: false,
            reasonPlay: `Pytanie #${q.ord}: punkty muszą być liczbą.`,
            reasonPoll: "—",
          };
        }
        const pts = Math.max(0, Math.min(100, Math.floor(n)));
        sum += pts;
      }
      if (sum > 100) {
        return {
          kind,
          canPlay: false,
          canPoll: false,
          reasonPlay: `Pytanie #${q.ord}: suma punktów = ${sum} (max 100).`,
          reasonPoll: "—",
        };
      }
    } else {
      // poll: do grania wymagamy policzonych fixed_points (czyli liczby)
      // (po zamknięciu sondażu u Ciebie to się zapisuje do answers.fixed_points)
      for (const a of ans) {
        const n = Number(a.fixed_points);
        if (!Number.isFinite(n)) {
          return {
            kind,
            canPlay: false,
            canPoll: true,
            reasonPlay: "Sondaż nie jest zamknięty / wyniki nie są policzone (brak punktów).",
            reasonPoll: "",
          };
        }
      }
    }
  }

  return {
    kind,
    canPlay: true,
    canPoll: (kind === "poll"),
    reasonPlay: "",
    reasonPoll: "",
  };
}

/* ===== UI ===== */
function setActionState() {
  const has = !!selectedId;

  // gdy brak wyboru: wszystko wyszarzone
  safeDisable(btnEdit, !has);
  safeDisable(btnPlay, !has || !selectedMeta.canPlay);
  safeDisable(btnExport, !has);
  safeDisable(btnPoll, !has || !selectedMeta.canPoll);

  // dodatkowo: jeśli jest zaznaczone ale niegotowe -> dalej blokada
  if (has && selectedMeta.loaded) {
    safeDisable(btnPlay, !selectedMeta.canPlay);
    safeDisable(btnPoll, !selectedMeta.canPoll);
  }
}

function cardGame(g) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div class="x" title="Usuń">✕</div>
    <div class="name"></div>
    <div class="meta"></div>
  `;
  el.querySelector(".name").textContent = g.name;
  el.querySelector(".meta").textContent = "Kliknij, aby zaznaczyć";

  el.addEventListener("click", async () => {
    selectedId = g.id;
    selectedMeta = { loaded: false, kind: null, canPlay: false, canPoll: false, reasonPlay: "", reasonPoll: "" };
    render();
    await refreshSelectedMeta();
  });

  el.querySelector(".x").addEventListener("click", async (e) => {
    e.stopPropagation();
    await deleteGame(g);
    await refresh();
  });

  return el;
}

function render() {
  grid.innerHTML = "";
  for (const g of games) {
    const el = cardGame(g);
    if (g.id === selectedId) el.classList.add("selected");
    grid.appendChild(el);
  }
  setActionState();
}

async function refreshSelectedMeta() {
  const sel = games.find((g) => g.id === selectedId);
  if (!sel) {
    selectedMeta = { loaded: false, kind: null, canPlay: false, canPoll: false, reasonPlay: "", reasonPoll: "" };
    setActionState();
    return;
  }

  try {
    const meta = await computeMetaForGame(sel.id);
    selectedMeta = { loaded: true, ...meta };
  } catch (e) {
    console.error("[builder] meta err:", e);
    selectedMeta = {
      loaded: true,
      kind: null,
      canPlay: false,
      canPoll: false,
      reasonPlay: "Nie udało się sprawdzić gry (błąd bazy).",
      reasonPoll: "Nie udało się sprawdzić gry (błąd bazy).",
    };
  }

  setActionState();
}

async function refresh() {
  games = await listGames();
  if (selectedId && !games.some((g) => g.id === selectedId)) {
    selectedId = null;
    selectedMeta = { loaded: false, kind: null, canPlay: false, canPoll: false, reasonPlay: "", reasonPoll: "" };
  }
  render();
  if (selectedId) await refreshSelectedMeta();
  else setActionState();
}

/* ===== Export ===== */
async function doExportSelected() {
  const sel = games.find((g) => g.id === selectedId);
  if (!sel) return;

  const qs = await loadQuestions(sel.id);
  const kind = guessKindFromQuestions(qs);

  const payload = {
    game: { name: sel.name, kind },
    questions: [],
  };

  // eksportujemy min 10 (albo ile jest, ale trzymamy porządek)
  for (const q of qs) {
    const ans = await loadAnswers(q.id);
    payload.questions.push({
      ord: q.ord,
      text: q.text,
      answers: ans.map((a) => ({
        ord: a.ord,
        text: a.text,
        fixed_points: a.fixed_points,
      })),
    });
  }

  const safe = sel.name.replace(/[^\w\d\- ]+/g, "").trim().slice(0, 40) || "familiada";
  downloadJson(`${safe}.json`, payload);
}

/* ===== Import ===== */
async function doImportPayload(rawObj) {
  const payload = normalizeImportedPayload(rawObj);

  const { data: game, error } = await sb()
    .from("games")
    .insert({ name: payload.game.name, owner_id: currentUser.id })
    .select("*")
    .single();
  if (error) throw error;

  try {
    await ensureLive(game.id);

    for (const q of payload.questions) {
      const { data: qRow, error: qErr } = await sb()
        .from("questions")
        .insert({ game_id: game.id, ord: q.ord, text: q.text, mode: q.mode })
        .select("*")
        .single();
      if (qErr) throw qErr;

      for (const a of q.answers) {
        const fp = (payload.game.kind === "fixed") ? (Number(a.fixed_points) || 0) : null;
        const { error: aErr } = await sb()
          .from("answers")
          .insert({
            question_id: qRow.id,
            ord: a.ord,
            text: a.text,
            fixed_points: fp,
          });
        if (aErr) throw aErr;
      }
    }

    return game;
  } catch (e) {
    // rollback gry, żeby nie zostawał “pustak”
    await sb().from("games").delete().eq("id", game.id);
    throw e;
  }
}

/* ===== Modale ===== */
function openTypeModal() { show(typeOverlay, true); }
function closeTypeModal() { show(typeOverlay, false); }

function openImportModal() {
  if (!importOverlay) return;
  importTa && (importTa.value = "");
  importFile && (importFile.value = "");
  setImportMsg("");
  show(importOverlay, true);
}
function closeImportModal() { show(importOverlay, false); }

function bindModalClose(overlayEl, closeFn) {
  if (!overlayEl) return;

  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeFn();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayEl.style.display !== "none") closeFn();
  });
}

/* ===== Main ===== */
document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  // modale: zamykanie klik tło + ESC
  bindModalClose(typeOverlay, closeTypeModal);
  bindModalClose(importOverlay, closeImportModal);

  btnNew?.addEventListener("click", openTypeModal);
  btnCancelType?.addEventListener("click", closeTypeModal);

  btnCreateFixed?.addEventListener("click", async () => {
    closeTypeModal();
    try {
      await createGame("fixed");
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  btnCreatePoll?.addEventListener("click", async () => {
    closeTypeModal();
    try {
      await createGame("poll");
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  btnEdit?.addEventListener("click", () => {
    if (!selectedId) return;
    location.href = `editor.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPlay?.addEventListener("click", async () => {
    if (!selectedId) return;
    if (!selectedMeta.loaded) await refreshSelectedMeta();
    if (!selectedMeta.canPlay) {
      alert(selectedMeta.reasonPlay || "Nie można uruchomić gry.");
      return;
    }
    location.href = `control.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPoll?.addEventListener("click", async () => {
    if (!selectedId) return;
    if (!selectedMeta.loaded) await refreshSelectedMeta();

    if (!selectedMeta.canPoll) {
      alert(selectedMeta.reasonPoll || "To nie jest Familiada sondażowa.");
      return;
    }

    // twardo: nie otwieramy polls.html dla pustaka / niezgodnej struktury
    // (meta już to sprawdził)
    location.href = `polls.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnExport?.addEventListener("click", async () => {
    if (!selectedId) return;
    try {
      await doExportSelected();
    } catch (e) {
      console.error(e);
      alert("Nie udało się wyeksportować. Sprawdź konsolę.");
    }
  });

  btnImport?.addEventListener("click", openImportModal);
  btnCancelImport?.addEventListener("click", closeImportModal);

  btnImportFile?.addEventListener("click", async () => {
    try {
      const f = importFile?.files?.[0];
      if (!f) {
        setImportMsg("Wybierz plik JSON.");
        return;
      }
      const txt = await readFileAsText(f);
      importTa.value = txt;
      setImportMsg("Plik wczytany. Kliknij Importuj.");
    } catch (e) {
      console.error(e);
      setImportMsg("Nie udało się wczytać pliku.");
    }
  });

  btnImportJson?.addEventListener("click", async () => {
    try {
      const txt = importTa?.value || "";
      if (!txt.trim()) {
        setImportMsg("Wklej JSON albo wczytaj plik.");
        return;
      }

      let obj;
      try {
        obj = JSON.parse(txt);
      } catch {
        setImportMsg("Błąd importu: JSON ma złą składnię.");
        return;
      }

      const g = await doImportPayload(obj);

      closeImportModal();
      await refresh();

      selectedId = g.id;
      selectedMeta = { loaded: false, kind: null, canPlay: false, canPoll: false, reasonPlay: "", reasonPoll: "" };
      render();
      await refreshSelectedMeta();
    } catch (e) {
      console.error(e);
      setImportMsg("Błąd importu: problem z bazą lub z danymi.");
    }
  });

  // stan początkowy przycisków: wyszarzone
  selectedId = null;
  selectedMeta = { loaded: false, kind: null, canPlay: false, canPoll: false, reasonPlay: "", reasonPoll: "" };
  setActionState();

  await refresh();
});
