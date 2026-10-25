// Pierwsza widoczna klatka: tłumaczenia i pomiary wspólnego silnika przed
// odsłonięciem. Dane nie są bramką: data-skel-step odsłania je niezależnie.
const measurements = new Set();
const waiting = new Set();
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
    if (!shown) return;
    const readyStep = records.some((record) => record.type === "attributes"
      && record.target.matches?.("[data-skel-step].skel-step-ready")
      && !(record.oldValue || "").split(/\s+/).includes("skel-step-ready"));
    // Nowy etap po danych: pomiar w mikrozadaniu, przed pierwszym renderem
    // odsłoniętej zawartości, bez ponownego chowania powłoki strony.
    if (readyStep) measurePage();
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["class"] });
  const loaded = document.readyState === "complete"
    || globalThis.performance?.getEntriesByType?.("navigation")[0]?.domContentLoadedEventStart > 0;
  if (loaded) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
