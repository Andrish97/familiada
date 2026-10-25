// admin/js/tools.js — Narzędzia (laboratoria /admin/tools/*): lista i otwieranie w panelu.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { v as cacheBust } from "../../shared/js/core/cache-bust.js?v=v2026-10-25T06410";
import { TOOLS_MANIFEST, els, syncTopbarHeight } from "./core.js?v=v2026-10-25T06410";
import { activeTab, labelFromPath, setActiveTab } from "./tabs.js?v=v2026-10-25T06410";
import { placeDropdown } from "../../shared/js/core/popover.js?v=v2026-10-25T06410";

let previousTabBeforeTools = "maintenance";

async function loadToolsManifest() {
  try {
    const res = await fetch(await cacheBust(TOOLS_MANIFEST), { cache: "no-store" });
    if (!res.ok) throw new Error("manifest fetch failed");
    const data = await res.json();
    if (!data || !Array.isArray(data.tools)) throw new Error("invalid manifest");
    const items = data.tools
      .filter((t) => t && typeof t.title === "string" && typeof t.path === "string")
      .map((t) => ({ value: t.path, label: t.title }));
    if (items.length) return items;
  } catch(e) {
    // fall back to static list
  }
  return [
    { value: "/admin/tools/host-logo-lab/index.html", label: "Podgląd nowego logo Hosta" },
    { value: "/admin/tools/editor_5x7.html", label: labelFromPath("/admin/tools/editor_5x7.html") },
    { value: "/admin/tools/exporterandeditor.html", label: labelFromPath("/admin/tools/exporterandeditor.html") },
    { value: "/admin/tools/kora-builder.html", label: labelFromPath("/admin/tools/kora-builder.html") },
    { value: "/admin/tools/theme_builder.html", label: labelFromPath("/admin/tools/theme_builder.html") },
  ];
}

export async function initToolsSelect() {
  const items = await loadToolsManifest();
  if (!els.toolsMenu || !els.btnTools || !els.toolsDropdown) return;

  document.body.appendChild(els.toolsDropdown);
  els.toolsDropdown.replaceChildren(...items.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn sm";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      closeToolsMenu();
      openTool(item.value);
    });
    return button;
  }));

  // Położenie: wspólne popover.js (pod przyciskiem, od jego lewej krawędzi).
  const positionToolsMenu = () => {
    if (!els.btnTools || !els.toolsDropdown) return;
    els.toolsDropdown.hidden = false;
    placeDropdown(els.btnTools, els.toolsDropdown, { align: "start" });
  };

  const toggleToolsMenu = () => {
    if (els.toolsDropdown.hidden) {
      positionToolsMenu();
      els.btnTools.setAttribute("aria-expanded", "true");
    } else {
      closeToolsMenu();
    }
  };
  els.btnTools.addEventListener("click", toggleToolsMenu);
  document.addEventListener("pointerdown", (event) => {
    if (!els.toolsMenu.contains(event.target) && !els.toolsDropdown.contains(event.target)) closeToolsMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeToolsMenu();
  });
  window.addEventListener("resize", () => {
    if (!els.toolsDropdown.hidden) positionToolsMenu();
  }, { passive: true });
  window.addEventListener("scroll", () => {
    if (!els.toolsDropdown.hidden) positionToolsMenu();
  }, { passive: true, capture: true });
}

function closeToolsMenu() {
  if (!els.toolsDropdown || !els.btnTools) return;
  els.toolsDropdown.hidden = true;
  els.btnTools.setAttribute("aria-expanded", "false");
}

function openTool(path) {
  if (!els.toolsShell || !els.toolsFrame) return;
  previousTabBeforeTools = activeTab === "tools" ? "maintenance" : activeTab;
  els.toolsShell.hidden = false;
  els.toolsFrame.src = path;
  if (els.panelScreen) els.panelScreen.hidden = true;
  if (els.mainWrap) els.mainWrap.classList.add("is-hidden");
  if (els.footer) els.footer.classList.add("is-hidden");
  document.body.classList.add("tools-fullscreen");
  syncTopbarHeight();
  setActiveTab("tools");
}

export function closeTools() {
  if (!els.toolsShell || !els.toolsFrame) return;
  els.toolsFrame.src = "about:blank";
  els.toolsShell.hidden = true;
  if (els.panelScreen) els.panelScreen.hidden = false;
  if (els.mainWrap) els.mainWrap.classList.remove("is-hidden");
  if (els.footer) els.footer.classList.remove("is-hidden");
  document.body.classList.remove("tools-fullscreen");
  closeToolsMenu();
  syncTopbarHeight();
  setActiveTab(previousTabBeforeTools || "maintenance");
}
