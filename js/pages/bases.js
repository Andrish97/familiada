// js/pages/bases.js
// Builder baz pytań (warstwa 1) – styl i ergonomia jak builder gier.

import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { confirmModal } from "../core/modal.js";

/* ================= DOM ================= */
const grid = document.getElementById("grid");
const who = document.getElementById("who");
const hint = document.getElementById("hint");

const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const btnBrowse = document.getElementById("btnBrowse");
const btnShare = document.getElementById("btnShare");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");

// Modal nazwy
const nameOverlay = document.getElementById("nameOverlay");
const nameTitle = document.getElementById("nameTitle");
const nameSub = document.getElementById("nameSub");
const nameInp = document.getElementById("nameInp");
const btnNameOk = document.getElementById("btnNameOk");
const btnNameCancel = document.getElementById("btnNameCancel");
const nameMsg = document.getElementById("nameMsg");

// Modal importu
const importOverlay = document.getElementById("importOverlay");
const importFile = document.getElementById("importFile");
const btnImportFile = document.getElementById("btnImportFile");
const btnImportJson = document.getElementById("btnImportJson");
const btnCancelImport = document.getElementById("btnCancelImport");
const importTa = document.getElementById("importTa");
const importMsg = document.getElementById("importMsg");

// Modal share
const shareOverlay = document.getElementById("shareOverlay");
const shareList = document.getElementById("shareList");
const shareEmail = document.getElementById("shareEmail");
const shareRole = document.getElementById("shareRole");
const btnShareAdd = document.getElementById("btnShareAdd");
const btnShareClose = document.getElementById("btnShareClose");
const shareMsg = document.getElementById("shareMsg");

/* ================= STATE ================= */
let currentUser = null;
let bases = []; // { id, name, owner_id, created_at, updated_at, sharedRole?: 'viewer'|'editor' }
let selectedId = null;

// modal nazwy – tryb
let nameMode = "create"; // 'create' | 'rename'

/* ================= UI helpers ================= */
function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setHint(t) {
  if (!hint) return;
  hint.textContent = t || "";
}

function setMsg(el, t) {
  if (!el) return;
  el.textContent = t || "";
}

function safeName(s) {
  return (String(s ?? "").trim() || "Nowa baza pytań").slice(0, 80);
}

function safeDownloadName(name) {
  const base = String(name || "baza")
    .replace(/[^\w\d\- ]+/g, "")
    .trim()
    .slice(0, 40) || "baza";
  return `${base}.json`;
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

function isOwner(b) {
  return b && currentUser && b.owner_id === currentUser.id;
}

function selectedBase() {
  return bases.find((b) => b.id === selectedId) || null;
}

function setButtonsState() {
  const b = selectedBase();
  const hasSel = !!b;
  const owner = b ? isOwner(b) : false;

  // Przeglądanie: każdy z dostępem
  if (btnBrowse) btnBrowse.disabled = !hasSel;

  // Udostępnianie: tylko owner
  if (btnShare) btnShare.disabled = !hasSel || !owner;

  // Eksport: każdy z dostępem
  if (btnExport) btnExport.disabled = !hasSel;
}

/* ================= DB: listowanie baz ================= */
async function listOwnedBases() {
  const { data, error } = await sb()
    .from("question_bases")
    .select("id,name,owner_id,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  // RLS i tak ograniczy do tych, do których masz dostęp, ale owner_id pozwoli nam odfiltrować.
  return (data || []).filter((b) => b.owner_id === currentUser.id);
}

async function listSharedBases() {
  const { data, error } = await sb()
    .from("question_base_shares")
    .select("role, base_id, question_bases(id,name,owner_id,created_at,updated_at)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const out = [];
  for (const row of (data || [])) {
    const b = row.question_bases;
    if (!b) continue;
    out.push({
      ...b,
      sharedRole: row.role,
    });
  }
  return out;
}

async function refreshBases() {
  const owned = await listOwnedBases();
  const shared = await listSharedBases();

  // merge, ale bez duplikatów
  const map = new Map();
  for (const b of owned) map.set(b.id, b);
  for (const b of shared) {
    if (!map.has(b.id)) map.set(b.id, b);
  }
  bases = Array.from(map.values())
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));

  // jeśli zaznaczona baza zniknęła
  if (selectedId && !bases.some((b) => b.id === selectedId)) selectedId = null;
}

/* ================= DB: CRUD baz ================= */
async function createBase(name) {
  const { data, error } = await sb()
    .from("question_bases")
    .insert({
      owner_id: currentUser.id,
      name: safeName(name),
    }, { defaultToNull: false })
    .select("id,name,owner_id,created_at,updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function renameBase(baseId, newName) {
  const { error } = await sb()
    .from("question_bases")
    .update({ name: safeName(newName), updated_at: new Date().toISOString() })
    .eq("id", baseId);
  if (error) throw error;
}

async function deleteBase(base) {
  const ok = await confirmModal({
    title: "Usuń bazę",
    text: `Na pewno usunąć "${base.name}"? Tego nie da się cofnąć.`,
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  const { error } = await sb().from("question_bases").delete().eq("id", base.id);
  if (error) {
    console.warn("[bases] delete error:", error);
    alert("Nie udało się usunąć.");
  }
}

/* ================= Export / Import ================= */
async function exportBase(baseId) {
  const { data: baseRow, error: bErr } = await sb()
    .from("question_bases")
    .select("id,name,owner_id,created_at,updated_at")
    .eq("id", baseId)
    .single();
  if (bErr) throw bErr;

  const { data: cats, error: cErr } = await sb()
    .from("qb_categories")
    .select("id,parent_id,name,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (cErr) throw cErr;

  const { data: qs, error: qErr } = await sb()
    .from("qb_questions")
    .select("id,category_id,ord,payload")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;

  const { data: tags, error: tErr } = await sb()
    .from("qb_tags")
    .select("id,name,color,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (tErr) throw tErr;

  // powiązania tagów (po pytaniach z tej bazy)
  const qIds = (qs || []).map((q) => q.id);
  let qtags = [];
  if (qIds.length) {
    const { data: qt, error: qtErr } = await sb()
      .from("qb_question_tags")
      .select("question_id,tag_id")
      .in("question_id", qIds);
    if (qtErr) throw qtErr;
    qtags = qt || [];
  }

  return {
    base: { name: baseRow?.name ?? "Baza" },
    categories: cats || [],
    tags: tags || [],
    questions: (qs || []).map((q) => ({
      id: q.id,
      category_id: q.category_id,
      ord: Number(q.ord) || 0,
      payload: q.payload || {},
    })),
    question_tags: qtags,
  };
}

function isValidImportPayload(p) {
  return !!p && typeof p === "object" && p.base && Array.isArray(p.questions);
}

async function importBase(payload) {
  if (!isValidImportPayload(payload)) {
    throw new Error("Zły format pliku (brak base / questions). ");
  }

  const baseName = safeName(payload.base?.name || "Nowa baza pytań");
  const base = await createBase(baseName);

  const oldToNewCat = new Map();
  const oldToNewTag = new Map();
  const oldToNewQ = new Map();

  // 1) Kategorie – w kolejności topologicznej (rooty → dzieci)
  const cats = Array.isArray(payload.categories) ? payload.categories : [];
  const byParent = new Map();
  for (const c of cats) {
    const key = c.parent_id || "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  }
  // sortuj po ord, żeby zachować porządek
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
  }

  async function insertCatSubtree(parentOldId, parentNewId) {
    const key = parentOldId || "__root__";
    const kids = byParent.get(key) || [];
    for (const c of kids) {
      const { data, error } = await sb()
        .from("qb_categories")
        .insert({
          base_id: base.id,
          parent_id: parentNewId,
          name: String(c.name || "Kategoria").slice(0, 80),
          ord: Number(c.ord) || 0,
        }, { defaultToNull: false })
        .select("id")
        .single();
      if (error) throw error;

      oldToNewCat.set(c.id, data.id);
      await insertCatSubtree(c.id, data.id);
    }
  }
  await insertCatSubtree(null, null);

  // 2) Tagi
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  for (const t of tags) {
    const { data, error } = await sb()
      .from("qb_tags")
      .insert({
        base_id: base.id,
        name: String(t.name || "Tag").slice(0, 40),
        color: String(t.color || "gray").slice(0, 24),
        ord: Number(t.ord) || 0,
      }, { defaultToNull: false })
      .select("id")
      .single();
    if (error) throw error;
    oldToNewTag.set(t.id, data.id);
  }

  // 3) Pytania
  const qs = Array.isArray(payload.questions) ? payload.questions : [];
  for (const q of qs) {
    const newCatId = q.category_id ? (oldToNewCat.get(q.category_id) || null) : null;
    const { data, error } = await sb()
      .from("qb_questions")
      .insert({
        base_id: base.id,
        category_id: newCatId,
        ord: Number(q.ord) || 0,
        payload: q.payload || {},
        updated_by: currentUser.id,
      }, { defaultToNull: false })
      .select("id")
      .single();
    if (error) throw error;
    oldToNewQ.set(q.id, data.id);
  }

  // 4) Powiązania tagów
  const qtags = Array.isArray(payload.question_tags) ? payload.question_tags : [];
  const rows = [];
  for (const r of qtags) {
    const nq = oldToNewQ.get(r.question_id);
    const nt = oldToNewTag.get(r.tag_id);
    if (!nq || !nt) continue;
    rows.push({ question_id: nq, tag_id: nt });
  }
  if (rows.length) {
    const { error } = await sb().from("qb_question_tags").insert(rows);
    if (error) throw error;
  }

  return base.id;
}

/* ================= Share modal ================= */
function roleLabel(role) {
  return role === "editor" ? "EDYCJA" : "ODCZYT";
}

function emailLooksOk(s) {
  const t = String(s || "").trim();
  // prosta walidacja – nie walczymy z RFC
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

async function openShareModal() {
  setMsg(shareMsg, "");
  shareEmail.value = "";
  shareRole.value = "editor";
  await renderShareList();
  show(shareOverlay, true);
}

function closeShareModal() {
  show(shareOverlay, false);
}

async function renderShareList() {
  const b = selectedBase();
  if (!b || !isOwner(b)) {
    shareList.innerHTML = "";
    return;
  }

  // RPC zwraca (user_id, email, role) i ma być dostępne tylko dla ownera
  const { data, error } = await sb().rpc("list_base_shares", { p_base_id: b.id });
  if (error) {
    console.warn("[bases] list_base_shares error:", error);
    shareList.innerHTML = "";
    return;
  }

  const rows = (data || []).slice().sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
  if (!rows.length) {
    shareList.innerHTML = `<div style="opacity:.75">Brak udostępnień.</div>`;
    return;
  }

  shareList.innerHTML = "";
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "shareRow";
    row.innerHTML = `
      <div class="shareEmail" title="${String(r.email || "").replace(/\"/g, "&quot;")}">${r.email || "—"}</div>
      <select class="inp" data-role>
        <option value="editor">Edycja</option>
        <option value="viewer">Przeglądanie</option>
      </select>
      <button class="btn sm" data-remove type="button">Usuń</button>
    `;
    const sel = row.querySelector("[data-role]");
    sel.value = r.role || "viewer";

    sel.addEventListener("change", async () => {
      // aktualizacja roli – wołamy share_base_by_email ponownie (UI maskuje błędy)
      setMsg(shareMsg, "");
      const { data: ok, error: e2 } = await sb().rpc("share_base_by_email", {
        p_base_id: b.id,
        p_email: r.email,
        p_role: sel.value,
      });
      if (e2 || ok !== true) {
        console.warn("[bases] share update failed:", e2);
        setMsg(shareMsg, "Nie udało się");
        sel.value = r.role || "viewer";
        return;
      }
      await renderShareList();
    });

    row.querySelector("[data-remove]").addEventListener("click", async () => {
      const ok = await confirmModal({
        title: "Usuń udostępnienie",
        text: `Na pewno usunąć dostęp dla: ${r.email}?`,
        okText: "Usuń",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      setMsg(shareMsg, "");
      const { data: ok2, error: e3 } = await sb().rpc("revoke_base_share", {
        p_base_id: b.id,
        p_user_id: r.user_id,
      });
      if (e3 || ok2 !== true) {
        console.warn("[bases] revoke failed:", e3);
        setMsg(shareMsg, "Nie udało się");
        return;
      }
      await renderShareList();
    });

    shareList.appendChild(row);
  }
}

async function shareAdd() {
  const b = selectedBase();
  if (!b || !isOwner(b)) return;

  setMsg(shareMsg, "");
  const email = String(shareEmail.value || "").trim();
  const role = shareRole.value;

  if (!emailLooksOk(email)) {
    setMsg(shareMsg, "Niepoprawny e-mail");
    return;
  }

  const { data: ok, error } = await sb().rpc("share_base_by_email", {
    p_base_id: b.id,
    p_email: email,
    p_role: role,
  });

  // Maskowanie szczegółów: tylko sukces / nie udało się
  if (error || ok !== true) {
    console.warn("[bases] share_base_by_email failed:", error);
    setMsg(shareMsg, "Nie udało się");
    return;
  }

  shareEmail.value = "";
  setMsg(shareMsg, "Udostępniono");
  await renderShareList();
}

/* ================= Render kafelków ================= */
function render() {
  if (!grid) return;
  grid.innerHTML = "";

  // Kafelek: nowa baza
  const tNew = document.createElement("div");
  tNew.className = "tile tile-new";
  tNew.innerHTML = `
    <div class="tileInner">
      <div class="plus">＋</div>
      <div class="name">Nowa baza</div>
      <div class="sub">Utwórz nową bazę pytań</div>
    </div>
  `;
  tNew.addEventListener("click", () => openNameModalCreate());
  grid.appendChild(tNew);

  for (const b of bases) {
    const tile = document.createElement("div");
    tile.className = "tile";
    if (b.id === selectedId) tile.classList.add("sel");

    const badge = b.sharedRole
      ? `<span class="sub badge">UDOSTĘPNIONA • ${roleLabel(b.sharedRole)}</span>`
      : `<span class="sub badge">WŁASNA</span>`;

    const canDelete = isOwner(b);
    const deleteBtn = canDelete
      ? `<button class="x" type="button" title="Usuń">✕</button>`
      : ``;

    tile.innerHTML = `
      ${deleteBtn}
      <div class="tileInner">
        <div class="name">${escapeHtml(b.name || "Baza")}</div>
        <div class="sub">${badge}</div>
      </div>
    `;

    tile.addEventListener("click", (e) => {
      // klik w ✕ nie ma zaznaczać
      if (e.target?.classList?.contains("x")) return;
      selectedId = (selectedId === b.id) ? null : b.id;
      setButtonsState();
      render();
    });

    // usuń
    const x = tile.querySelector(".x");
    if (x) {
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteBase(b);
        await refreshBases();
        render();
        setButtonsState();
      });
    }

    // rename na dwuklik (owner)
    tile.addEventListener("dblclick", (e) => {
      if (!isOwner(b)) return;
      if (e.target?.classList?.contains("x")) return;
      selectedId = b.id;
      setButtonsState();
      render();
      openNameModalRename(b);
    });

    grid.appendChild(tile);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ================= Modals: nazwa ================= */
function openNameModalCreate() {
  nameMode = "create";
  setMsg(nameMsg, "");
  nameTitle.textContent = "Nowa baza";
  nameSub.textContent = "Podaj nazwę bazy.";
  nameInp.value = "";
  show(nameOverlay, true);
  setTimeout(() => nameInp.focus(), 0);
}

function openNameModalRename(base) {
  nameMode = "rename";
  setMsg(nameMsg, "");
  nameTitle.textContent = "Zmień nazwę";
  nameSub.textContent = "Zmień nazwę bazy.";
  nameInp.value = base?.name || "";
  show(nameOverlay, true);
  setTimeout(() => nameInp.select(), 0);
}

function closeNameModal() {
  show(nameOverlay, false);
}

async function nameOk() {
  setMsg(nameMsg, "");
  const val = safeName(nameInp.value);
  try {
    if (nameMode === "create") {
      const b = await createBase(val);
      selectedId = b.id;
    } else {
      const b = selectedBase();
      if (b && isOwner(b)) {
        await renameBase(b.id, val);
      }
    }
    await refreshBases();
    render();
    setButtonsState();
    closeNameModal();
  } catch (e) {
    console.warn("[bases] name ok error:", e);
    setMsg(nameMsg, "Nie udało się");
  }
}

/* ================= Modal import ================= */
function openImportModal() {
  if (importTa) importTa.value = "";
  if (importFile) importFile.value = "";
  setMsg(importMsg, "");
  show(importOverlay, true);
}

function closeImportModal() {
  show(importOverlay, false);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("Nie udało się wczytać pliku"));
    r.readAsText(file);
  });
}

async function importFromJsonText(txt) {
  setMsg(importMsg, "");
  let payload;
  try {
    payload = JSON.parse(txt);
  } catch {
    setMsg(importMsg, "Zły JSON");
    return;
  }

  try {
    const newId = await importBase(payload);
    selectedId = newId;
    await refreshBases();
    render();
    setButtonsState();
    setMsg(importMsg, "Zaimportowano");
  } catch (e) {
    console.warn("[bases] import error:", e);
    setMsg(importMsg, "Nie udało się");
  }
}

/* ================= Events ================= */
btnBack?.addEventListener("click", () => {
  location.href = "builder.html";
});

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "index.html";
});

btnBrowse?.addEventListener("click", () => {
  const b = selectedBase();
  if (!b) return;
  // warstwa 2 będzie później – na razie przekierowanie na placeholder
  location.href = `base-explorer.html?base=${encodeURIComponent(b.id)}`;
});

btnShare?.addEventListener("click", async () => {
  const b = selectedBase();
  if (!b || !isOwner(b)) return;
  await openShareModal();
});

btnExport?.addEventListener("click", async () => {
  const b = selectedBase();
  if (!b) return;
  try {
    const out = await exportBase(b.id);
    downloadJson(safeDownloadName(b.name), out);
  } catch (e) {
    console.warn("[bases] export error:", e);
    alert("Nie udało się wyeksportować.");
  }
});

btnImport?.addEventListener("click", () => openImportModal());

btnImportFile?.addEventListener("click", async () => {
  const file = importFile?.files?.[0];
  if (!file) {
    setMsg(importMsg, "Wybierz plik");
    return;
  }
  const txt = await readFileAsText(file);
  if (importTa) importTa.value = txt;
});

btnImportJson?.addEventListener("click", async () => {
  const txt = String(importTa?.value || "").trim();
  if (!txt) {
    setMsg(importMsg, "Wklej JSON");
    return;
  }
  await importFromJsonText(txt);
});

btnCancelImport?.addEventListener("click", () => closeImportModal());

// modal nazwy
btnNameCancel?.addEventListener("click", () => closeNameModal());
btnNameOk?.addEventListener("click", () => nameOk());
nameInp?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") nameOk();
  if (e.key === "Escape") closeNameModal();
});

// modal share
btnShareClose?.addEventListener("click", () => closeShareModal());
btnShareAdd?.addEventListener("click", async () => shareAdd());
shareEmail?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") shareAdd();
});

// overlay click-to-close (import/share/name) – klik poza modalem
[nameOverlay, importOverlay, shareOverlay].forEach((ov) => {
  ov?.addEventListener("click", (e) => {
    if (e.target !== ov) return;
    if (ov === nameOverlay) closeNameModal();
    if (ov === importOverlay) closeImportModal();
    if (ov === shareOverlay) closeShareModal();
  });
});

/* ================= Init ================= */
(async function init() {
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.email || "—";

  setHint("Kliknij kafelek, żeby go zaznaczyć. Dwuklik zmienia nazwę (tylko właściciel).\n");

  await refreshBases();
  render();
  setButtonsState();
})();
