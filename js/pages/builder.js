// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

import { exportGame, importGame, downloadJson } from "./builder-import-export.js";
import {
  loadGameBasic,
  validateGameReadyToPlay,
  validatePollReadyToOpen,
} from "../core/game-validate.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

/* ====== DOM ====== */
const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

const btnNew = document.getElementById("btnNew");
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");

// modal typu
const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

// modal importu
const importOverlay = document.getElementById("importOverlay");
const importFile = document.getElementById("importFile");
const btnImportFile = document.getElementById("btnImportFile");
const btnImportJson = document.getElementById("btnImportJson");
const btnCancelImport = document.getElementById("btnCancelImport");
const importTa = document.getElementById("importTa");
const importMsg = document.getElementById("importMsg");

/* ====== STATE ====== */
let currentUser = null;
let games = [];
let selectedId = null;

/* ====== helpers UI ====== */
function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}
function openTypeModal() { show(typeOverlay, true); }
function closeTypeModal() { show(typeOverlay, false); }

function openImportModal() {
  if (importTa) importTa.value = "";
  if (importFile) importFile.value = "";
  if (importMsg) importMsg.textContent = "";
  show(importOverlay, true);
}
function closeImportModal() {
  show(importOverlay, false);
}

function setImportMsg(t) {
  if (!importMsg) return;
  importMsg.textContent = t || "";
}

function safeDownloadName(name) {
  const base = String(name || "familiada")
    .replace(/[^\w\d\- ]+/g, "")
    .trim()
    .slice(0, 40) || "familiada";
  return `${base}.json`;
}

/* ====== DB ====== */
async function listGames() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,kind,status")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function ensureLive(gameId) {
  const { data, error } = await sb()
    .from("live_state")
    .select("game_id")
    .eq("game_id", gameId)
    .maybeSingle();

  if (error) throw error;
  if (data?.game_id) return;

  const { error: insErr } = await sb().from("live_state").insert({ game_id: gameId });
  if (insErr) throw insErr;
}

async function createGame(kind) {
  // NIE tworzymy pytań/odpowiedzi. Tylko gra w draft.
  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name: kind === "poll" ? "Nowa Familiada (Sondaż)" : "Nowa Familiada",
      owner_id: currentUser.id,
      kind: kind === "poll" ? "poll" : "fixed",
      status: "draft",
    })
    .select("id,name,kind,status")
    .single();

  if (error) throw error;
  await ensureLive(game.id);
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

/* ====== render ====== */
function setButtonsState({ hasSel, canEdit, canPlay, canPoll, canExport }) {
  if (btnEdit) btnEdit.disabled = !hasSel || !canEdit;
  if (btnPlay) btnPlay.disabled = !hasSel || !canPlay;
  if (btnPoll) btnPoll.disabled = !hasSel || !canPoll;
  if (btnExport) btnExport.disabled = !hasSel || !canExport;
  // btnImport zawsze aktywny (import nie wymaga zaznaczenia)
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

  const meta = el.querySelector(".meta");
  const st = (g.status || "draft").toUpperCase();
  const kind = (g.kind || "fixed") === "poll" ? "SONDAŻ" : "LOKALNA";
  meta.textContent = `${kind} • ${st}`;

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
  for (const g of games) {
    const el = cardGame(g);
    if (g.id === selectedId) el.classList.add("selected");
    grid.appendChild(el);
  }

  // nic nie wybrane => wszystko off
  setButtonsState({
    hasSel: !!selectedId,
    canEdit: false,
    canPlay: false,
    canPoll: false,
    canExport: false,
  });
}

/**
 * Centralna logika przycisków:
 * - Edycja zablokowana gdy poll_open
 * - Gra (Play) aktywna tylko gdy validateGameReadyToPlay OK
 * - Sondaż (Polls) aktywny tylko:
 *   - dla kind=poll
 *   - oraz gdy:
 *     * status poll_open/ready => można wejść
 *     * status draft => tylko jeśli validatePollReadyToOpen OK (czyli niepusta 10x5)
 */
async function updateActionState() {
  const sel = games.find((g) => g.id === selectedId) || null;
  if (!sel) {
    setButtonsState({ hasSel: false, canEdit: false, canPlay: false, canPoll: false, canExport: false });
    return;
  }

  const kind = sel.kind || "fixed";
  const status = sel.status || "draft";

  const canExport = true;

  // edycja: blokada na poll_open
  const canEdit = !(kind === "poll" && status === "poll_open");

  // gra: twarda walidacja z core/game-validate.js
  let canPlay = false;
  try {
    const chk = await validateGameReadyToPlay(sel.id);
    canPlay = !!chk.ok;
  } catch (e) {
    console.error("[builder] validateGameReadyToPlay error:", e);
    canPlay = false;
  }

  // sondaż: tylko dla poll, i tylko gdy ma sens (draft => musi być gotowe do otwarcia)
  let canPoll = false;
  if (kind === "poll") {
    if (status === "poll_open" || status === "ready") {
      canPoll = true;
    } else {
      try {
        const chk = await validatePollReadyToOpen(sel.id);
        canPoll = !!chk.ok;
      } catch (e) {
        console.error("[builder] validatePollReadyToOpen error:", e);
        canPoll = false;
      }
    }
  }

  setButtonsState({ hasSel: true, canEdit, canPlay, canPoll, canExport });
}

async function refresh() {
  games = await listGames();
  if (selectedId && !games.some((g) => g.id === selectedId)) selectedId = null;

  render();
  await updateActionState();
}

/* ====== import/export helpers ====== */
async function readFileAsText(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
    r.readAsText(file);
  });
}

/* ====== start ====== */
document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.email || "—";

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnNew?.addEventListener("click", openTypeModal);
  btnCancelType?.addEventListener("click", closeTypeModal);

  btnCreateFixed?.addEventListener("click", async () => {
    closeTypeModal();
    try {
      const g = await createGame("fixed");
      selectedId = g.id;
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry.");
    }
  });

  btnCreatePoll?.addEventListener("click", async () => {
    closeTypeModal();
    try {
      const g = await createGame("poll");
      selectedId = g.id;
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Nie udało się utworzyć gry.");
    }
  });

  btnEdit?.addEventListener("click", async () => {
    if (!selectedId) return;

    const g = games.find((x) => x.id === selectedId);
    if (g?.kind === "poll" && g?.status === "poll_open") {
      alert("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }

    location.href = `editor.html?id=${encodeURIComponent(selectedId)}`;
  });

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

  btnPoll?.addEventListener("click", async () => {
    if (!selectedId) return;

    try {
      const g = await loadGameBasic(selectedId);
      if (g.kind !== "poll") {
        alert("To nie jest Familiada sondażowa.");
        return;
      }

      // blokuj wejście na “pustą” grę w draft
      if (g.status !== "poll_open" && g.status !== "ready") {
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
      await refresh();
    } catch (e) {
      console.error("IMPORT ERROR:", e);
      setImportMsg("Błąd importu: zły JSON albo problem z bazą (sprawdź konsolę).");
    }
  });

  await refresh();
});
