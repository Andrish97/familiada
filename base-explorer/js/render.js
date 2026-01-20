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
    <button id="btnCreateGame" class="btn">Utwórz grę</button>
  `;

  // w viewer później i tak będzie mógł tworzyć grę
  // inne przyciski dojdą etapami
}

export function renderTree(state) {
  if (!elTree) return;

  const cats = Array.isArray(state.categories) ? state.categories : [];
  if (!cats.length) {
    elTree.innerHTML = `<div style="opacity:.75">Brak folderów.</div>`;
    return;
  }

  // Etap 1: prosta lista (drzewo zrobimy w następnym kroku)
  const rows = cats
    .slice()
    .sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0))
    .map((c) => {
      const key = `c:${c.id}`;
      const sel = isSelected(state, key) ? "font-weight:700;" : "";
      return `<div class="row" data-kind="cat" data-id="${esc(c.id)}" style="padding:6px 8px; cursor:pointer; ${sel}">
        📁 ${esc(c.name || "Folder")}
      </div>`;
    })
    .join("");

  elTree.innerHTML = `
    <div style="opacity:.75; margin-bottom:6px;">Foldery</div>
    <div class="treeList">${rows}</div>
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

  let label = "Wszystkie pytania";
  if (state.view === VIEW.FOLDER) label = "Folder";
  if (state.view === VIEW.TAG) label = "Tagi";

  elBreadcrumbs.textContent = label;
}

export function renderList(state) {
  if (!elList) return;

  const items = Array.isArray(state.questions) ? state.questions : [];
  if (!items.length) {
    elList.innerHTML = `<div style="opacity:.75">Brak elementów.</div>`;
    return;
  }

  const rows = items.map((q, idx) => {
    const key = `q:${q.id}`;
    const sel = isSelected(state, key) ? "font-weight:700;" : "";
    const text = q?.payload?.text ?? q?.text ?? "";
    return `<div class="row" data-kind="q" data-id="${esc(q.id)}" style="padding:8px 10px; cursor:pointer; ${sel}">
      <div>${esc(text || "Pytanie")}</div>
      <div style="opacity:.65; font-size:12px;">#${esc(q.ord ?? (idx + 1))}</div>
    </div>`;
  }).join("");

  elList.innerHTML = rows;
}
