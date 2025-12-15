// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

const btnNew = document.getElementById("btnNew");      // jeśli nie masz w HTML, usuń te 2 linie + event
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const btnExport = document.getElementById("btnExport"); // jeśli nie masz w HTML, usuń
const btnImport = document.getElementById("btnImport"); // jeśli nie masz w HTML, usuń

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

let currentUser = null;
let games = [];
let selectedId = null;

// zasady (Twoje):
const QN = 10;
const AN = 5;

function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setImportMsg(t) {
  if (!importMsg) return;
  importMsg.textContent = t || "";
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

function normalizeImportedPayload(raw) {
  const p = raw || {};
  const g = p.game || {};
  const kind = (g.kind === "poll") ? "poll" : "fixed";
  const name = String(g.name || "Zaimportowana Familiada").slice(0, 80);

  const qs = Array.isArray(p.questions) ? p.questions : [];

  const outQs = [];
  for (let i = 0; i < QN; i++) {
    const srcQ = qs[i] || {};
    const qText = String(srcQ.text || `Pytanie ${i + 1}`).slice(0, 200);

    const srcA = Array.isArray(srcQ.answers) ? srcQ.answers : [];
    const answers = [];

    for (let j = 0; j < AN; j++) {
      const a = srcA[j] || {};
      const aText = String(a.text || `ODP ${j + 1}`).slice(0, 17);

      let pts = 0;
      if (kind === "fixed") {
        const n = Number(a.fixed_points);
        pts = Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
      }

      answers.push({
        ord: j + 1,
        text: aText,
        fixed_points: pts, // UWAGA: zawsze liczba (zero też ok)
      });
    }

    outQs.push({
      ord: i + 1,
      text: qText,
      mode: (kind === "poll") ? "poll" : "fixed",
      answers,
    });
  }

  return { game: { name, kind }, questions: outQs };
}

async function listGames() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at")
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
  const { data } = await sb()
    .from("live_state")
    .select("game_id")
    .eq("game_id", gameId)
    .maybeSingle();

  if (data?.game_id) return;

  const { error } = await sb().from("live_state").insert({ game_id: gameId });
  if (error) throw error;
}

function guessKindFromQuestions(qs) {
  return (qs || []).some(q => q.mode === "poll") ? "poll" : "fixed";
}

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

  // 10 pytań x 5 odpowiedzi, zawsze
  for (let i = 1; i <= QN; i++) {
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

    // UWAGA: fixed_points NIGDY null (bo Supabase często ma NOT NULL)
    for (let j = 1; j <= AN; j++) {
      const payload = {
        question_id: q.id,
        ord: j,
        text: `ODP ${j}`,
        fixed_points: 0,
      };
      const { error: aErr } = await sb().from("answers").insert(payload);
      if (aErr) throw aErr;
    }
  }

  return game;
}

async function deleteGame(game) {
  const ok = await confirmModal({
    title: "Usuń Familiadę",
    text: `Na pewno usunąć "${game.name}"?`,
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

function setActionState(kind = null) {
  const has = !!selectedId;

  if (btnEdit) btnEdit.disabled = !has;
  if (btnPlay) btnPlay.disabled = !has;
  if (btnExport) btnExport.disabled = !has;

  // Poll tylko dla sondażowej
  if (btnPoll) btnPoll.disabled = !has || (kind && kind !== "poll");
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
    render();

    // po wyborze dociągnij kind i ustaw przyciski
    try {
      const qs = await loadQuestions(selectedId);
      const kind = guessKindFromQuestions(qs);
      setActionState(kind);
    } catch {
      setActionState(null);
    }
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

  // na starcie: nic nie wybrane -> wszystko disabled
  setActionState(null);
}

async function refresh() {
  games = await listGames();
  if (selectedId && !games.some(g => g.id === selectedId)) selectedId = null;

  render();

  // jeśli jest zaznaczona gra -> ustaw kind
  if (selectedId) {
    try {
      const qs = await loadQuestions(selectedId);
      const kind = guessKindFromQuestions(qs);
      setActionState(kind);
    } catch {
      setActionState(null);
    }
  }
}

async function doExportSelected() {
  const sel = games.find(g => g.id === selectedId);
  if (!sel) return;

  const qs = await loadQuestions(sel.id);
  const kind = guessKindFromQuestions(qs);

  const payload = {
    game: { name: sel.name, kind },
    questions: [],
  };

  for (const q of qs) {
    const ans = await loadAnswers(q.id);
    payload.questions.push({
      ord: q.ord,
      text: q.text,
      mode: q.mode,
      answers: ans.map(a => ({
        ord: a.ord,
        text: a.text,
        fixed_points: Number(a.fixed_points) || 0,
      })),
    });
  }

  const safe = sel.name.replace(/[^\w\d\- ]+/g, "").trim().slice(0, 40) || "familiada";
  downloadJson(`${safe}.json`, payload);
}

async function doImportPayload(rawObj) {
  const payload = normalizeImportedPayload(rawObj);

  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name: payload.game.name,
      owner_id: currentUser.id,
    })
    .select("*")
    .single();
  if (error) throw error;

  await ensureLive(game.id);

  for (const q of payload.questions) {
    const { data: qRow, error: qErr } = await sb()
      .from("questions")
      .insert({
        game_id: game.id,
        ord: q.ord,
        text: q.text,
        mode: q.mode, // fixed/poll
      })
      .select("*")
      .single();
    if (qErr) throw qErr;

    for (const a of q.answers) {
      // UWAGA: fixed_points zawsze liczba, nigdy null (unika 400)
      const payloadA = {
        question_id: qRow.id,
        ord: a.ord,
        text: a.text,
        fixed_points: (payload.game.kind === "fixed") ? (Number(a.fixed_points) || 0) : 0,
      };

      const { error: aErr } = await sb().from("answers").insert(payloadA);
      if (aErr) throw aErr;
    }
  }

  return game;
}

/* ====== UI modale ====== */
function openTypeModal() { show(typeOverlay, true); }
function closeTypeModal() { show(typeOverlay, false); }

function openImportModal() {
  if (importTa) importTa.value = "";
  if (importFile) importFile.value = "";
  setImportMsg("");
  show(importOverlay, true);
}
function closeImportModal() { show(importOverlay, false); }

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  if (btnLogout) btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  if (btnNew) btnNew.addEventListener("click", openTypeModal);
  if (btnCancelType) btnCancelType.addEventListener("click", closeTypeModal);

  if (btnCreateFixed) btnCreateFixed."click", async () => {
    closeTypeModal();
    try {
      await createGame("fixed");
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  if (btnCreatePoll) btnCreatePoll.addEventListener("click", async () => {
    closeTypeModal();
    try {
      await createGame("poll");
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  if (btnEdit) btnEdit.addEventListener("click", () => {
    if (!selectedId) return;
    location.href = `editor.html?id=${encodeURIComponent(selectedId)}`;
  });

  if (btnPlay) btnPlay.addEventListener("click", () => {
    if (!selectedId) return;
    location.href = `control.html?id=${encodeURIComponent(selectedId)}`;
  });

  if (btnPlay) btnPoll.addEventListener("click", async () => {
    if (!selectedId) return;

    // twarda walidacja: tylko sondażowa
    try {
      const qs = await loadQuestions(selectedId);
      const kind = guessKindFromQuestions(qs);
      if (kind !== "poll") {
        alert("To nie jest Familiada sondażowa.");
        return;
      }
    } catch {
      alert("Nie udało się sprawdzić typu gry.");
      return;
    }

    location.href = `polls.html?id=${encodeURIComponent(selectedId)}`;
  });

  if (btnExport) {
    i(btnExport) btnExport.addEventListener("click", async () => {
      try {
        await doExportSelected();
      } catch (e) {
        console.error(e);
        alert("Nie udało się wyeksportować. Sprawdź konsolę.");
      }
    });
  }

  if (btnImport) btnImport.addEventListener("click", openImportModal);
  if (btnCancelImport) btnCancelImport.addEventListener("click", closeImportModal);

  if (btnImportFile) {
    if (btnImportFile) btnImportFile.addEventListener("click", async () => {
      try {
        const f = importFile?.files?.[0];
        if (!f) {
          setImportMsg("Wybierz plik JSON.");
          return;
        }
        const txt = await readFileAsText(f);
        if (importTa) importTa.value = txt;
        setImportMsg("Plik wczytany. Kliknij Importuj.");
      } catch (e) {
        console.error(e);
        setImportMsg("Nie udało się wczytać pliku.");
      }
    });
  }

  if (btnImportJson) {
    if (btnImportJson) btnImportJson.addEventListener("click", async () => {
      try {
        const txt = importTa?.value || "";
        if (!txt.trim()) {
          setImportMsg("Wklej JSON albo wczytaj plik.");
          return;
        }

        const obj = JSON.parse(txt);
        const g = await doImportPayload(obj);

        // zamknij + odśwież + zaznacz nową grę
        closeImportModal();
        await refresh();
        selectedId = g.id;
        await refresh(); // odśwież jeszcze raz dla kind
      } catch (e) {
        console.error("IMPORT ERROR:", e);
        setImportMsg("Błąd importu: nieprawidłowy JSON albo problem z bazą (sprawdź konsolę).");
      }
    });
  }

  await refresh();
});
