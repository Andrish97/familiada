// Pierwsza widoczna klatka: tłumaczenia i pomiary wspólnego silnika przed
// odsłonięciem. Dane nie są bramką: data-skel-step odsłania je niezależnie.
const measurements = new Set();
const waiting = new Set();
const stepHolds = new WeakMap();
let scheduled = false;
let shown = false;
let domReady = false;

/** Pomiar synchroniczny, powtarzalny, bez pobierania danych. Zwraca odpięcie. */
export function registerPageLayout(measure) {
  measurements.add(measure);
  return () => measurements.delete(measure);
}

/** Czekamy na pracę zmieniającą geometrię powłoki, nigdy na listy z danymi. */
export function holdPageLayout(promise) {
  if (shown) return promise;
  const token = {};
  waiting.add(token);
  Promise.resolve(promise).catch(() => {}).finally(() => {
    waiting.delete(token);
    requestReveal();
  });
  return promise;
}

/** Geometria etapu zależna od danych. Powłoka i pozostałe etapy nie czekają. */
export function holdSkeletonLayout(elements, preparation) {
  const steps = (Array.isArray(elements) ? elements : [elements])
    .filter((step) => step && !step.classList.contains("skel-step-ready"));
  for (const step of steps) {
    const state = stepHolds.get(step) || { pending: 0, requested: false };
    state.pending++;
    stepHolds.set(step, state);
  }
  Promise.resolve(preparation).catch(() => {}).finally(() => {
    for (const step of steps) {
      const state = stepHolds.get(step);
      state.pending--;
      if (!state.pending && state.requested) step.classList.add("skel-step-ready");
    }
  });
  return preparation;
}

function measurePage() {
  for (const measure of measurements) {
    try { measure(); } catch (error) { console.warn("[layout] measurement failed", error?.name); }
  }
}

function requestReveal() {
  if (shown || scheduled || !domReady || typeof requestAnimationFrame !== "function") return;
  const root = document.documentElement;
  if (root.classList.contains("page-loading") || waiting.size) return;
  scheduled = true;
  // Pierwszy pomiar uruchamia obserwatory rozmiaru. Drugi odbiera zmiany
  // po topbarze, podmianie ikon i tekstów; odsłonięcie jest w tej samej klatce.
  requestAnimationFrame(() => {
    measurePage();
    requestAnimationFrame(() => {
      scheduled = false;
      if (waiting.size || root.classList.contains("page-loading")) { requestReveal(); return; }
      measurePage();
      shown = true;
      globalThis.FamiliadaPageBoot?.finish();
      root.removeAttribute("data-layout-pending");
      window.dispatchEvent(new Event("page:shown"));
    });
  });
}

if (typeof document !== "undefined" && document.documentElement && typeof MutationObserver === "function") {
  const start = () => { domReady = true; requestReveal(); };
  new MutationObserver((records) => {
    requestReveal();
    let readyStep = false;
    for (const record of records) {
      if (record.type !== "attributes" || !record.target.matches?.("[data-skel-step].skel-step-ready")
          || (record.oldValue || "").split(/\s+/).includes("skel-step-ready")) continue;
      const state = stepHolds.get(record.target);
      if (state?.pending) {
        state.requested = true;
        record.target.classList.remove("skel-step-ready");
      } else readyStep = true;
    }
    // Nowy etap po danych: pomiar w mikrozadaniu przed jego renderem,
    // bez ponownego chowania gotowej powłoki lub innych etapów.
    if (shown && readyStep) measurePage();
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["class"] });
  const loaded = document.readyState === "complete"
    || globalThis.performance?.getEntriesByType?.("navigation")[0]?.domContentLoadedEventStart > 0;
  if (loaded) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
