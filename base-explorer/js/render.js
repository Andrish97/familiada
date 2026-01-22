// base-explorer/js/render.js
// Renderowanie UI eksploratora na podstawie state (bez DB, bez akcji).

import { VIEW } from "./state.js";

/* ================= DOM ================= */
const elBaseName = document.getElementById("baseName");
const elToolbar = document.getElementById("toolbar");
const elTree = document.getElementById("tree");
const elTags = document.getElementById("tags");
const elBreadcrumbs = document.getElementById("breadcrumbs");
const elList = document.getElementById("list");

/* ================= Utils ================= */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSelected(state, key) {
  return state.selection?.keys?.has(key);
}

/* ================= Render parts ================= */
export function renderAll(state) {
  renderHeader(state);
  renderToolbar(state);
  renderTree(state);
  renderTags(state);
  renderBreadcrumbs(state);
  renderList(state);
}

export function renderHeader(state) {
  if (!elBaseName) return;
  elBaseName.textContent = state.baseMeta?.name || "Baza pytań";
}

export function renderToolbar(state) {
  if (!elToolbar) return;

  // Etap 1: minimalnie – search i przycisk "Utwórz grę"
  // (eventy dojdą później w page.js/actions.js)
  elToolbar.innerHTML = `
    <input id="searchInp" class="inp" placeholder="Szukaj..." value="${esc(state.searchQuery || "")}" />
  
    <div style="flex:1"></div>
  
    <button id="btnNewFolder" class="btn ghost">Nowy folder</button>
    <button id="btnNewQuestion" class="btn ghost">Nowe pytanie</button>
  
    <button id="btnCreateGame" class="btn">Utwórz grę</button>
  `;

  // w viewer później i tak będzie mógł tworzyć grę
  // inne przyciski dojdą etapami
}

export function renderTree(state) {
  if (!elTree) return;

  const cats = Array.isArray(state.categories) ? state.categories : [];
  const byParent = new Map();

  for (const c of cats) {
    const pid = c.parent_id || null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(c);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
  }

  const open = state.treeOpen instanceof Set ? state.treeOpen : new Set();
  const maxDepth = 6;
  const ROOT_ID = "__root__";
  const rootHasChildren = (byParent.get(null) || []).length > 0;
  const rootOpen = rootHasChildren ? open.has(ROOT_ID) : true; // jak są dzieci, to root steruje

  function hasChildren(id) {
    const kids = byParent.get(id) || [];
    return kids.length > 0;
  }

  function rowHtml({ kind, id, depth, label, isOpen, canToggle, isActive, icon = "📁" }) {
    const pad = 6 + depth * 12;

    const toggle = canToggle
      ? `<button type="button" class="tree-toggle" data-id="${esc(id)}"
            aria-label="Zwiń/rozwiń"
            style="width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;cursor:pointer;opacity:.9;">
           ${isOpen ? "▼" : "▶"}
         </button>`
      : `<span style="display:inline-block;width:18px;"></span>`;

    const activeStyle = isActive ? "font-weight:700;" : "";
    const draggable = (state.role === "owner" || state.role === "editor") ? `draggable="true"` : ``;
    
    return `
      <div class="row tree-row" ${draggable} data-kind="${kind}" data-id="${id ? esc(id) : ""}" style="cursor:pointer;">
        <div class="col-main" style="padding-left:${pad}px; display:flex; align-items:center; gap:6px; ${activeStyle}">
          ${toggle}
          <div class="title">${icon} ${esc(label || "Folder")}</div>
        </div>
      </div>
    `;
  }

  function renderSubtree(parentIdOrNull, depth) {
    if (depth >= maxDepth) return "";
    const kids = byParent.get(parentIdOrNull) || [];
    if (!kids.length) return "";

    let out = "";
    for (const c of kids) {
      const id = c.id;
      const canToggle = hasChildren(id);
      const isOpen = canToggle ? open.has(id) : false;
      const isActive = (state.view === VIEW.FOLDER && state.folderId === id);

      out += rowHtml({
        kind: "cat",
        id,
        depth,
        label: c.name || "Folder",
        isOpen,
        canToggle,
        isActive,
      });

      if (canToggle && isOpen) {
        out += renderSubtree(id, depth + 1);
      }
    }
    return out;
  }

  // Root jako osobny wiersz
  const rootActive = (state.view === VIEW.ALL);

  const rootHtml = rowHtml({
    kind: "root",
    id: ROOT_ID,
    depth: 0,
    label: "Root",
    icon: "🏠",
    canToggle: rootHasChildren,
    isOpen: rootHasChildren ? rootOpen : true,
    isActive: rootActive,
  });

  const treeRows = rootOpen ? renderSubtree(null, 1) : "";

  elTree.innerHTML = `
    <div style="opacity:.75; margin-bottom:6px;">Foldery</div>
    <div class="treeList">
      ${rootHtml}
      ${treeRows || `<div style="opacity:.75; padding:6px 8px;">Brak folderów.</div>`}
    </div>
  `;
}

export function renderTags(state) {
  if (!elTags) return;

  const tags = Array.isArray(state.tags) ? state.tags : [];
  if (!tags.length) {
    elTags.innerHTML = `<div style="opacity:.75">Brak tagów.</div>`;
    return;
  }

  const rows = tags
    .slice()
    .sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0))
    .map((t) => {
      // Etap 1: tylko lista. Finder-style (kropki/kolory) dojdzie później.
      return `<div class="row" data-kind="tag" data-id="${esc(t.id)}" style="padding:6px 8px; cursor:pointer;">
        🏷 ${esc(t.name || "Tag")}
      </div>`;
    })
    .join("");

  elTags.innerHTML = `
    <div style="opacity:.75; margin-bottom:6px;">Tagi</div>
    <div class="tagList">${rows}</div>
  `;
}

export function renderBreadcrumbs(state) {
  if (!elBreadcrumbs) return;

  const byId = new Map((state.categories || []).map(c => [c.id, c]));
  const parts = [];

  // Root zawsze istnieje
  parts.push({ id: null, name: "Root" });

  if (state.view === VIEW.FOLDER && state.folderId) {
    // zbuduj ścieżkę od folderId do root
    let cur = byId.get(state.folderId);
    const chain = [];
    let guard = 0;

    while (cur && guard++ < 20) {
      chain.push({ id: cur.id, name: cur.name || "Folder" });
      const pid = cur.parent_id || null;
      cur = pid ? byId.get(pid) : null;
    }

    chain.reverse();
    for (const x of chain) parts.push(x);
  }

  // render jako klikalne segmenty (na razie tylko root + foldery)
  elBreadcrumbs.innerHTML = parts.map((p, i) => {
    const sep = i ? `<span style="opacity:.5; padding:0 6px;">/</span>` : ``;
    const idAttr = (p.id === null) ? "" : `data-id="${esc(p.id)}"`;
    const kind = (p.id === null) ? `data-kind="root"` : `data-kind="crumb"`;
    return `${sep}<span class="crumb" ${kind} ${idAttr} style="cursor:pointer;">${esc(p.name)}</span>`;
  }).join("");
}

export function renderList(state) {
  if (!elList) return;

  const foldersRaw = Array.isArray(state.folders) ? state.folders : [];
  const questionsRaw = Array.isArray(state.questions) ? state.questions : [];
  
  const sortKey = state?.sort?.key || "ord";
  const sortDir = state?.sort?.dir || "asc";
  const mul = sortDir === "desc" ? -1 : 1;
  
  const byName = (a, b) => String(a || "").localeCompare(String(b || ""), "pl", { sensitivity: "base" }) * mul;
  const byOrd = (a, b) => ((Number(a) || 0) - (Number(b) || 0)) * mul;
  
  const folders = foldersRaw.slice().sort((a, b) => {
    if (sortKey === "name") return byName(a.name, b.name);
    return byOrd(a.ord, b.ord);
  });
  
  const questions = questionsRaw.slice().sort((a, b) => {
    if (sortKey === "name") {
      const ta = String(a?.payload?.text ?? a?.text ?? "");
      const tb = String(b?.payload?.text ?? b?.text ?? "");
      return byName(ta, tb);
    }
    return byOrd(a.ord, b.ord);
  });

  if (!folders.length && !questions.length) {
    elList.innerHTML = `<div style="opacity:.75">Brak elementów.</div>`;
    return;
  }

  const folderRows = folders.map((c) => {
    const key = `c:${c.id}`;
    const selClass = isSelected(state, key) ? " is-selected" : "";
    const draggable = (state.role === "owner" || state.role === "editor") ? `draggable="true"` : ``; 
    return `<div class="row${selClass}" ${draggable} data-kind="cat" data-id="${esc(c.id)}" style="cursor:pointer;">
      <div class="col-num"></div>
      <div class="col-main"><div class="title">📁 ${esc(c.name || "Folder")}</div></div>
      <div class="col-meta"></div>
    </div>`;
  }).join("");

  const qRows = questions.map((q, idx) => {
    const key = `q:${q.id}`;
    const selClass = isSelected(state, key) ? " is-selected" : "";

    const text = q?.payload?.text ?? q?.text ?? "";
    const ord = (q?.ord ?? (idx + 1));

    const answersCount = Array.isArray(q?.payload?.answers) ? q.payload.answers.length : 0;
    const meta = answersCount ? `${answersCount} odp.` : "";
    const draggable = (state.role === "owner" || state.role === "editor") ? `draggable="true"` : ``; 
    return `<div class="row${selClass}" ${draggable} data-kind="q" data-id="${esc(q.id)}" style="cursor:pointer;">
      <div class="col-num">${esc(ord)}</div>
      <div class="col-main"><div class="title">${esc(text || "Pytanie")}</div></div>
      <div class="col-meta">${esc(meta)}</div>
    </div>`;
  }).join("");

  elList.innerHTML = folderRows + qRows;
}
