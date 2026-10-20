const STYLE_URL = new URL("../../css/tooltips.css?v=v2026-10-20T18044", import.meta.url).href;

function install() {
  if (typeof document === "undefined" || document.documentElement.dataset.tooltipSystem) return;
  document.documentElement.dataset.tooltipSystem = "ready";

  if (!document.querySelector(`link[href="${STYLE_URL}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLE_URL;
    document.head.append(link);
  }

  const tip = document.createElement("div");
  tip.className = "app-tooltip";
  tip.id = "appTooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);

  let active = null;
  let pointer = null;
  let frame = 0;
  let keyboardFocus = false;
  const selector = "[data-tooltip], [data-tip], [title]";

  function normalizeTitle(node) {
    if (!(node instanceof Element) || node.tagName === "IFRAME") return;
    const title = node.getAttribute("title");
    if (title === null) return;
    // Strony zmieniają title w trakcie działania (np. postęp w topbarze
    // Control). Podpowiedź przejętą z title aktualizujemy przy każdej zmianie;
    // jawne data-tooltip/data-tip ustawione przez stronę zostają.
    const fromTitle = node.hasAttribute("data-tooltip-from-title");
    if (fromTitle || (!node.hasAttribute("data-tooltip") && !node.hasAttribute("data-tip"))) {
      node.setAttribute("data-tooltip", title);
      node.setAttribute("data-tooltip-from-title", "");
      if (node === active) {
        if (title) { tip.textContent = title; schedulePosition(); } else hide();
      }
    }
    node.removeAttribute("title");
  }

  function normalize(root) {
    if (root instanceof Element) normalizeTitle(root);
    root.querySelectorAll?.("[title]").forEach(normalizeTitle);
  }

  function textFor(node) {
    return node?.getAttribute("data-tooltip") || node?.getAttribute("data-tip") || "";
  }

  function position() {
    frame = 0;
    if (!active || tip.hidden) return;
    const rect = active.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const x = pointer?.x ?? (rect.left + rect.width / 2);
    const y = pointer?.y ?? rect.top;
    const left = Math.max(8, Math.min(innerWidth - width - 8, x - width / 2));
    const above = y - height - 12;
    const top = above >= 8 ? above : Math.min(innerHeight - height - 8, (pointer ? y + 16 : rect.bottom + 10));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  function schedulePosition() {
    if (!frame) frame = requestAnimationFrame(position);
  }

  function show(node, point = null) {
    if (!node) return;
    const text = textFor(node);
    if (!text) return;
    active = node;
    pointer = point;
    tip.textContent = text;
    tip.hidden = false;
    schedulePosition();
  }

  function hide(node = null) {
    if (node && node !== active) return;
    active = null;
    pointer = null;
    tip.hidden = true;
  }

  normalize(document);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") normalizeTitle(record.target);
      else record.addedNodes.forEach((node) => node.nodeType === Node.ELEMENT_NODE && normalize(node));
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    keyboardFocus = false;
    const node = event.target.closest?.(selector);
    if (node && node !== active) show(node, { x: event.clientX, y: event.clientY });
  });
  document.addEventListener("pointerdown", (event) => {
    keyboardFocus = false;
    if (event.pointerType === "touch") hide();
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!active || event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY };
    schedulePosition();
  }, { passive: true });
  document.addEventListener("pointerout", (event) => {
    if (!active || !active.contains(event.target)) return;
    if (event.relatedTarget && active.contains(event.relatedTarget)) return;
    hide();
  });
  document.addEventListener("focusin", (event) => {
    if (!keyboardFocus) return;
    const node = event.target.closest?.(selector);
    if (node) show(node);
  });
  document.addEventListener("focusout", (event) => {
    if (active?.contains(event.target)) hide();
  });
  document.addEventListener("keydown", (event) => {
    keyboardFocus = true;
    if (event.key === "Escape") hide();
  });
  document.addEventListener("scroll", () => hide(), true);
  window.addEventListener("resize", schedulePosition, { passive: true });
}

// Testy jednostkowe importują moduły pośrednio w Node, bez DOM.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
