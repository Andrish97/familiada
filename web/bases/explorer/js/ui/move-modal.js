// base-explorerjs/ui/move-modal.js
// Okno „Przenieś do… / Kopiuj do…” (E22 etap 9, prośba użytkownika
// 2026-10-21): drzewo folderów z wyszukiwaniem — zastępstwo przeciągania na
// telefonie i wygodne przenoszenie daleko w drzewie na komputerze.
// Zwraca wybrany folder (null = folder główny) albo undefined (anulowano).
// Przy przenoszeniu folderów nie da się wybrać ich samych ani ich wnętrza.

import { normalizeText } from "../data/listing.js?v=v2026-10-21T06574";
import { t } from "../../../../shared/translation/translation.js?v=v2026-10-21T06574";
import { icon } from "../../../../shared/js/core/icons.js?v=v2026-10-21T06574";
import { enterModalSheet, exitModalSheet } from "../../../../shared/js/core/modal-sheet.js?v=v2026-10-21T06574";

const ROOT = "root";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let active = null; // jedno okno naraz

/**
 * mode: "move" | "copy"
 * blockedIds: foldery, których nie wolno wybrać (przenoszone i ich wnętrze)
 * startId: folder, od którego zacząć (rozwinięta ścieżka, zaznaczony)
 */
export function openMoveModal(state, { mode = "move", blockedIds = new Set(), startId = null } = {}) {
  const overlay = document.getElementById("moveOverlay");
  const list = document.getElementById("moveList");
  const search = document.getElementById("moveSearch");
  const ok = document.getElementById("moveOk");
  if (!overlay || !list || !search || !ok) return Promise.resolve(undefined);
  active?.(undefined);

  const d = state.d;
  const open = new Set([ROOT]);
  for (const id of [startId, ...(startId ? d.ancestorIds(startId) : [])]) if (id) open.add(id);
  let picked = null; // ROOT | id folderu
  let query = "";

  document.getElementById("moveTitle").textContent = t(mode === "copy" ? "baseExplorer.move.copyTitle" : "baseExplorer.move.moveTitle");
  ok.innerHTML = `${icon(mode === "copy" ? "copy" : "folder")} ${esc(t(mode === "copy" ? "baseExplorer.move.copyHere" : "baseExplorer.move.moveHere"))}`;
  search.value = "";

  const rowHtml = (key, label, { depth = 0, toggle = "", path = "", isRoot = false } = {}) => {
    const blocked = !isRoot && blockedIds.has(key);
    const cls = ["moveRow", picked === key ? "is-picked" : "", blocked ? "is-blocked" : ""].filter(Boolean).join(" ");
    return `<div class="${cls}" role="treeitem" data-id="${esc(key)}" style="--depth:${depth}"${blocked ? ' aria-disabled="true"' : ""}>
      ${toggle}${icon(isRoot ? "home" : "folder", { className: "list-ico" })}
      <span class="moveName">${esc(label)}</span>${path ? `<span class="movePath">${esc(path)}</span>` : ""}
    </div>`;
  };

  function treeHtml() {
    const out = [];
    const walk = (parentId, depth) => {
      for (const f of d.childFolders(parentId)) {
        const kids = d.childFolders(f.id).length > 0;
        const isOpen = open.has(f.id);
        const toggle = kids
          ? `<button type="button" class="moveToggle" data-toggle="${esc(f.id)}" aria-label="${esc(t("baseExplorer.tree.toggle"))}">${icon(isOpen ? "caret-down" : "caret-right")}</button>`
          : `<span class="moveToggle"></span>`;
        out.push(rowHtml(f.id, f.name || t("baseExplorer.defaults.folder"), { depth, toggle }));
        if (kids && isOpen) walk(f.id, depth + 1);
      }
    };
    out.push(rowHtml(ROOT, t("baseExplorer.tree.root"), { isRoot: true, toggle: `<span class="moveToggle"></span>` }));
    walk(null, 1);
    return out.join("");
  }

  // wyszukiwanie: płaska lista pasujących folderów ze ścieżką
  function resultsHtml() {
    const words = normalizeText(query).split(/\s+/).filter(Boolean);
    const hits = [...d.folderById.values()].filter((f) => words.every((w) => d.folderSearchText(f.id).includes(w)));
    if (!hits.length) return `<div class="list-empty">${esc(t("baseExplorer.move.noFolders"))}</div>`;
    const pathOf = (f) => [...d.ancestorIds(f.id)].reverse().map((id) => d.folderById.get(id)?.name || "").join(" / ");
    return hits
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "pl", { sensitivity: "base" }))
      .map((f) => rowHtml(f.id, f.name || t("baseExplorer.defaults.folder"), { path: pathOf(f) || t("baseExplorer.tree.root") }))
      .join("");
  }

  function render() {
    list.innerHTML = query.trim() ? resultsHtml() : treeHtml();
    ok.disabled = picked === null;
  }

  return new Promise((resolve) => {
    const finish = (value) => {
      active = null;
      list.onclick = null;
      list.ondblclick = null;
      search.oninput = null;
      document.removeEventListener("keydown", onKey, true);
      document.getElementById("moveClose").onclick = null;
      document.getElementById("moveCancel").onclick = null;
      ok.onclick = null;
      overlay.onclick = null;
      exitModalSheet(overlay);
      overlay.style.display = "none";
      resolve(value);
    };
    active = finish;
    const confirm = () => { if (picked !== null) finish(picked === ROOT ? null : picked); };

    list.onclick = (e) => {
      const tog = e.target.closest("[data-toggle]");
      if (tog) {
        const id = tog.dataset.toggle;
        if (open.has(id)) open.delete(id); else open.add(id);
        render();
        return;
      }
      const row = e.target.closest(".moveRow[data-id]");
      if (!row || row.classList.contains("is-blocked")) return;
      // samo przełączenie klasy (bez przerysowania) — inaczej dwuklik
      // trafiałby w dwa różne elementy i przeglądarka by go nie zgłosiła
      picked = row.dataset.id;
      list.querySelectorAll(".moveRow.is-picked").forEach((el) => el.classList.remove("is-picked"));
      row.classList.add("is-picked");
      ok.disabled = false;
    };
    list.ondblclick = (e) => {
      const row = e.target.closest(".moveRow[data-id]");
      if (!row || row.classList.contains("is-blocked") || e.target.closest("[data-toggle]")) return;
      picked = row.dataset.id;
      confirm();
    };
    search.oninput = () => { query = search.value; render(); };
    // Esc zamyka, Enter zatwierdza (fokus bywa poza oknem — na dokumencie)
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(undefined); }
      else if (e.key === "Enter" && picked !== null) { e.preventDefault(); e.stopPropagation(); confirm(); }
    }
    document.addEventListener("keydown", onKey, true);
    document.getElementById("moveClose").onclick = () => finish(undefined);
    document.getElementById("moveCancel").onclick = () => finish(undefined);
    ok.onclick = confirm;
    overlay.onclick = (e) => { if (e.target === overlay) finish(undefined); };

    // start: folder, w którym jesteśmy (jeśli wolno go wybrać)
    if (startId && !blockedIds.has(startId)) picked = startId;
    render();
    overlay.style.display = "grid";
    enterModalSheet(overlay, { onClose: () => finish(undefined) });
    list.querySelector(".is-picked")?.scrollIntoView({ block: "nearest" });
  });
}
