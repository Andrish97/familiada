// base-explorer/js/render.js
// Renderowanie UI eksploratora na podstawie state (bez DB, bez akcji).

import { VIEW, META, META_ORDER } from "./state.js";

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

function tagDotsHtml(state, id, kind /* "q" | "c" */) {
  const tags = Array.isArray(state.tags) ? state.tags : [];
  if (!tags.length) return "";

  const byId = new Map(tags.map(t => [t.id, t]));

  // mapy: pytania = view map, foldery = all map (drzewo/lista)
  const map =
    (kind === "q")
      ? (state._viewQuestionTagMap || null)
      : (state._allCategoryTagMap || null);

  if (!map) return "";

  const set = map.get(id);
  if (!set || !set.size) return "";

  // pokaż max 3 kropki + "+N"
  const all = Array.from(set);
  const max = 3;
  const shown = all.slice(0, max);
  const rest = all.length - shown.length;

  const dots = shown.map((tid) => {
    const t = byId.get(tid);
    const color = t?.color || "rgba(255,255,255,.25)";
    const label = t?.name || "tag";
    return `<span class="tag-dot" style="background:${esc(color)}" data-tip="#${esc(label)}"></span>`;
  }).join("");

  const more = rest > 0 ? `<span class="tag-more">+${rest}</span>` : "";

  return `<span class="tag-dots">${dots}${more}</span>`;
}

function metaDotsHtml(state, id, kind /* "q" | "c" */) {
  const defs = META || {};
  const order = Array.isArray(META_ORDER) ? META_ORDER : Object.keys(defs);

  const map =
    (kind === "q")
      ? (state._viewQuestionMetaMap || null)   // Map(qid -> metaId)
      : (state._allCategoryMetaMap || null);   // Map(cid -> Set(metaId))

  if (!map) return "";

  let metaIds = [];

  if (kind === "q") {
    const v = map.get(id);
    if (!v) return "";
    // v może być Setem (zgodnie z ensureMetaMapsForUI)
    if (v instanceof Set) metaIds = Array.from(v);
    else metaIds = [v];
  } else {
    const set = map.get(id);
    if (!set || !set.size) return "";
    metaIds = Array.from(set);
  }

  // porządek wg META_ORDER
  metaIds.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  const dots = metaIds.map((mid) => {
    const d = defs[mid];
    const color = d?.color || "rgba(255,255,255,.25)";
    const label = d?.name || mid;
    return `<span class="tag-dot" style="background:${esc(color)}" data-tip="${esc(label)}"></span>`;
  }).join("");

  return `<span class="tag-dots">${dots}</span>`;
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

  // Renderuj "szkielet" TYLKO raz, potem aktualizuj wnętrze (żeby nie tracić fokusu w input)
  if (elToolbar.dataset.ready !== "1") {
    elToolbar.innerHTML = `
      <div class="searchBox" id="searchBox">
        <div id="searchChips" class="searchChips"></div>
        <input id="searchText" class="searchText" placeholder="Szukaj..." />
        <button id="searchClearBtn" class="btn ghost" type="button" title="Wyczyść">✕</button>
      </div>
    
      <div style="flex:1"></div>
    
      <button id="btnNewFolder" class="btn ghost">Nowy folder</button>
      <button id="btnNewQuestion" class="btn ghost">Nowe pytanie</button>
    
      <button id="btnCreateGame" class="btn">Utwórz grę</button>
    `;
    elToolbar.dataset.ready = "1";
  }

  const inp = document.getElementById("searchText");
  const chipsEl = document.getElementById("searchChips");

  const tokens = state.searchTokens || { text: state.searchQuery || "", tagNames: [], tagIds: [] };

  // 1) Aktualizuj chipsy (kolor z qb_tags.color)
  if (chipsEl) {
    const byId = new Map((state.tags || []).map(t => [t.id, t]));
  
    // poprzednie ids (żeby animować tylko nowo dodane)
    const prevIds = new Set(
      String(chipsEl.dataset.ids || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    );
  
    const nextIds = (tokens.tagIds || []).map(String).filter(Boolean);
    chipsEl.dataset.ids = nextIds.join(",");
  
    const chipHtml = nextIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((t) => {
        const color = t?.color || "rgba(255,255,255,.35)";
        const label = t?.name || "";
        const isNew = !prevIds.has(String(t.id));
        return `
          <span class="chip ${isNew ? "chip--enter" : ""}" data-tag-id="${esc(t.id)}" title="#${esc(label)}" style="--chip:${esc(color)}">
            #${esc(label)}
          </span>
        `;
      }).join("");
  
    chipsEl.innerHTML = chipHtml;
  
    // zdejmij klasę wejścia w następnej klatce -> płynna animacja
    requestAnimationFrame(() => {
      chipsEl.querySelectorAll(".chip--enter").forEach(el => el.classList.remove("chip--enter"));
    });
  }
  // 2) Aktualizuj wartość inputa, ale nie wybijaj kursora gdy user pisze
  // UWAGA: input pokazuje RAW (z #tagami), bo to jest prawdziwy "tekst pola"
  if (inp) {
    const active = (document.activeElement === inp);
    const nextVal = String(tokens.text ?? "");
    if (!active && inp.value !== nextVal) {
      inp.value = nextVal;
    }
  }

  // 3) Disable przycisków tworzenia w viewer + w trybach read-only (SEARCH/TAG blokują "wklej", ale tworzenie też wolisz blokować)
  const writable = (state.role === "owner" || state.role === "editor");
  document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
  document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
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
    // wcięcia: bardziej "Explorer", mniej pustego powietrza
    const BASE_PAD = 6;      // minimalny margines z lewej
    const INDENT = 10;       // skok na poziom
    const pad = BASE_PAD + depth * INDENT;
    const selKey =
      (kind === "cat" && id) ? `c:${id}` :
      (kind === "root") ? "root" :
      null;

    const selClass = (selKey && isSelected(state, selKey)) ? " is-selected" : "";

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
        <div class="row tree-row${selClass}" ${draggable} data-kind="${kind}" data-id="${id ? esc(id) : ""}" style="cursor:pointer;">
        <div class="col-main" style="padding-left:${pad}px; display:flex; align-items:center; gap:6px; ${activeStyle}">
          ${toggle}
          <div class="title-line">
            <span class="title-text">${icon} ${esc(label || "Folder")}</span>
            ${kind === "cat" && id ? tagDotsHtml(state, id, "c") : ""}
            ${kind === "cat" && id ? metaDotsHtml(state, id, "c") : ""}
          </div>
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
    label: "Folder główny",
    icon: "🏠",
    canToggle: rootHasChildren,
    isOpen: rootHasChildren ? rootOpen : true,
    isActive: rootActive,
  });

  const treeRows = rootOpen ? renderSubtree(null, 0) : "";

  elTree.innerHTML = `
    <div style="opacity:.75; margin-bottom:6px;">Foldery</div>
    <div class="treeList">
      ${rootHtml}
      ${(rootHasChildren ? (treeRows || "") : `<div style="opacity:.75; padding:6px 8px;">Brak folderów.</div>`)}
    </div>
  `;
}

export function renderTags(state) {
  if (!elTags) return;

  const tags = Array.isArray(state.tags) ? state.tags : [];

  const metaDefs = META || {};
  const metaOrder = Array.isArray(META_ORDER) ? META_ORDER : Object.keys(metaDefs);

  const metaRows = metaOrder.map((id) => {
    const d = metaDefs[id] || { name: id, color: "rgba(255,255,255,.25)" };
    const isSel = !!state?.metaSelection?.ids?.has?.(id);
    const selClass = isSel ? " is-selected" : "";
    const dot = `<span class="tag-dot" style="background:${esc(d.color)}"></span>`;
    return `
      <div class="row${selClass}" data-kind="meta" data-id="${esc(id)}"
           style="padding:6px 8px; cursor:pointer; display:flex; align-items:center; gap:8px; opacity:.85;">
        ${dot}
        <div class="title-text">${esc(d.name)}</div>
      </div>`;
  }).join("");

  const header = `<div style="opacity:.75; margin-bottom:6px;">Tagi</div>`;
  const metaHeader = `<div style="opacity:.75; margin-bottom:6px; margin-top:4px;">Pasujące kategorie</div>`;
  const addBtn = `
    <button id="btnAddTag" class="btn ghost" type="button" style="width:100%; margin-top:10px;">
      + Dodaj tag
    </button>
  `;

  if (!tags.length) {
    elTags.innerHTML =`
      ${metaHeader}
      <div class="tagList">${metaRows}</div>

      <div style="height:10px;"></div>

      ${header}
      ${addBtn}
      <div style="opacity:.75; padding:6px 8px;">Brak tagów.</div>
      `;
    return;
  }

  const rows = tags
    .slice()
    .sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0))
    .map((t) => {
      const isSel = !!state?.tagSelection?.ids?.has?.(t.id);
      const selClass = isSel ? " is-selected" : "";
      const dot = t.color ? `<span class="tag-dot" style="background:${esc(t.color)}"></span>` : `<span class="tag-dot"></span>`;

      return `
        <div class="row${selClass}" data-kind="tag" data-id="${esc(t.id)}" style="padding:6px 8px; cursor:pointer; display:flex; align-items:center; gap:8px;">
          ${dot}
          <div class="title-text">#${esc(t.name || "Tag")}</div>
        </div>`;
    })
    .join("");

  elTags.innerHTML = `
    ${metaHeader}
    <div class="tagList">${metaRows}</div>

    <div style="height:10px;"></div>

    ${header}
    ${addBtn}
    <div class="tagList">${rows}</div>
  `;
}

export function renderBreadcrumbs(state) {

  if (state.view === VIEW.SEARCH || state.view === VIEW.TAG) {
    elBreadcrumbs.hidden = true;
    elBreadcrumbs.innerHTML = "";
    return;
  }
  elBreadcrumbs.hidden = false;
  
  if (!elBreadcrumbs) return;

  const byId = new Map((state.categories || []).map(c => [c.id, c]));
  const parts = [];

  // Root zawsze istnieje
  parts.push({ id: null, name: "Folder główny" });

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

  let n = 1;

  const folderRows = folders.map((c) => {
    const key = `c:${c.id}`;
    const selClass = isSelected(state, key) ? " is-selected" : "";
    const draggable = (state.role === "owner" || state.role === "editor") ? `draggable="true"` : ``; 
    return `<div class="row${selClass}" ${draggable} data-kind="cat" data-id="${esc(c.id)}" style="cursor:pointer;">
      <div class="col-num">${n++}</div>
      <div class="col-main">
        <div class="title-line">
          <span class="title-text">📁 ${esc(c.name || "Folder")}</span>
          ${tagDotsHtml(state, c.id, "c")}
        </div>
      </div>
      <div class="col-meta">${metaDotsHtml(state, c.id, "c")}</div>
    </div>`;
  }).join("");

  const qRows = questions.map((q, idx) => {
    const key = `q:${q.id}`;
    const selClass = isSelected(state, key) ? " is-selected" : "";

    const text = q?.payload?.text ?? q?.text ?? "";

    const answersCount = Array.isArray(q?.payload?.answers) ? q.payload.answers.length : 0;
    const meta = answersCount ? `${answersCount} odp.` : "";
    const draggable = (state.role === "owner" || state.role === "editor") ? `draggable="true"` : ``; 
    return `<div class="row${selClass}" ${draggable} data-kind="q" data-id="${esc(q.id)}" style="cursor:pointer;">
      <div class="col-num">${n++}</div>
      <div class="col-main">
        <div class="title-line">
          <span class="title-text">${esc(text || "Pytanie")}</span>
          ${tagDotsHtml(state, q.id, "q")}
        </div>
      </div>
      <div class="col-meta">
        ${metaDotsHtml(state, q.id, "q")}
        ${meta ? `<span style="margin-left:8px; opacity:.75;">${esc(meta)}</span>` : ""}
      </div>
    </div>`;
  }).join("");

  elList.innerHTML = folderRows + qRows;
}
