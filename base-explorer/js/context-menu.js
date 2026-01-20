// base-explorer/js/context-menu.js
import { sb } from "../../js/core/supabase.js";
import { confirmModal } from "../../js/core/modal.js";
import { VIEW, setViewFolder, setViewAll } from "./state.js";
import { renderList } from "./render.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function hideContextMenu() {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;
  cm.hidden = true;
  cm.innerHTML = "";
}

function isEditor(state) {
  return state?.role === "owner" || state?.role === "editor";
}

function itemHtml({ label, disabled, danger }) {
  const cls = [
    "cm-item",
    disabled ? "disabled" : "",
    danger ? "danger" : "",
  ].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

export async function showContextMenu({ state, x, y, target }) {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;

  // target: { kind: 'cat'|'q'|'root', id: string|null }
  const editor = isEditor(state);

  const items = [];

  // Root (puste miejsce listy) – na razie tylko "Root" (bez akcji)
  if (target.kind === "root") {
    items.push({ label: "Root", disabled: true });
  }

  // Folder
  if (target.kind === "cat") {
    items.push({ label: "Otwórz folder", action: async () => {
      setViewFolder(state, target.id);
      state.selection?.keys?.clear?.();
      await state._api?.refreshList?.();
    }});
    // Akcje typu "Nowy folder/Nowe pytanie/Rename/Delete" dodamy w następnym etapie.
  }

  // Pytanie
  if (target.kind === "q") {
    items.push({ label: "Edytuj", disabled: true }); // modal edycji dojdzie później
    items.push({ label: "Usuń", danger: true, disabled: !editor, action: async () => {
      const ok = await confirmModal({
        title: "Usuń pytanie",
        text: "Na pewno usunąć to pytanie? Tego nie da się cofnąć.",
        okText: "Usuń",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      const { error } = await sb()
        .from("qb_questions")
        .delete()
        .eq("id", target.id);

      if (error) {
        console.error(error);
        alert("Nie udało się usunąć.");
        return;
      }

      // odśwież dane widoku
      if (state.view === VIEW.ALL) state._rootQuestions = null;
      await state._api?.refreshList?.();
    }});
  }

  items.push({ label: "Anuluj", action: () => hideContextMenu() });

  cm.innerHTML = items.map(itemHtml).join("");

  // Podpinamy akcje w kolejności
  const btns = Array.from(cm.querySelectorAll(".cm-item"));
  btns.forEach((btn, i) => {
    const it = items[i];
    if (!it || it.disabled || !it.action) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();
      await it.action();
    });
  });

  // Pozycjonowanie (żeby nie wychodziło poza ekran)
  cm.hidden = false;

  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = cm.getBoundingClientRect();

  const left = clamp(x, pad, vw - rect.width - pad);
  const top  = clamp(y, pad, vh - rect.height - pad);

  cm.style.left = `${left}px`;
  cm.style.top = `${top}px`;
}
