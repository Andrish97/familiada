// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { confirmModal } from "../core/modal.js";

import { exportGame, importGame, downloadJson } from "./builder-import-export.js";

import {
  TYPES,
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
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");

// Tabs
const tabPollText = document.getElementById("tabPollText");
const tabPollPoints = document.getElementById("tabPollPoints");
const tabPrepared = document.getElementById("tabPrepared");

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

// DOMYŚLNIE: PREPAROWANY
let activeTab = TYPES.PREPARED;

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

/**
 * UI-type (3 zakładki) vs DB-type (często tylko fixed/poll).
 * - Jeśli masz nową bazę z type = poll_text/poll_points/prepared -> działa wprost.
 * - Jeśli masz starą bazę z type = fixed/poll ->:
 *    fixed => prepared
 *    poll  => poll_text albo poll_points (wnioskujemy po nazwie)
 */
function uiTypeFromRow(g) {
  const k = String(g?.type || "");
  if (k === TYPES.POLL_TEXT || k === TYPES.POLL_POINTS || k === TYPES.PREPARED) return k;
  if (k === "fixed") return TYPES.PREPARED;
  if (k === "poll") {
    const nm = String(g?.name || "").toLowerCase();
    return nm.includes("punkt") ? TYPES.POLL_POINTS : TYPES.POLL_TEXT;
  }
  return TYPES.PREPARED;
}

function typeLabel(uiType) {
  if (uiType === TYPES.POLL_TEXT) return "TYPOWY SONDAŻ";
  if (uiType === TYPES.POLL_POINTS) return "PUNKTACJA";
  if (uiType === TYPES.PREPARED) return "PREPAROWANY";
  return String(uiType || "—").toUpperCase();
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
function setActiveTab(type) {
  activeTab = type;

  tabPollText?.classList.toggle("active", type === TYPES.POLL_TEXT);
  tabPollPoints?.classList.toggle("active", type === TYPES.POLL_POINTS);
  tabPrepared?.classList.toggle("active", type === TYPES.PREPARED);

  // jeśli zaznaczona gra nie pasuje do zakładki – odznacz
  const sel = gamesAll.find(g => g.id === selectedId);
  if (sel && uiTypeFromRow(sel) !== activeTab) selectedId = null;

  render();
  updateActionState();
}

/* ================= DB ================= */
async function listGames() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,type,status")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function ensureLive(gameId) {
  // jeśli nie masz live_state, ta funkcja się sama “wyciszy”
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
    // ignorujemy: nie każdy ma live_state
  }
}

function defaultNameForUiType(uiType) {
  if (uiType === TYPES.POLL_TEXT) return "Nowa Familiada (Sondaż)";
  if (uiType === TYPES.POLL_POINTS) return "Nowa Familiada (Punktacja)";
  return "Nowa Familiada (Preparowana)";
}

/**
 * Tworzenie gry:
 * - najpierw próbujemy wstawić type = uiType (pod nową bazę)
 * - jeśli DB ma check fixed/poll (23514), robimy fallback:
 *    prepared -> fixed, polls -> poll
 */
async function createGame(uiType) {
  const name = defaultNameForUiType(uiType);

  // 1) próbuj nowy schemat (type = poll_text/poll_points/prepared)
  let ins = await sb()
    .from("games")
    .insert({
      name,
      owner_id: currentUser.id,
      type: uiType,
      status: STATUS.DRAFT,
    })
    .select("id,name,type,status")
    .single();

  if (ins.error) {
    const code = ins.error?.code;
    const msg = String(ins.error?.message || "");
    const isTypeCheck =
      code === "23514" ||
      msg.includes("games_type_check") ||
      msg.includes("violates check constraint");

    if (!isTypeCheck) throw ins.error;

    // 2) fallback pod starą bazę (type = fixed/poll)
    const dbType = (uiType === TYPES.PREPARED) ? "fixed" : "poll";

    ins = await sb()
      .from("games")
      .insert({
        name,
        owner_id: currentUser.id,
        type: dbType,
        status: STATUS.DRAFT,
      })
      .select("id,name,type,status")
      .single();

    if (ins.error) throw ins.error;
  }

  const game = ins.data;
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
  const uiType = uiTypeFromRow(g);

  const el = document.createElement("div");
  el.className = "card";

  el.innerHTML = `
    <div class="x" title="Usuń">⧗</div>
    <div class="name"></div>
    <div class="meta"></div>
  `;

  el.querySelector(".name").textContent = g.name || "—";
  el.querySelector(".meta").textContent = `${typeLabel(uiType)} • ${statusLabel(g.status)}`;

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

function cardAdd(uiType) {
  const el = document.createElement("div");
  el.className = "addCard";
  el.innerHTML = `
    <div class="plus">＋</div>
    <div class="txt">Nowa gra</div>
    <div class="sub">${typeLabel(uiType)}</div>
  `;
  el.addEventListener("click", async () => {
    try {
      const g = await createGame(uiType);
      selectedId = g.id;
      await refresh();
    } catch (e) {
      console.error("[builder] create error:", e);
      alert("Nie udało się utworzyć gry (sprawdź konsolę).");
    }
  });
  return el;
}

function render() {
  if (!grid) return;
  grid.innerHTML = "";

  const games = (gamesAll || []).filter(g => uiTypeFromRow(g) === activeTab);

  // pierwszy kafelek: dodawanie w aktualnej zakładce
  grid.appendChild(cardAdd(activeTab));

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

  setHint("Kliknij kafelek, żeby go zaznaczyć. Nową grę dodasz kafelkiem „＋”.");
}

/* ================= Button logic ================= */
async function updateActionState() {
  const sel = gamesAll.find(g => g.id === selectedId) || null;
  if (!sel) {
    setButtonsState({ hasSel: false, canEdit: false, canPlay: false, canPoll: false, canExport: false });
    return;
  }

  let canExport = true;

  const edit = canEnterEdit(sel);
  const canEdit = !!edit.ok;

  let canPlay = false;
  try {
    const chk = await validateGameReadyToPlay(sel.id);
    canPlay = !!chk.ok;
  } catch (e) {
    console.error("[builder] validateGameReadyToPlay error:", e);
  }

  let canPoll = false;
  try {
    const entry = await validatePollEntry(sel.id);
    if (entry.ok) {
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

function editorUrlForType(type, id, name) {
  // wspieramy i nowe type-y, i stare fixed/poll
  const k = String(type || "");
  if (k === TYPES.POLL_TEXT) return `editor-poll-text.html?id=${encodeURIComponent(id)}`;
  if (k === TYPES.POLL_POINTS) return `editor-poll-points.html?id=${encodeURIComponent(id)}`;
  if (k === TYPES.PREPARED) return `editor-prepared.html?id=${encodeURIComponent(id)}`;

  // stare:
  if (k === "fixed") return `editor-prepared.html?id=${encodeURIComponent(id)}`;
  if (k === "poll") {
    const nm = String(name || "").toLowerCase();
    const isPoints = nm.includes("punkt");
    return isPoints
      ? `editor-poll-points.html?id=${encodeURIComponent(id)}`
      : `editor-poll-text.html?id=${encodeURIComponent(id)}`;
  }

  return `editor-prepared.html?id=${encodeURIComponent(id)}`;
}

/* ================= Main ================= */
async function refresh() {
  gamesAll = await listGames();

  if (selectedId && !gamesAll.some(g => g.id === selectedId)) selectedId = null;

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

  tabPollText?.addEventListener("click", () => setActiveTab(TYPES.POLL_TEXT));
  tabPollPoints?.addEventListener("click", () => setActiveTab(TYPES.POLL_POINTS));
  tabPrepared?.addEventListener("click", () => setActiveTab(TYPES.PREPARED));

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

    location.href = editorUrlForType(g.type, g.id, g.name);
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

      const obj = JSON.parse(txt);
      const newId = await importGame(obj, currentUser.id);

      closeImportModal();
      selectedId = newId;

      try {
        const ng = await loadGameBasic(newId);
        if (ng?.type) {
          // ustaw zakładkę wg UI-type
          const ui = uiTypeFromRow(ng);
          setActiveTab(ui);
        }
      } catch {}

      await refresh();
    } catch (e) {
      console.error("IMPORT ERROR:", e);
      setImportMsg("Błąd importu: zły JSON albo problem z bazą (sprawdź konsolę).");
    }
  });

  // init
  setActiveTab(TYPES.PREPARED);
  await refresh();
});
