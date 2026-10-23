// split-tabs.js
// Karta dzielona (decyzja 2026-10-23, docs/wspolne-style-plan.md): na
// szerokim ekranie panele stoją obok siebie, na telefonie (SPLIT_MQ) jedna
// karta z wypustkami pokazuje aktywny panel. Wygląd: .tabs-card--split
// i .split-panels w shared/style/components.css (ten sam warunek media).
//   <div class="tabs-card tabs-card--split">
//     <div class="tabs-strip" role="tablist"> .tab-slot > button.tab-label[data-split-tab=a] … </div>
//     <div class="split-panels"> <section class="card" data-split-panel="a"> … </div>
//   </div>
// Aktywny panel, wypustka i jej slot dostają .active; role tab/tabpanel
// i aria tylko w trybie wąskim. Strzałki, Home i End przełączają wypustki.

export const SPLIT_MQ = "(max-width: 600px), (max-width: 980px) and (orientation: landscape)";

/**
 * root — .tabs-card--split; active — nazwa startowa; onChange(name) — po
 * wyborze przez użytkownika (np. zapis ?tab=). Zwraca { select, active, narrow }.
 */
export function initSplitTabs(root, { active, onChange } = {}) {
  const mq = matchMedia(SPLIT_MQ);
  const tabs = [...root.querySelectorAll("[data-split-tab]")];
  const panels = [...root.querySelectorAll("[data-split-panel]")];
  const names = tabs.map((tab) => tab.dataset.splitTab);
  let current = names.includes(active) ? active : names[0];
  // Etykieta panelu na szerokim ekranie (np. jego nagłówek) wraca po wyjściu z trybu wąskiego.
  const wideLabel = new Map(panels.map((panel) => [panel, panel.getAttribute("aria-labelledby")]));

  function apply() {
    const narrow = mq.matches;
    for (const tab of tabs) {
      const on = tab.dataset.splitTab === current;
      tab.classList.toggle("active", on);
      tab.closest(".tab-slot")?.classList.toggle("active", on);
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const panel of panels) {
      const tab = tabs.find((t) => t.dataset.splitTab === panel.dataset.splitPanel);
      panel.classList.toggle("active", panel.dataset.splitPanel === current);
      if (narrow) {
        panel.setAttribute("role", "tabpanel");
        if (tab?.id) panel.setAttribute("aria-labelledby", tab.id);
      } else {
        panel.removeAttribute("role");
        if (wideLabel.get(panel)) panel.setAttribute("aria-labelledby", wideLabel.get(panel));
        else panel.removeAttribute("aria-labelledby");
      }
    }
  }
  function select(name, { user = false } = {}) {
    if (!names.includes(name)) return;
    current = name;
    apply();
    if (user) onChange?.(name);
  }
  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab.dataset.splitTab, { user: true }));
    tab.addEventListener("keydown", (event) => {
      const i = names.indexOf(current), last = names.length - 1;
      const next = { ArrowLeft: i ? i - 1 : last, ArrowRight: i === last ? 0 : i + 1, Home: 0, End: last }[event.key];
      if (next == null) return;
      event.preventDefault();
      select(names[next], { user: true });
      tabs[next].focus();
    });
  }
  mq.addEventListener("change", apply);
  apply();
  return { select, active: () => current, narrow: () => mq.matches };
}
