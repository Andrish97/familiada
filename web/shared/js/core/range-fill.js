// Wypełnienie toru suwaka do bieżącej wartości (wspólny wygląd input[type=range]
// z silnika stylów). Pomija suwaki z własnym torem (picker koloru: .rng).
const SELECTOR = 'input[type="range"]:not(.rng)';

function paint(el) {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
  el.style.setProperty("--track", `linear-gradient(to right, var(--accent) ${pct}%, var(--w-14) ${pct}%)`);
}

function paintAll(root) {
  if (root.matches?.(SELECTOR)) paint(root);
  root.querySelectorAll?.(SELECTOR).forEach(paint);
}

if (typeof document !== "undefined" && !document.documentElement.dataset.rangeFill) {
  document.documentElement.dataset.rangeFill = "ready";
  for (const type of ["input", "change"]) document.addEventListener(type, (e) => { if (e.target.matches?.(SELECTOR)) paint(e.target); }, true);
  const start = () => {
    paintAll(document);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes") { if (r.target.matches?.(SELECTOR)) paint(r.target); }
        else r.addedNodes.forEach((n) => n.nodeType === 1 && paintAll(n));
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "min", "max"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
