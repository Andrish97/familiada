// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { confirmModal } from "../core/modal.js";

import { exportGame, importGame, downloadJson } from "./builder-import-export.js";

import {
  KINDS,
  STATUS,
  loadGameBasic,
  canEnterEdit,
  validateGameReadyToPlay,
  validatePollEntry,
  validatePollReadyToOpen,
} from "../core/game-validate.js";

/* ================= DOM ================= */
const grid = document.getElementById("grid");
const who = document.getElementById("who");
const hint = document.getElementById("hint");

const btnLogout = document.getElementById("btnLogout");

const btnNew = document.getElementById("btnNew");
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");

// Tabs
const tabPollText = document.getElementById("tabPollText");
const tabPollPoints = document.getElementById("tabPollPoints");
const tabPrepared = document.getElementById("tabPrepared");

// Modal typu gry
const typeOverlay = document.getElementById("typeOverlay");
const btnCreatePollText = document.getElementById("btnCreatePollText");
const btnCreatePollPoints = document.getElementById("btnCreatePollPoints");
const btnCreatePrepared = document.getElementById("btnCreatePrepared");
const btnCancelType = document.getElementById("btnCancelType");

// Modal importu JSON
const importOverlay = document.getElementById("importOverlay");
const importFile = document.getElementById("importFile");
const btnImportFile = document.getElementById("btnImportFile");
const btnImportJson = document.getElementById("btnImportJson");
const btnCancelImport = document.getElementById("btnCancelImport");
const importTa = document.getElementById("importTa");
const importMsg = document.getElementById("importMsg");

/* ================= STATE ================= */
let currentUser = null;
let gamesAll = [];
let selectedId = null;

let activeTab = KINDS.PREPARED; // domyślnie (Preparowany)

/* ================= UI helpers ================= */
function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setHint(t) {
  if (!hint) return;
  hint.textContent = t || "";
}

function setImportMsg(t) {
  if (!importMsg) return;
  importMsg.textContent = t || "";
}

function openTypeModal() { show(typeOverlay, true); }
function closeTypeModal() { show(typeOverlay, false); }

function openImportModal() {
  if (importTa) importTa.value = "";
  if (importFile) importFile.value = "";
  setImportMsg("");
  show(importOverlay, true);
}
function closeImportModal() { show(importOverlay, false); }

function safeDownloadName(name) {
  const base = String(name || "familiada")
    .replace(/[^\w\d\- ]+/g, "")
    .trim()
    .slice(0, 40) || "familiada";
  return `${base}.json`;
}

function kindLabel(kind) {
  if (kind === KINDS.POLL_TEXT) return "TYPOWY SONDAŻ";
  if (kind === KINDS.POLL_POINTS) return "PUNKTACJA";
  if (kind === KINDS.PREPARED) return "PREPAROWANY";
  return String(kind || "—").toUpperCase();
}

function statusLabel(st) {
  const s = st || STATUS.DRAFT;
  if (s === STATUS.DRAFT) return "SZKIC";
  if (s === STATUS.POLL_OPEN) return "OTWARTY";
  if (s === STATUS.READY) return "ZAMKNIĘTY";
  return String(s).toUpperCase();
}

function setButtonsState({ hasSel, canEdit, canPlay, canPoll, canExport }) {
  if (btnEdit) btnEdit.disabled = !hasSel || !canEdit;
  if (btnPlay) btnPlay.disabled = !hasSel || !canPlay;
  if (btnPoll) btnPoll.disabled = !hasSel || !canPoll;
  if (btnExport) btnExport.disabled = !hasSel || !canExport;
}

/* ================= Tabs ================= */
function setActiveTab(kind) {
  activeTab = kind;

  tabPollText?.classList.toggle("active", kind === KINDS.POLL_TEXT);
  tabPollPoints?.classList.toggle("active", kind === KINDS.POLL_POINTS);
  tabPrepared?.classList.toggle("active", kind === KINDS.PREPARED);

  // jeśli zaznaczona gra nie pasuje do zakładki – odznacz
  const sel = gamesAll.find(g => g.id === selectedId);
  if (sel && sel.kind !== activeTab) selectedId = null;

  render();
  updateActionState();
}

/* ================= DB ================= */
async function listGames() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,kind,status")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function ensureLive(gameId) {
  // jeśli używasz live_state jak wcześniej — zostawiamy.
  // Jeśli nie masz tabeli, można bezpiecznie wywalić całą funkcję.
  try {
    const { data, error } = await sb()
      .from("live_state")
      .select("game_id")
      .eq("game_id", gameId)
      .maybeSingle();
    if (error) throw error;
    if (data?.game_id) return;

    const { error: insErr } = await sb().from("live_state").insert({ game_id: gameId });
    if (insErr) throw insErr;
  } catch {
    // celowo ignorujemy – żeby builder nie wywalał, jeśli live_state nie istnieje
  }
}

async function createGame(kind) {
  const name =
    kind === KINDS.POLL_TEXT ? "Nowa gra (Typowy sondaż)" :
    kind === KINDS.POLL_POINTS ? "Nowa gra (Punktacja)" :
    "Nowa gra (Preparowany)";

  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name,
      owner_id: currentUser.id,
      kind,
      status: STATUS.DRAFT,
    })
    .select("id,name,kind,status")
    .single();

  if (error) throw error;
  await ensureLive(game.id);
  return game;
}

async function deleteGame(game) {
  const ok = await confirmModal({
    title: "Usuń grę",
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

/**
 * Reset danych sondażowych przy wejściu do edycji ze stanu READY.
 * Minimalna wersja (bez dłubania w tabelach głosów):
 * - games.status => draft
 * - answers.fixed_points => 0 (żeby nie mieszać)
 */
async function resetPollForEditing(gameId) {
  const { error: gErr } = await sb()
    .from("games")
    .update({ status: STATUS.DRAFT })
    .eq("id", gameId);
  if (gErr) throw gErr;

  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id")
    .eq("game_id", gameId);

  if (qErr) throw qErr;

  const qIds = (qs || []).map(x => x.id);
  if (!qIds.length) return;

  const { error: aErr } = await sb()
    .from("answers")
    .update({ fixed_points: 0 })
    .in("question_id", qIds);

  if (aErr) throw aErr;
}

/* ================= Render ================= */
function cardGame(g) {
  const el = document.createElement("div");
  el.className = "card";

  el.innerHTML = `
    <div class="x" title="Usuń">⧗</div>
    <div class="name"></div>
    <div class="meta"></div>
  `;

  el.querySelector(".name").textContent = g.name || "—";
  el.querySelector(".meta").textContent = `${kindLabel(g.kind)} • ${statusLabel(g.status)}`;

  el.addEventListener("click", async () => {
    selectedId = g.id;
    render();
    await updateActionState();
  });

  el.querySelector(".x").addEventListener("click", async (e) => {
    e.stopPropagation();
    await deleteGame(g);
    await refresh();
  });

  return el;
}

function render() {
  if (!grid) return;
  grid.innerHTML = "";

  const games = (gamesAll || []).filter(g => (g.kind || "") === activeTab);

  for (const g of games) {
    const el = cardGame(g);
    if (g.id === selectedId) el.classList.add("selected");
    grid.appendChild(el);
  }

  setButtonsState({
    hasSel: !!selectedId,
    canEdit: false,
    canPlay: false,
    canPoll: false,
    canExport: false,
  });

  setHint("Kliknij kafelek, żeby go zaznaczyć.");
}

/* ================= Button logic ================= */
async function updateActionState() {
  const sel = gamesAll.find(g => g.id === selectedId) || null;
  if (!sel) {
    setButtonsState({ hasSel: false, canEdit: false, canPlay: false, canPoll: false, canExport: false });
    return;
  }

  let canExport = true;

  // EDYCJA
  const edit = canEnterEdit(sel);
  const canEdit = !!edit.ok;

  // GRA
  let canPlay = false;
  try {
    const chk = await validateGameReadyToPlay(sel.id);
    canPlay = !!chk.ok;
  } catch (e) {
    console.error("[builder] validateGameReadyToPlay error:", e);
  }

  // SONDAŻ (wejście na polls.html)
  let canPoll = false;
  try {
    const entry = await validatePollEntry(sel.id);
    if (entry.ok) {
      // przycisk ma sens, jeśli:
      // - status poll_open/ready => zawsze można wejść
      // - draft => tylko jeśli spełnia warunki uruchomienia (żeby nie wchodzić w pustą stronę)
      if (sel.status === STATUS.POLL_OPEN || sel.status === STATUS.READY) {
        canPoll = true;
      } else {
        const chk = await validatePollReadyToOpen(sel.id);
        canPoll = !!chk.ok;
      }
    }
  } catch (e) {
    console.error("[builder] poll entry error:", e);
  }

  setButtonsState({ hasSel: true, canEdit, canPlay, canPoll, canExport });
}

/* ================= Import/Export ================= */
async function readFileAsText(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
    r.readAsText(file);
  });
}

/* ================= Navigation helpers ================= */
function editorUrlForKind(kind, id) {
  // Ty masz 3 pliki edytorów — tu ustaw swoje nazwy:
  if (kind === KINDS.POLL_TEXT) return `editor-poll-text.html?id=${encodeURIComponent(id)}`;
  if (kind === KINDS.POLL_POINTS) return `editor-poll-points.html?id=${encodeURIComponent(id)}`;
  return `editor-prepared.html?id=${encodeURIComponent(id)}`;
}

/* ================= Main ================= */
async function refresh() {
  gamesAll = await listGames();

  // jeśli usunięto zaznaczoną
  if (selectedId && !gamesAll.some(g => g.id === selectedId)) selectedId = null;

  // jeśli aktywna zakładka nie ma gier, nadal renderujemy (pusty grid)
  render();
  await updateActionState();
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.email || "—";

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  // tabs
  tabPollText?.addEventListener("click", () => setActiveTab(KINDS.POLL_TEXT));
  tabPollPoints?.addEventListener("click", () => setActiveTab(KINDS.POLL_POINTS));
  tabPrepared?.addEventListener("click", () => setActiveTab(KINDS.PREPARED));

  // new game modal
  btnNew?.addEventListener("click", async () => {
    try {
      const g = await createGame(activeTab);
      selectedId = g.id;
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || "Nie udało się utworzyć gry.");
    }
  });
  btnCancelType?.addEventListener("click", closeTypeModal);

  btnCreatePollText?.addEventListener("click", async () => {
    closeTypeModal();
    try {
      const g = await createGame(KINDS.POLL_TEXT);
      selectedId = g.id;
      setActiveTab(KINDS.POLL_TEXT);
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry.");
    }
  });

  btnCreatePollPoints?.addEventListener("click", async () => {
    closeTypeModal();
    try {
      const g = await createGame(KINDS.POLL_POINTS);
      selectedId = g.id;
      setActiveTab(KINDS.POLL_POINTS);
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry.");
    }
  });

  btnCreatePrepared?.addEventListener("click", async () => {
    closeTypeModal();
    try {
      const g = await createGame(KINDS.PREPARED);
      selectedId = g.id;
      setActiveTab(KINDS.PREPARED);
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry.");
    }
  });

  // EDIT
  btnEdit?.addEventListener("click", async () => {
    if (!selectedId) return;

    const g = gamesAll.find(x => x.id === selectedId);
    if (!g) return;

    const info = canEnterEdit(g);
    if (!info.ok) {
      alert(info.reason);
      return;
    }

    if (info.needsResetWarning) {
      const ok = await confirmModal({
        title: "Edycja po sondażu",
        text: "W razie edycji dane sondażowe zostaną usunięte, a gra wróci do stanu SZKIC. Kontynuować?",
        okText: "Edytuj",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      try {
        await resetPollForEditing(g.id);
        await refresh();
      } catch (e) {
        console.error("[builder] resetPollForEditing error:", e);
        alert("Nie udało się przygotować gry do edycji (sprawdź konsolę).");
        return;
      }
    }

    location.href = editorUrlForKind(g.kind, g.id);
  });

  // PLAY
  btnPlay?.addEventListener("click", async () => {
    if (!selectedId) return;

    try {
      const chk = await validateGameReadyToPlay(selectedId);
      if (!chk.ok) {
        alert(chk.reason);
        return;
      }
      location.href = `control.html?id=${encodeURIComponent(selectedId)}`;
    } catch (e) {
      console.error(e);
      alert("Nie udało się sprawdzić gry (błąd bazy).");
    }
  });

  // POLLS
  btnPoll?.addEventListener("click", async () => {
    if (!selectedId) return;

    try {
      const g = await loadGameBasic(selectedId);

      const entry = await validatePollEntry(selectedId);
      if (!entry.ok) {
        alert(entry.reason);
        return;
      }

      // jeśli draft, nie wpuszczamy na “pustą” stronę
      if (g.status !== STATUS.POLL_OPEN && g.status !== STATUS.READY) {
        const chk = await validatePollReadyToOpen(selectedId);
        if (!chk.ok) {
          alert(chk.reason);
          return;
        }
      }

      location.href = `polls.html?id=${encodeURIComponent(selectedId)}`;
    } catch (e) {
      console.error(e);
      alert("Nie udało się otworzyć sondażu (błąd bazy).");
    }
  });

  // EXPORT
  btnExport?.addEventListener("click", async () => {
    if (!selectedId) return;
    try {
      const obj = await exportGame(selectedId);
      downloadJson(safeDownloadName(obj?.game?.name), obj);
    } catch (e) {
      console.error(e);
      alert("Eksport nie powiódł się (sprawdź konsolę).");
    }
  });

  // IMPORT (modal)
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
      if (importTa) importTa.value = txt;
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

      // UWAGA: import/export to “badziewie transportowe” — nie walidujemy
      const obj = JSON.parse(txt);
      const newId = await importGame(obj, currentUser.id);

      closeImportModal();
      selectedId = newId;

      // ustaw zakładkę na typ świeżo zaimportowanej gry
      try {
        const ng = await loadGameBasic(newId);
        if (ng?.kind) setActiveTab(ng.kind);
      } catch {}

      await refresh();
    } catch (e) {
      console.error("IMPORT ERROR:", e);
      setImportMsg("Błąd importu: zły JSON albo problem z bazą (sprawdź konsolę).");
    }
  });

  // init
  setActiveTab(KINDS.PREPARED);
  await refresh();
});
