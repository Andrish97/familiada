// control/js/finalPicker.js
export function createFinalPicker({ ui, store, loadQuestions }) {
  let all = [];
  let selected = new Set(store.state.finalQuestionIds || []);
  const subs = new Set();

  function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
  function emit() { for (const fn of subs) fn(); }

  function getSelectedIds() { return Array.from(selected); }

  function canPickMore() { return selected.size < 5; }

  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else {
      if (!canPickMore()) return;
      selected.add(id);
    }
    emit();
  }

  function remove(id) { selected.delete(id); emit(); }

  function renderChips() {
    const root = document.getElementById("pickedChips");
    if (!root) return;

    const picked = all.filter((q) => selected.has(q.id));
    root.innerHTML = picked
      .map((q) => `
        <div class="chip">
          <span>#${q.ord}</span>
          <span>${escapeHtml(q.text || "")}</span>
          <button type="button" data-x="${q.id}" aria-label="Usuń">✕</button>
        </div>
      `)
      .join("");

    root.querySelectorAll("button[data-x]").forEach((b) => {
      b.addEventListener("click", () => remove(b.dataset.x));
    });
  }

  function renderList() {
    const root = document.getElementById("finalQList");
    if (!root) return;

    root.innerHTML = all
      .map((q) => {
        const checked = selected.has(q.id) ? "checked" : "";
        const disabled = !checked && !canPickMore() ? "disabled" : "";
        return `
          <label class="qRow">
            <input type="checkbox" data-qid="${q.id}" ${checked} ${disabled}/>
            <div class="meta">#${q.ord}</div>
            <div class="txt">${escapeHtml(q.text || "")}</div>
          </label>
        `;
      })
      .join("");

    root.querySelectorAll("input[data-qid]").forEach((inp) => {
      inp.addEventListener("change", () => toggle(inp.dataset.qid));
    });
  }

  async function reload() {
    ui.setMsg("msgFinalPick", "Ładuję pytania…");
    all = await loadQuestions();
    ui.setMsg("msgFinalPick", "");
    emit();
  }

  function render(enabled) {
    // sync from store if store already has 5
    const storeSel = new Set(store.state.finalQuestionIds || []);
    if (storeSel.size > 0 && storeSel.size !== selected.size) selected = storeSel;

    ui.setText("pickedCount", String(selected.size));
    renderChips();
    renderList();
    ui.setEnabled("btnSaveFinalQs", enabled && selected.size === 5);
  }

  onChange(() => {
    ui.setText("pickedCount", String(selected.size));
    renderChips();
    renderList();
    ui.setEnabled("btnSaveFinalQs", store.state.hasFinal === true && selected.size === 5);
  });

  reload().catch(() => {});
  return { render, reload, onChange, getSelectedIds };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
