// base-explorer/js/render.js
// Renderowanie UI eksploratora na podstawie state (bez DB, bez akcji).

import { VIEW, META, META_ORDER, TRASH, getTrashId } from "./state.js";

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

function toTime(v) {
  // obsługa: ISO string / timestamp / null
  const t = (v ? Date.parse(String(v)) : NaN);
  return Number.isFinite(t) ? t : 0;
}

function fmtDate(v) {
  const t = toTime(v);
  if (!t) return "—";
  const d = new Date(t);
  // prosto i czytelnie: YYYY-MM-DD HH:MM (lokalnie)
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const IS_MAC = navigator.platform.toLowerCase().includes("mac");

function kbd(win, mac) {
  return IS_MAC ? mac : win;
}

function setToolbarTip(act, label, win, mac) {
  const btn = elToolbar?.querySelector?.(`button[data-act="${act}"]`);
  if (!btn) return;

  const combo = kbd(win, mac);
  const txt = combo ? `${label} (${combo})` : label;

  btn.setAttribute("data-tip", txt);
  btn.removeAttribute("title"); // wyłącz natywny tooltip
}

function pickDate(raw) {
  // Fallback dla różnych schematów (foldery często mają inne pola)
  return (
    raw?.updated_at ??
    raw?.modified_at ??
    raw?.changed_at ??
    raw?.created_at ??
    raw?.inserted_at ??
    raw?.created ??
    raw?.updated ??
    null
  );
}

function getFolderMetaRank(state, folderId) {
  // sort "Typ" wg meta folderu: prepared -> poll_points -> poll_text -> brak
  const order = Array.isArray(META_ORDER) ? META_ORDER : [];
  const map = state._allCategoryMetaMap || null; // Map(cid -> Set(metaId))
  if (!map) return 999;

  const set = map.get(folderId);
  if (!set || !set.size) return 999;

  // bierzemy "najwyższy" priorytet wg META_ORDER
  let best = 999;
  for (const id of set) {
    const idx = order.indexOf(id);
    if (idx !== -1 && idx < best) best = idx;
  }
  return best;
}

function getItemTypeSortKey(item, state) {
  // najpierw wg meta-ranku folderu, potem folder/pytanie
  if (item.kind === "cat") {
    const r = getFolderMetaRank(state, item.id);
    // foldery bez meta na końcu wśród folderów
    return `0:${String(r).padStart(3, "0")}:folder`;
  }
  return `1:999:question`;
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
    return `<span class="meta-dot" style="--c:${esc(color)}" data-tip="${esc(label)}"></span>`;
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

  const trashId = getTrashId(state?.categories);
  const inTrash = !!trashId && state?.view === VIEW.FOLDER && state?.folderId === trashId;

  // Renderuj "szkielet" TYLKO raz, potem aktualizuj wnętrze (żeby nie tracić fokusu w input)
  if (elToolbar.dataset.ready !== "1") {
    elToolbar.innerHTML = `
      <div class="searchBox" id="searchBox">
        <div id="searchChips" class="searchChips"></div>
        <input id="searchText" class="searchText" placeholder="Szukaj..." />
        <button id="searchClearBtn" class="btn ghost" type="button" title="Wyczyść">✕</button>
      </div>
    
      <div class="tbGroup" role="group" aria-label="Tworzenie">
        <button class="tbBtn" type="button" data-act="newFolder" title="Nowy folder">
          ${svgFolderPlus()}
        </button>
        <button class="tbBtn" type="button" data-act="newQuestion" title="Nowe pytanie">
          ${svgFilePlus()}
        </button>
      </div>
      
      <div class="tbSep" aria-hidden="true"></div>
      
      <div class="tbGroup" role="group" aria-label="Edycja">
        <button class="tbBtn" type="button" data-act="editQuestion" title="Edytuj pytanie">
          ${svgEdit()}
        </button>
        <button class="tbBtn" type="button" data-act="editTags" title="Tagi">
          ${svgTag()}
        </button>
        <button class="tbBtn" type="button" data-act="rename" title="Zmień nazwę">
          ${svgPencil()}
        </button>
        <button class="tbBtn danger" type="button" data-act="delete" title="Usuń">
          ${svgTrash()}
        </button>

        ${inTrash ? `
        <button class="tbBtn" data-act="restore" type="button" title="Przywróć z kosza">♻️
        </button>
        ` : ""}
      </div>
      
      <div class="tbSep" aria-hidden="true"></div>
      
      <div class="tbGroup" role="group" aria-label="Schowek">
        <button class="tbBtn" type="button" data-act="copy" title="Kopiuj">
          ${svgCopy()}
        </button>
        <button class="tbBtn" type="button" data-act="cut" title="Wytnij">
          ${svgCut()}
        </button>
        <button class="tbBtn" type="button" data-act="paste" title="Wklej">
          ${svgPaste()}
        </button>
        <button class="tbBtn" type="button" data-act="duplicate" title="Duplikuj">
          ${svgDuplicate()}
        </button>
      </div>
      
      <div class="tbSep" aria-hidden="true"></div>
      
      <div class="tbGroup" role="group" aria-label="Gra">
        <button class="tbBtn primary" type="button" data-act="createGame" title="Utwórz grę">
          ${svgPlay()}
        </button>
      </div>
      
      <div class="tbSep" aria-hidden="true"></div>
      <div class="tbGroup" role="group" aria-label="Widok">
        <button class="tbBtn" type="button" data-act="refreshView" title="Odśwież widok">
          ${svgRefresh()}
        </button>
      </div>
    `;
    elToolbar.dataset.ready = "1";
  }
    // Tooltips z automatycznym formatowaniem skrótów (Windows/Linux vs macOS)
  setToolbarTip("newFolder",   "Nowy folder",     "Ctrl+Shift+N", "⌘⇧N");
  setToolbarTip("newQuestion", "Nowe pytanie",    "Ctrl+N",       "⌘N");
  setToolbarTip("editQuestion","Edytuj pytanie",  "Ctrl+E",       "⌘E");
  setToolbarTip("editTags",    "Tagi",            "Ctrl+T",       "⌘T");
  setToolbarTip("rename",      "Zmień nazwę",     "F2",           "F2");
  setToolbarTip("delete",      "Usuń",            "Delete",       "Fn⌫");
  setToolbarTip("restore",     "Przywróć z kosza","",             "");
  setToolbarTip("copy",        "Kopiuj",          "Ctrl+C",       "⌘C");
  setToolbarTip("cut",         "Wytnij",          "Ctrl+X",       "⌘X");
  setToolbarTip("paste",       "Wklej",           "Ctrl+V",       "⌘V");
  setToolbarTip("duplicate",   "Duplikuj",        "Ctrl+D",       "⌘D");
  setToolbarTip("createGame",  "Utwórz grę",      "Ctrl+G",       "⌘G");
  setToolbarTip("refreshView", "Odśwież widok",   "Ctrl+Alt+R",   "⌘⌥R");

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
  // UWAGA: input pokazuje tylko zwykły tekst (bez #tagów).
  // #tagi są reprezentowane jako chipsy w #searchChips.
  if (inp) {
    const active = (document.activeElement === inp);
    const nextVal = String(tokens.text ?? "");
    if (!active && inp.value !== nextVal) {
      inp.value = nextVal;
    }
  }

  // 3) Disable przycisków toolbar – spójnie z actions/context-menu + reguły selekcji (0/1/wiele)
  const editor = (state.role === "owner" || state.role === "editor");
  
  // Tylko realne elementy listy (foldery/pytania). Root/tag/meta nie liczą się do selekcji toolbara.
  const realKeys = Array.from(state.selection?.keys || []).filter((k) => {
    if (!k) return false;
    const s = String(k);
    return s.startsWith("c:") || s.startsWith("q:");
  });
  
  const selCount = realKeys.length;
  const hasSel = selCount > 0;
  const oneSel = selCount === 1;
  const manySel = selCount > 1;
  
  const hasClipboard = !!state?.clipboard?.mode && !!state?.clipboard?.keys?.size;
  
  // Twoje “poprzednie narzucone reguły” (role + widoki) zostają:
  const canMutate = editor && (state.view !== VIEW.SEARCH && state.view !== VIEW.TAG && state.view !== VIEW.META);
  const canDelete = editor && (state.view !== VIEW.META);
  const canCut = editor && (state.view !== VIEW.SEARCH && state.view !== VIEW.TAG && state.view !== VIEW.META);
  const canCopy = editor; // copy nie było blokowane view’ami, tylko rolą
  const canEditTags = editor; // view dopuszczasz (w Twoim opisie: “jeśli jest selekcja”)
  const canEditQuestion = editor; // placeholder, ale blokuj viewer
  const canRename = canMutate; // rename = mutacja
  
  const dis = new Map();
  
  // === TWORZENIE ===
  // NOWY WARUNEK: “Nowy folder / Nowe pytanie – zawsze aktywne”
  // ale tylko jeśli user ma prawo pisać i nie łamiemy wcześniejszych blokad widoków
  dis.set("newFolder", !canMutate ? true : false);
  dis.set("newQuestion", !canMutate ? true : false);
  
  // === PASTE ===
  // “Wklej zależne od schowka i dobrze” + wcześniejsze blokady
  dis.set("paste", !(canMutate && hasClipboard));

  dis.set("refreshView", false);
  
  // === SELEKCJA: 0 / 1 / wiele ===
  
  // 0 zaznaczenia:
  // wyszarzone: editQuestion, editTags, rename, delete, copy, cut, duplicate, createGame
  if (!hasSel) {
    dis.set("editQuestion", true);
    dis.set("editTags", true);
    dis.set("rename", true);
    dis.set("delete", true);
  
    dis.set("copy", true);
    dis.set("cut", true);
    dis.set("duplicate", true);
  
    dis.set("createGame", true);
  }
  
  // 1 zaznaczenie:
  // “wszystkie aktywne” (z zachowaniem wcześniejszych blokad roli/widoków)
  if (oneSel) {
    dis.set("editQuestion", !canEditQuestion);
    dis.set("editTags", !canEditTags);
    dis.set("rename", !canRename);
    dis.set("delete", !canDelete);
  
    dis.set("copy", !canCopy);
    dis.set("cut", !canCut);
    dis.set("duplicate", !canMutate);
  
    dis.set("createGame", false);
  }
  
  // >1 zaznaczenie:
  // wyszarzone: editQuestion, editTags, rename
  // aktywne: delete, copy, cut, duplicate, createGame (z wcześniejszymi blokadami)
  if (manySel) {
    dis.set("editQuestion", true);
    dis.set("editTags", true);
    dis.set("rename", true);
  
    dis.set("delete", !canDelete);
    dis.set("copy", !canCopy);
    dis.set("cut", !canCut);
    dis.set("duplicate", !canMutate);
    dis.set("createGame", false);
  }
  
  // zastosuj do DOM
  elToolbar.querySelectorAll('button[data-act]').forEach((b) => {
    const act = b.dataset.act;
    if (!act) return;
    if (dis.has(act)) b.disabled = !!dis.get(act);
  });
}

export function renderTree(state) {
  if (!elTree) return;

  const cats = Array.isArray(state.categories) ? state.categories : [];

  const trashId = getTrashId(cats);
  const catsVisible = cats.filter((c) => c && c.name !== TRASH.NAME);
  
  const byParent = new Map();

  for (const c of catsVisible) {
    const pid = c.parent_id || null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(c);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
  }

  const open = state.treeOpen instanceof Set ? state.treeOpen : new Set();
  const maxDepth = 8;
  const ROOT_ID = "root";
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
    const draggable =
      (kind === "cat" && (state.role === "owner" || state.role === "editor"))
        ? `draggable="true"`
        : ``;
    
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
  
    <div class="treeWrap">
      <div class="treeList treeScroll">
        ${rootHtml}
        ${(rootHasChildren ? (treeRows || "") : `<div style="opacity:.75; padding:6px 8px;">Brak folderów.</div>`)}
      </div>
  
      <div class="treeBottom">
        ${trashId ? rowHtml({
          kind: "trash",
          id: trashId,
          depth: 0,
          label: TRASH.LABEL,
          icon: "🗑️",
          canToggle: false,
          isOpen: true,
          isActive: state.view === VIEW.FOLDER && state.folderId === trashId,
        }) : ""}
      </div>
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
    const dot = `<span class="meta-dot" style="--c:${esc(d.color)}"></span>`;
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
    elTags.innerHTML = `  
      <div class="tagList">
        ${metaHeader}
        ${metaRows}
  
        <div style="height:10px;"></div>
  
        ${header}
        ${addBtn}
        <div style="opacity:.75; padding:6px 8px;">Brak tagów.</div>
      </div>
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
  <div class="tagList">
    ${metaHeader}
    ${metaRows}

    <div style="height:10px;"></div>

    ${header}
    ${addBtn}
    ${rows}
  </div>
`;
}

export function renderBreadcrumbs(state) {
  
  if (!elBreadcrumbs) return;
  
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

const COLS_KEY = "base-explorer:cols:v1";

function loadCols() {
  try {
    const o = JSON.parse(localStorage.getItem(COLS_KEY) || "{}");
    return (o && typeof o === "object") ? o : {};
  } catch {
    return {};
  }
}

function saveCols(cols) {
  try { localStorage.setItem(COLS_KEY, JSON.stringify(cols || {})); } catch {}
}

function applyColsToRoot(cols) {
  // ustawiamy na :root (wystarczy, bo list-head/row korzystają z varów)
  const root = document.documentElement;
  const map = {
    num: "--col-num",
    name: "--col-name",
    type: "--col-type",
    date: "--col-date",
    meta: "--col-meta",
  };
  for (const k of Object.keys(map)) {
    const v = cols?.[k];
    if (typeof v === "string" && v.trim()) root.style.setProperty(map[k], v);
  }
}

// tylko px-resize dla kolumn 2..5 (name/type/date/meta). Num zostawiamy stałe.
function initColumnResizers() {
  const head = elList?.querySelector?.(".list-head");
  if (!head) return;
  if (head.dataset.resizers === "1") return;
  head.dataset.resizers = "1";

  const cols = loadCols();
  applyColsToRoot(cols);

  // indeksy komórek w headerze: 0 Nr, 1 Nazwa, 2 Typ, 3 Data, 4 Info
  const resizable = [
    { idx: 1, key: "name", cssVar: "--col-name", min: 220 },
    { idx: 2, key: "type", cssVar: "--col-type", min: 120 },
    { idx: 3, key: "date", cssVar: "--col-date", min: 140 },
    { idx: 4, key: "meta", cssVar: "--col-meta", min: 120 },
  ];

    const COL_COUNT = 5; // Nr + Nazwa + Typ + Data + Info

  const parsePx = (v) => {
    const n = parseFloat(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const getHeadInnerWidth = () => {
    const cs = getComputedStyle(head);
    const pl = parsePx(cs.paddingLeft);
    const pr = parsePx(cs.paddingRight);
    return Math.max(0, head.getBoundingClientRect().width - pl - pr);
  };

  const getGap = () => {
    const cs = getComputedStyle(head);
    // gap może być "10px" albo "10px 10px"
    const g = String(cs.gap || cs.columnGap || "0").split(" ")[0];
    return parsePx(g);
  };

  const clampAllToViewport = () => {
    const gap = getGap();
    const availInner = getHeadInnerWidth();
    const availNoGaps = Math.max(0, availInner - gap * (COL_COUNT - 1));

    // bierzemy aktualne szerokości nagłówka (oddają stan po varach i po max-content)
    const w = Array.from(head.children).map((el) => el.getBoundingClientRect().width);
    const sumNoGaps = w.reduce((a, b) => a + b, 0);

    if (sumNoGaps <= availNoGaps) return;

    // redukujemy w kolejności: name -> meta -> date -> type (Nr zostaje)
    const order = [
      { idx: 1, cssVar: "--col-name", min: 220 },
      { idx: 4, cssVar: "--col-meta", min: 120 },
      { idx: 3, cssVar: "--col-date", min: 140 },
      { idx: 2, cssVar: "--col-type", min: 120 },
    ];

    let overflow = sumNoGaps - availNoGaps;

    for (const o of order) {
      if (overflow <= 0) break;

      const cur = w[o.idx];
      const canCut = Math.max(0, cur - o.min);
      const cut = Math.min(canCut, overflow);

      if (cut > 0) {
        const next = Math.round(cur - cut);
        document.documentElement.style.setProperty(o.cssVar, `${next}px`);
        overflow -= cut;
        w[o.idx] = next;
      }
    }

    // zapisujemy po clampie, żeby przy kolejnym wejściu nie wracało „za szeroko”
    const nextCols = loadCols();
    for (const r of resizable) {
      const v = getComputedStyle(document.documentElement).getPropertyValue(r.cssVar).trim();
      if (v) nextCols[r.key] = v;
    }
    saveCols(nextCols);
  };

  // po załadowaniu zapisanych kolumn – natychmiast dociśnij do viewportu
  clampAllToViewport();

  // i dociśnij przy zmianie okna (to rozwiązuje: "zmniejszam okno, a list się nie zmniejsza")
  if (!head.dataset.resizeClamp) {
    head.dataset.resizeClamp = "1";
    window.addEventListener("resize", () => clampAllToViewport(), { passive: true });
  }

  for (const r of resizable) {
    const cell = head.children?.[r.idx];
    if (!cell) continue;

    const h = document.createElement("div");
    h.className = "col-resizer";
    h.title = "Przeciągnij, aby zmienić szerokość kolumny";
    cell.appendChild(h);

    h.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      h.setPointerCapture(ev.pointerId);

      const startX = ev.clientX;

      // aktualna szerokość komórki (px)
      const startW = cell.getBoundingClientRect().width;

      const onMove = (e) => {
        const dx = e.clientX - startX;
      
        const gap = getGap();
        const availInner = getHeadInnerWidth();
        const availNoGaps = Math.max(0, availInner - gap * (COL_COUNT - 1));
      
        // aktualne szerokości kolumn (px) z DOM — działają dobrze przy max-content
        const w = Array.from(head.children).map((el) => el.getBoundingClientRect().width);
      
        // docelowa szerokość przeciąganej kolumny
        let target = Math.max(r.min, Math.round(startW + dx));
      
        // ustawiamy ją "w pamięci"
        w[r.idx] = target;
      
        // minimalne szerokości dla indeksów (0 = Nr nie ruszamy)
        const MIN = {
          1: 220, // name
          2: 120, // type
          3: 140, // date
          4: 120, // meta
        };
      
        // kolejność "dawców" miejsca (kogo ściskamy),
        // czyli: najpierw te NA PRAWO (to jest to „poprzednia przyciska następną”),
        // potem ewentualnie na lewo (gdy prawa strona już na minimach)
        const donors = [];
        for (let i = r.idx + 1; i <= 4; i++) donors.push(i);
        for (let i = r.idx - 1; i >= 1; i--) donors.push(i);
      
        // ile przekraczamy dostępne miejsce
        let overflow = w.reduce((a, b) => a + b, 0) - availNoGaps;
      
        // jeśli przekraczamy — ściskamy kolejne kolumny do ich minimów
        if (overflow > 0) {
          for (const di of donors) {
            if (overflow <= 0) break;
            const cur = w[di];
            const min = MIN[di] ?? 0;
            const canCut = Math.max(0, cur - min);
            const cut = Math.min(canCut, overflow);
            if (cut > 0) {
              w[di] = cur - cut;
              overflow -= cut;
            }
          }
        }
      
        // jeśli dalej overflow>0, to znaczy, że już wszystko na minimach —
        // wtedy musimy też ograniczyć przeciąganą kolumnę.
        if (overflow > 0) {
          w[r.idx] = Math.max(r.min, w[r.idx] - overflow);
        }
      
        // Teraz zapisujemy szerokości do CSS vars (dla resizable kolumn)
        // idx: 1=name,2=type,3=date,4=meta
        document.documentElement.style.setProperty("--col-name", `${Math.round(w[1])}px`);
        document.documentElement.style.setProperty("--col-type", `${Math.round(w[2])}px`);
        document.documentElement.style.setProperty("--col-date", `${Math.round(w[3])}px`);
        document.documentElement.style.setProperty("--col-meta", `${Math.round(w[4])}px`);
      };

      const onUp = (e) => {
        h.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);

        // zapisz aktualną wartość var (już w px)
        const nextCols = loadCols();
        nextCols.name = getComputedStyle(document.documentElement).getPropertyValue("--col-name").trim();
        nextCols.type = getComputedStyle(document.documentElement).getPropertyValue("--col-type").trim();
        nextCols.date = getComputedStyle(document.documentElement).getPropertyValue("--col-date").trim();
        nextCols.meta = getComputedStyle(document.documentElement).getPropertyValue("--col-meta").trim();
        saveCols(nextCols);
      };

      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
    });
  }
}

export function renderList(state) {
  if (!elList) return;

  const foldersRaw = Array.isArray(state.folders) ? state.folders : [];
  const questionsRaw = Array.isArray(state.questions) ? state.questions : [];

  const sortKey = state?.sort?.key || "name";    // "name" | "type" | "date"
  const sortDir = state?.sort?.dir || "asc";     // "asc" | "desc"
  const mul = (sortDir === "desc") ? -1 : 1;

  const byNamePL = (a, b) =>
    String(a || "").localeCompare(String(b || ""), "pl", { sensitivity: "base" }) * mul;

  const items = [];

  for (const c of foldersRaw) {
    items.push({
      kind: "cat",
      ord: Number(c.ord) || 0,
      id: c.id,
      name: c.name || "Folder",
      date: toTime(pickDate(c)),
      raw: c,
    });
  }

  for (const q of questionsRaw) {
    const text = q?.payload?.text ?? q?.text ?? "Pytanie";
    items.push({
      kind: "q",
      ord: Number(q.ord) || 0,
      id: q.id,
      name: text,
      date: toTime(pickDate(q)),
      raw: q,
    });
  }

  if (!items.length) {
    elList.innerHTML = `<div style="opacity:.75">Brak elementów.</div>`;
    return;
  }

  function cmp(a, b) {
    if (sortKey === "name") {
      const r = byNamePL(a.name, b.name);
      if (r) return r;
      // stabilizuj po typie i dacie
      const t = getItemTypeSortKey(a, state).localeCompare(getItemTypeSortKey(b, state)) * mul;
      if (t) return t;
      return (a.date - b.date) * mul;
    }

    if (sortKey === "type") {
      const ta = getItemTypeSortKey(a, state);
      const tb = getItemTypeSortKey(b, state);
      const r = ta.localeCompare(tb) * mul;
      if (r) return r;
      return byNamePL(a.name, b.name);
    }

    if (sortKey === "date") {
      const r = ((a.date || 0) - (b.date || 0)) * mul;
      if (r) return r;
      return byNamePL(a.name, b.name);
    }

    if (sortKey === "ord") {
      const r = ((a.ord || 0) - (b.ord || 0)) * mul;
      if (r) return r;
      return byNamePL(a.name, b.name);
    }

    // fallback: name
    return byNamePL(a.name, b.name);
  }

  items.sort(cmp);

  // ===== HEAD (Nr | Nazwa | Typ | Data | Meta) =====
  const dirFor = (k) => (k === sortKey ? sortDir : "asc");

  const head = `
    <div class="list-head">
      <div class="h-num">Nr</div>
      <div class="h-main ${sortKey === "name" ? "active" : ""}" data-sort-key="name" data-dir="${esc(dirFor("name"))}">Nazwa</div>
      <div class="h-type ${sortKey === "type" ? "active" : ""}" data-sort-key="type" data-dir="${esc(dirFor("type"))}">Typ</div>
      <div class="h-date ${sortKey === "date" ? "active" : ""}" data-sort-key="date" data-dir="${esc(dirFor("date"))}">Data</div>
      <div class="h-meta">Info</div>
    </div>
  `;

  // ===== ROWS =====
  let n = 1;

  const rows = items.map((it) => {
    const key = (it.kind === "cat") ? `c:${it.id}` : `q:${it.id}`;
    const selClass = isSelected(state, key) ? " is-selected" : "";
    const draggable = (state.role === "owner" || state.role === "editor") ? `draggable="true"` : ``;

    if (it.kind === "cat") {
      const c = it.raw;

      // Typ: Folder + kropki meta (kategorie)
      const typeHtml = `
        <span style="opacity:.85;">Folder</span>
        <span style="margin-left:8px;">${metaDotsHtml(state, c.id, "c")}</span>
      `;

      // Meta: liczba elementów folderu – BEST EFFORT
      const count = state._directChildrenCount?.get?.(c.id) ?? null;
      const metaTxt = (count === null) ? "—" : `${count} elem.`;

      return `
        <div class="row${selClass}" ${draggable} data-kind="cat" data-id="${esc(c.id)}" style="cursor:pointer;">
          <div class="col-num">${n++}</div>

          <div class="col-main">
            <div class="title-line">
              <span class="title-text">📁 ${esc(c.name || "Folder")}</span>
              ${tagDotsHtml(state, c.id, "c")}
            </div>
          </div>

          <div class="col-type">${typeHtml}</div>
          <div class="col-date">${esc(fmtDate(pickDate(c)))}</div>
          <div class="col-meta">${esc(metaTxt)}</div>
        </div>
      `;
    } else {
      const q = it.raw;
      const text = q?.payload?.text ?? q?.text ?? "";

      const answersCount = Array.isArray(q?.payload?.answers) ? q.payload.answers.length : 0;
      const metaTxt = `${answersCount} odp.`;

      const typeHtml = `
        <span style="opacity:.85;">Pytanie</span>
        <span style="margin-left:8px;">${metaDotsHtml(state, q.id, "q")}</span>
      `;

      return `
        <div class="row${selClass}" ${draggable} data-kind="q" data-id="${esc(q.id)}" style="cursor:pointer;">
          <div class="col-num">${n++}</div>

          <div class="col-main">
            <div class="title-line">
              <span class="title-text">${esc(text || "Pytanie")}</span>
              ${tagDotsHtml(state, q.id, "q")}
            </div>
          </div>

          <div class="col-type">${typeHtml}</div>
          <div class="col-date">${esc(fmtDate(pickDate(q)))}</div>
          <div class="col-meta">${esc(metaTxt)}</div>
        </div>
      `;
    }
  }).join("");

  elList.innerHTML = head + rows;
  // po wyrenderowaniu head + rows
  initColumnResizers();
}

function svgBase(pathD){
  return `
  <svg class="tbIco" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="${pathD}"></path>
  </svg>`;
}

function svgFolderPlus(){ return svgBase("M10 4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6zm2 7h-2v2H8v2h2v2h2v-2h2v-2h-2v-2z"); }
function svgFilePlus(){ return svgBase("M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1v5h5M12 11h-2v2H8v2h2v2h2v-2h2v-2h-2v-2z"); }
function svgEdit(){ return svgBase("M3 17.25V21h3.75L19.81 7.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l10.06-10.06.92.92L5.92 20.08zM20.71 6.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 2.75 2.75 1.13-1.13z"); }
function svgTag(){return svgBase("M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3H4a2 2 0 0 0-2 2v5.59A2 2 0 0 0 2.83 12l9.59 9.59a2 2 0 0 0 2.83 0l5.34-5.34a2 2 0 0 0 0-2.83zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z"); }
function svgPencil(){ return svgBase("M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5a1 1 0 0 0 0-1.41l-1.59-1.59a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75L21 5.75z"); }
function svgTrash(){ return svgBase("M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"); }
function svgCopy(){ return svgBase("M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm4 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h12v14z"); }
function svgCut(){ return svgBase("M9.64 7.64L12 10l2.36-2.36a3 3 0 1 1 1.41 1.41L13.41 11l2.36 2.36a3 3 0 1 1-1.41 1.41L12 12.41l-2.36 2.36a3 3 0 1 1-1.41-1.41L10.59 11 8.23 8.64a3 3 0 1 1 1.41-1.41z"); }
function svgPaste(){ return svgBase("M19 4h-3.18A3 3 0 0 0 13 2h-2a3 3 0 0 0-2.82 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8-1h2a1 1 0 0 1 1 1v1H10V4a1 1 0 0 1 1-1zm8 19H5V6h2v2h10V6h2v16z"); }
function svgDuplicate(){ return svgBase("M7 7h12v14H7V7zm-2 2H3V3h14v2H5v4z"); }
function svgPlay(){ return svgBase("M8 5v14l11-7L8 5z"); }
function svgRefresh(){ return svgBase("M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 12.65-5.65z"); }
