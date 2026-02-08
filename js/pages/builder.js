// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { confirmModal } from "../core/modal.js";
import { initI18n } from "../../translation/translation.js";

import { exportGame, importGame, downloadJson } from "./builder-import-export.js";
import { seedDemoOnceIfNeeded } from "./demo-seed.js";

import {
  TYPES,
  STATUS,
  loadGameBasic,
  canEnterEdit,
  validateGameReadyToPlay,
  validatePollEntry,
  validatePollReadyToOpen,
} from "../core/game-validate.js";

initI18n({ withSwitcher: true });

/* ================= DOM ================= */
const grid = document.getElementById("grid");
const who = document.getElementById("who");
const hint = document.getElementById("hint");

const btnAccount = document.getElementById("btnAccount");
const btnLogout = document.getElementById("btnLogout");
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");

const btnManual = document.getElementById("btnManual");
const btnLogoEditor = document.getElementById("btnLogoEditor");
const btnBases = document.getElementById("btnBases");
const btnPollsHub = document.getElementById("btnPollsHub");
const pollsHubBadge = document.getElementById("pollsHubBadge");

const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const btnExportBase = document.getElementById("btnExportBase");

// Modal eksportu do bazy
const exportBaseOverlay = document.getElementById("exportBaseOverlay");
const basePickList = document.getElementById("basePickList");
const btnExportBaseDo = document.getElementById("btnExportBaseDo");
const btnExportBaseCancel = document.getElementById("btnExportBaseCancel");
const exportBaseMsg = document.getElementById("exportBaseMsg");

// Export base progress (w modalu eksportu do bazy)
const exportBaseProg = document.getElementById("exportBaseProg");
const exportBaseProgStep = document.getElementById("exportBaseProgStep");
const exportBaseProgCount = document.getElementById("exportBaseProgCount");
const exportBaseProgBar = document.getElementById("exportBaseProgBar");
const exportBaseProgMsg = document.getElementById("exportBaseProgMsg");

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

// Import progress (w modalu importu)
const importProg = document.getElementById("importProg");
const importProgStep = document.getElementById("importProgStep");
const importProgCount = document.getElementById("importProgCount");
const importProgBar = document.getElementById("importProgBar");
const importProgMsg = document.getElementById("importProgMsg");

// Export do pliku progress (osobny overlay)
const exportJsonOverlay = document.getElementById("exportJsonOverlay");
const exportJsonSub = document.getElementById("exportJsonSub");
const exportJsonStep = document.getElementById("exportJsonStep");
const exportJsonCount = document.getElementById("exportJsonCount");
const exportJsonBar = document.getElementById("exportJsonBar");
const exportJsonMsg = document.getElementById("exportJsonMsg");

/* ================= STATE ================= */
let currentUser = null;
let gamesAll = [];
let selectedId = null;

// DOMYŚLNIE: PREPAROWANY
let activeTab = TYPES.PREPARED;

const actionStateCache = new Map(); 
// gameId -> { rev: string, res: { canEdit, canPlay, canPoll, canExport, needsResetWarning } }

/* ================= UI helpers ================= */
function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setProgUi(stepEl, countEl, barEl, msgEl, { step, i, n, msg, isError } = {}) {
  if (stepEl && step != null) stepEl.textContent = String(step);
  if (countEl) countEl.textContent = `${Number(i) || 0}/${Number(n) || 0}`;

  const nn = Number(n) || 0;
  const ii = Number(i) || 0;
  const pct = nn > 0 ? Math.round((ii / nn) * 100) : 0;
  if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;

  if (msgEl) {
    msgEl.textContent = msg ? String(msg) : "";
    msgEl.style.opacity = isError ? "1" : ".85";
  }
}

function showProgBlock(el, on) {
  if (!el) return;
  // Domyślnie w HTML jest display:none; chcemy grid w trakcie
  el.style.display = on ? "grid" : "none";
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

function setExportBaseMsg(t) {
  if (!exportBaseMsg) return;
  exportBaseMsg.textContent = t || "";
}

function openExportBaseModal() {
  setExportBaseMsg("");
  show(exportBaseOverlay, true);
}

function closeExportBaseModal() {
  show(exportBaseOverlay, false);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Bazy do eksportu:
 * - moje (owner)
 * - udostępnione z rolą editor (bo eksport = zapis do bazy)
 */
async function listExportableBases() {
  const ownedP = sb()
    .from("question_bases")
    .select("id,name,owner_id,updated_at,created_at")
    .eq("owner_id", currentUser.id)
    .order("updated_at", { ascending: false });

  const sharedP = sb()
    .from("question_base_shares")
    .select("role, base_id, question_bases(id,name,owner_id,updated_at,created_at)")
    .eq("user_id", currentUser.id)
    .eq("role", "editor")
    .order("created_at", { ascending: false });

  const [{ data: owned, error: e1 }, { data: shared, error: e2 }] = await Promise.all([ownedP, sharedP]);
  if (e1) throw e1;
  if (e2) throw e2;

  const out = [];

  for (const b of (owned || [])) {
    out.push({ id: b.id, name: b.name, kind: "owned" });
  }

  for (const row of (shared || [])) {
    const b = row.question_bases;
    if (!b) continue;
    out.push({ id: b.id, name: b.name, kind: "shared_editor" });
  }

  // usuń duplikaty, gdyby kiedyś coś się nałożyło
  const seen = new Set();
  return out.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}

function renderBasePickList(bases) {
  if (!basePickList) return;

  if (!bases.length) {
    basePickList.innerHTML = `<div style="opacity:.75; padding:6px 8px;">Brak baz do zapisu (tylko Twoje i udostępnione z edycją).</div>`;
    return;
  }

  basePickList.innerHTML = bases
    .map((b, i) => {
      const meta = b.kind === "owned" ? "MOJA" : "UDOSTĘPNIONA • EDYCJA";
      return `
        <label class="basePickItem">
          <input type="radio" name="pickBase" value="${escapeHtml(b.id)}" ${i === 0 ? "checked" : ""}>
          <div class="nm" title="${escapeHtml(b.name || "Baza")}">${escapeHtml(b.name || "Baza")}</div>
          <div class="meta">${meta}</div>
        </label>
      `;
    })
    .join("");
}

function pickedBaseId() {
  const el = document.querySelector('input[name="pickBase"]:checked');
  return el ? el.value : null;
}

async function pickUniqueRootFolderName(baseId, desiredName) {
  const base = String(desiredName || "Gra").trim() || "Gra";
  const base80 = base.slice(0, 80);

  // pobierz nazwy root-folderów z tej bazy
  const { data, error } = await sb()
    .from("qb_categories")
    .select("name")
    .eq("base_id", baseId)
    .is("parent_id", null);

  if (error) throw error;

  const used = new Set((data || []).map(r => String(r.name || "").trim()));

  if (!used.has(base80)) return base80;

  // Dodawaj (2), (3)... pilnując limitu 80 znaków
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const candidate = base80.slice(0, Math.max(1, 80 - suffix.length)) + suffix;
    if (!used.has(candidate)) return candidate;
  }

  // awaryjnie (nie powinno się zdarzyć)
  return (base80.slice(0, 70) + " (999)").slice(0, 80);
}

async function exportSelectedGameToBase(baseId, onProgress) {
  if (!selectedId) return;

  // 1) Pobierz payload gry (już masz działające)
  let obj = null;
  obj = await exportGame(selectedId, ({ step, i, n, msg } = {}) => {
    if (typeof onProgress === "function") {
      onProgress({ step: step || "Eksport: pobieranie gry…", i, n, msg });
    }
  });
  
  const gameNameRaw = String(obj?.game?.name || "Gra").trim() || "Gra";
  const gameName = await pickUniqueRootFolderName(baseId, gameNameRaw);

  // 2) Utwórz folder w root o nazwie gry
  // Ustal ord = max(root.ord)+1 (opcjonalnie, ale stabilnie)
  
  const { data: lastRoot, error: eLast } = await sb()
    .from("qb_categories")
    .select("ord")
    .eq("base_id", baseId)
    .is("parent_id", null)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eLast) throw eLast;

  const nextOrd = (Number(lastRoot?.ord) || 0) + 1;

  if (typeof onProgress === "function") {
    onProgress({ step: "Eksport: tworzenie folderu…", i: 0, n: 1, msg: "" });
  }
  
  const { data: folder, error: eCat } = await sb()
    .from("qb_categories")
    .insert(
      { base_id: baseId, parent_id: null, name: gameName.slice(0, 80), ord: nextOrd },
      { defaultToNull: false }
    )
    .select("id")
    .single();
  if (eCat) throw eCat;

  // 3) Zapisz pytania do tego folderu
  const qs = Array.isArray(obj?.questions) ? obj.questions : [];
  const rows = qs.map((q, i) => ({
    base_id: baseId,
    category_id: folder.id,
    ord: i + 1,
    payload: {
      text: q?.text || "",
      answers: Array.isArray(q?.answers) ? q.answers.map((a) => ({
        text: a?.text || "",
        fixed_points: Number(a?.fixed_points) || 0,
      })) : [],
    },
  }));

  if (rows.length) {
    const nQ = rows.length;
    const CHUNK = 200;
  
    if (typeof onProgress === "function") {
      onProgress({ step: "Eksport: zapis pytań…", i: 0, n: nQ, msg: "" });
    }
  
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const { error: eQ } = await sb().from("qb_questions").insert(part, { defaultToNull: false });
      if (eQ) throw eQ;
  
      if (typeof onProgress === "function") {
        onProgress({
          step: "Eksport: zapis pytań…",
          i: Math.min(i + part.length, nQ),
          n: nQ,
          msg: `Zapisano ${Math.min(i + part.length, nQ)}/${nQ}`,
        });
      }
    }
  }
}

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
  if (btnExportBase) btnExportBase.disabled = !hasSel || !canExport;
  
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
    .select("id,name,created_at,updated_at,type,status")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
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
      },
      { defaultToNull: false }
    )
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
      },
      { defaultToNull: false }
    )
      .select("id,name,type,status")
      .single();

    if (ins.error) throw ins.error;
  }

  const game = ins.data;
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
    <div class="x" title="Usuń">✕</div>
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

let isCreatingGame = false;

function cardAdd(uiType) {
  const el = document.createElement("div");
  el.className = "addCard";
  el.innerHTML = `
    <div class="plus">＋</div>
    <div class="txt">Nowa gra</div>
    <div class="sub">${typeLabel(uiType)}</div>
  `;
    el.addEventListener("click", async () => {
      if (isCreatingGame) return;
      isCreatingGame = true;
      el.style.pointerEvents = "none";
      el.style.opacity = "0.6";
  
      try {
        const g = await createGame(uiType);
        selectedId = g.id;
        await refresh();
      } catch (e) {
        console.error("[builder] create error:", e);
        alert("Nie udało się utworzyć gry (sprawdź konsolę).");
      } finally {
        isCreatingGame = false;
        el.style.pointerEvents = "";
        el.style.opacity = "";
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

function normalizeGameForValidate(g) {
  if (!g) return g;
  const type = uiTypeFromRow(g); // mapuje fixed->prepared, poll->poll_text/poll_points
  return { ...g, type };
}

async function fetchActionState(gameId, revHint) {
  // Cache hit tylko gdy znamy rev i się zgadza
  if (revHint) {
    const c = actionStateCache.get(gameId);
    if (c && String(c.rev) === String(revHint)) return c.res;
  }

  const { data, error } = await sb()
    .rpc("game_action_state", { p_game_id: gameId })
    .single();

  if (error) throw error;
  const res = {
    canEdit: true, // finalnie i tak liczysz canEnterEdit() w UI, ale tu trzymamy “stan przycisku”
    needsResetWarning: !!data?.needs_reset_warning,
    canPlay: !!data?.can_play,
    canPoll: !!data?.can_poll,
    canExport: !!data?.can_export,
    reasonPlay: data?.reason_play || "",
    reasonPoll: data?.reason_poll || "",
    rev: String(data?.rev || "")
  };

  console.log("[RPC game_action_state]", gameId, data);

  actionStateCache.set(gameId, { rev: res.rev, res });
  return res;
}

async function updateActionState() {
  const sel = gamesAll.find(g => g.id === selectedId) || null;
  if (!sel) {
    setButtonsState({ hasSel: false, canEdit: false, canPlay: false, canPoll: false, canExport: false });
    return;
  }

  // 1) Spróbuj z cache natychmiast (jeśli rev się zgadza)
  const revHint = sel.updated_at ? String(sel.updated_at) : "";
  const cached = actionStateCache.get(sel.id);
  if (cached && revHint && String(cached.rev) === revHint) {
    
    const edit = canEnterEdit(normalizeGameForValidate(sel));
    const canEdit = !!edit.ok;
    
    setButtonsState({
      hasSel: true,
      canEdit,
      canPlay: !!cached.res.canPlay,
      canPoll: !!cached.res.canPoll,
      canExport: !!cached.res.canExport
    });
    return;
  }

  // 2) Jedno RPC (szybkie)
  try {
    const st = await fetchActionState(sel.id, revHint);

    // canEdit zostaje wg Twojej logiki JS (bo masz dokładniejsze komunikaty / warningi)
    const edit = canEnterEdit(normalizeGameForValidate(sel));
    const canEdit = !!edit.ok;

    setButtonsState({
      hasSel: true,
      canEdit,
      canPlay: !!st.canPlay,
      canPoll: !!st.canPoll,
      canExport: !!st.canExport
    });
  } catch (e) {
    console.error("[builder] game_action_state error:", e);
    setButtonsState({ hasSel: true, canEdit: false, canPlay: false, canPoll: false, canExport: false });
  }
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

/* ================= Main ================= */
async function refresh() {
  gamesAll = await listGames();

  if (selectedId && !gamesAll.some(g => g.id === selectedId)) selectedId = null;

  render();
  await updateActionState();
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.username || currentUser?.email || "—";

  async function refreshPollsHubDot(){
    // dot ma się pokazać, gdy są aktywne zadania / zaproszenia
    try{
      const { data, error } = await sb().rpc("polls_badge_get");
      if (error) throw error;
  
      const row = Array.isArray(data) ? data[0] : data;
      const tasks = Number(row?.tasks_pending ?? 0);
      const invites = Number(row?.subs_pending ?? 0);
      const total = tasks + invites;
      const text = total > 99 ? "99+" : String(total);
      const hasNew = total > 0;
      btnPollsHub?.classList.toggle("hasBadge", hasNew);
      if (pollsHubBadge) pollsHubBadge.textContent = hasNew ? text : "";
    } catch (e){
      // jak RPC nie istnieje / nie zwróci pól — nie blokujemy UI
      btnPollsHub?.classList.remove("hasBadge");
      if (pollsHubBadge) pollsHubBadge.textContent = "";
    }
  }
  
  // po init/requireAuth:
  refreshPollsHubDot();

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnAccount?.addEventListener("click", () => {
    location.href = "account.html";
  });

  btnManual?.addEventListener("click", async () => {
    location.href = "manual.html";
  });

  btnLogoEditor?.addEventListener("click", async () => {
    location.href = "./logo-editor/logo-editor.html";
  });
  
  btnBases?.addEventListener("click", async () => {
    location.href = "bases.html";
  });

  btnPollsHub?.addEventListener("click", () => {
    location.href = "polls-hub.html";
  });

  tabPollText?.addEventListener("click", () => setActiveTab(TYPES.POLL_TEXT));
  tabPollPoints?.addEventListener("click", () => setActiveTab(TYPES.POLL_POINTS));
  tabPrepared?.addEventListener("click", () => setActiveTab(TYPES.PREPARED));

  // EDIT
  btnEdit?.addEventListener("click", async () => {
    if (!selectedId) return;

    const g = gamesAll.find(x => x.id === selectedId);
    if (!g) return;
    
    const info = canEnterEdit(normalizeGameForValidate(g));
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

    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
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
      location.href = `control/control.html?id=${encodeURIComponent(selectedId)}`;
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

      location.href = `polls.html?id=${encodeURIComponent(selectedId)}&from=builder`;
    } catch (e) {
      console.error(e);
      alert("Nie udało się otworzyć sondażu (błąd bazy).");
    }
  });

  // EXPORT
  btnExport?.addEventListener("click", async () => {
    if (!selectedId) return;
    if (btnExport?.disabled) return;
  
    // UI start
    if (exportJsonSub) exportJsonSub.textContent = "Nie zamykaj strony. Trwa przygotowanie pliku.";
    show(exportJsonOverlay, true);
  
    // na start: nie znamy jeszcze n, ustawi się po pobraniu listy pytań w exportGame()
    setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
      step: "Eksport: start…",
      i: 0,
      n: 0,
      msg: "",
    });
  
    if (btnExport) btnExport.disabled = true;
  
    try {
      const obj = await exportGame(selectedId, ({ step, i, n, msg } = {}) => {
        setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
          step: step || "Eksport: pobieranie…",
          i,
          n,
          msg,
        });
      });
  
      setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
        step: "Gotowe ✅",
        i: Array.isArray(obj?.questions) ? obj.questions.length : 1,
        n: Array.isArray(obj?.questions) ? obj.questions.length : 1,
        msg: "Pobieranie pliku…",
      });
  
      downloadJson(safeDownloadName(obj?.game?.name), obj);
  
      // krótko pokaż “Gotowe”, potem schowaj
      setTimeout(() => show(exportJsonOverlay, false), 400);
    } catch (e) {
      console.error(e);
      setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
        step: "Błąd ❌",
        i: 0,
        n: 1,
        msg: e?.message || "Eksport nie powiódł się (sprawdź konsolę).",
        isError: true,
      });
  
      // zostaw overlay na chwilę, żeby użytkownik zobaczył błąd
      setTimeout(() => show(exportJsonOverlay, false), 1200);
    } finally {
      if (btnExport) btnExport.disabled = false;
    }
  });

  btnExportBase?.addEventListener("click", async () => {
    if (!selectedId) return;
  
    try {
      setExportBaseMsg("");
      openExportBaseModal();
  
      const bases = await listExportableBases();
      renderBasePickList(bases);
    } catch (e) {
      console.error(e);
      setExportBaseMsg("Nie udało się wczytać baz.");
    }
  });
  
  btnExportBaseCancel?.addEventListener("click", () => closeExportBaseModal());
  
  btnExportBaseDo?.addEventListener("click", async () => {
    const baseId = pickedBaseId();
    if (!baseId) {
      setExportBaseMsg("Wybierz bazę.");
      return;
    }
  
    if (btnExportBaseDo?.disabled) return;
  
    setExportBaseMsg("");
    showProgBlock(exportBaseProg, true);
    setProgUi(exportBaseProgStep, exportBaseProgCount, exportBaseProgBar, exportBaseProgMsg, {
      step: "Eksport: start…",
      i: 0,
      n: 1,
      msg: "",
    });
  
    if (btnExportBaseDo) btnExportBaseDo.disabled = true;
    if (btnExportBaseCancel) btnExportBaseCancel.disabled = true;
  
    try {
      await exportSelectedGameToBase(baseId, ({ step, i, n, msg, isError } = {}) => {
        setProgUi(exportBaseProgStep, exportBaseProgCount, exportBaseProgBar, exportBaseProgMsg, {
          step: step || "Eksport…",
          i,
          n,
          msg,
          isError,
        });
      });
  
      setProgUi(exportBaseProgStep, exportBaseProgCount, exportBaseProgBar, exportBaseProgMsg, {
        step: "Gotowe ✅",
        i: 1,
        n: 1,
        msg: "Wyeksportowano do bazy.",
      });
  
      closeExportBaseModal();
      alert("Wyeksportowano do bazy.");
    } catch (e) {
      console.error(e);
      setExportBaseMsg("Nie udało się wyeksportować do bazy.");
      setProgUi(exportBaseProgStep, exportBaseProgCount, exportBaseProgBar, exportBaseProgMsg, {
        step: "Błąd ❌",
        i: 0,
        n: 1,
        msg: e?.message || "Eksport nie powiódł się.",
        isError: true,
      });
    } finally {
      showProgBlock(exportBaseProg, false);
      if (btnExportBaseDo) btnExportBaseDo.disabled = false;
      if (btnExportBaseCancel) btnExportBaseCancel.disabled = false;
    }
  });

  exportBaseOverlay?.addEventListener("click", (e) => {
    if (e.target !== exportBaseOverlay) return;
    closeExportBaseModal();
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
    // blokada równoległych klików
    if (btnImportJson?.disabled) return;
  
    let obj = null;
  
    try {
      const txt = importTa?.value || "";
      if (!txt.trim()) {
        setImportMsg("Wklej JSON albo wczytaj plik.");
        return;
      }
  
      // parse najpierw, żeby błędny JSON nie odpalał progresu
      obj = JSON.parse(txt);
    } catch (e) {
      console.error("IMPORT JSON PARSE ERROR:", e);
      setImportMsg("Błędny JSON (nie da się sparsować).");
      return;
    }
  
    // UI: start
    setImportMsg("");
    showProgBlock(importProg, true);
    setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
      step: "Import: start…",
      i: 0,
      n: Array.isArray(obj?.questions) ? obj.questions.length : 0,
      msg: "",
    });
  
    if (btnImportJson) btnImportJson.disabled = true;
    if (btnCancelImport) btnCancelImport.disabled = true;
    if (btnImportFile) btnImportFile.disabled = true;
    if (importFile) importFile.disabled = true;
    if (importTa) importTa.disabled = true;
  
    try {
      const newId = await importGame(obj, currentUser.id, ({ step, i, n, msg, isError } = {}) => {
        setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
          step: step || "Import: zapis…",
          i,
          n,
          msg,
          isError,
        });
      });
  
      // końcówka
      setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
        step: "Gotowe ✅",
        i: Array.isArray(obj?.questions) ? obj.questions.length : 0,
        n: Array.isArray(obj?.questions) ? obj.questions.length : 0,
        msg: "Zaimportowano.",
      });
  
      selectedId = newId;
  
      try {
        const ng = await loadGameBasic(newId);
        if (ng?.type) {
          const ui = uiTypeFromRow(ng);
          setActiveTab(ui);
        }
      } catch {}
  
      await refresh();
  
      closeImportModal();
    } catch (e) {
      console.error("IMPORT ERROR:", e);
      setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
        step: "Błąd ❌",
        i: 0,
        n: Array.isArray(obj?.questions) ? obj.questions.length : 0,
        msg: e?.message || "Import nie powiódł się (sprawdź konsolę).",
        isError: true,
      });
      setImportMsg("Błąd importu: problem z bazą (sprawdź konsolę).");
    } finally {
      // UI: stop
      showProgBlock(importProg, false);
  
      if (btnImportJson) btnImportJson.disabled = false;
      if (btnCancelImport) btnCancelImport.disabled = false;
      if (btnImportFile) btnImportFile.disabled = false;
      if (importFile) importFile.disabled = false;
      if (importTa) importTa.disabled = false;
    }
  });

  // init
  // init
  setActiveTab(TYPES.PREPARED);

  // DEMO seed (max 1x per user)
  try {
    const res = await seedDemoOnceIfNeeded(currentUser?.id);
    if (res?.ran) {
      // po seedzie odświeżamy listę gier (i bazy/loga są już w systemie)
      await refresh();
      // opcjonalnie: alert/toast – ja bym NIE spamował, ale decyzja należy do Ciebie 🙂
    } else {
      await refresh();
    }
  } catch (e) {
    console.error("[builder] demo seed error:", e);
    // Seed się nie udał → builder nadal działa normalnie
    await refresh();
  }
});
