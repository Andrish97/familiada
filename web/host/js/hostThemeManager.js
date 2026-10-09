// Loads Host theme factories from the same manifest Display uses. Each
// entry maps a shared theme key to a Host-specific createTheme(root) module.
const THEMES_URL = "/shared/data/display-themes.json?v=v2026-10-09T11572";
const FALLBACK_KEY = "classic";
const DEFAULT_COLORS = { A: "#c4002f", B: "#2a62ff", DOT: "#d7ff3d" };

async function loadRegistry() {
  try {
    const response = await fetch(THEMES_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const registry = await response.json();
    return {
      defaultKey: registry.default || FALLBACK_KEY,
      modules: new Map((registry.themes || [])
        .filter((entry) => entry.key && entry.hostModule)
        .map((entry) => [entry.key, entry.hostModule])),
    };
  } catch (error) {
    console.warn("[host2] nie udało się wczytać rejestru motywów:", error);
    return { defaultKey: FALLBACK_KEY, modules: new Map() };
  }
}

export async function createHostThemeApplier() {
  const { defaultKey, modules } = await loadRegistry();
  const factories = new Map();
  let currentKey = null;

  async function loadFactory(key) {
    if (factories.has(key)) return factories.get(key);
    const modulePath = modules.get(key);
    if (!modulePath) throw new Error(`Brak hostModule dla motywu "${key}"`);
    const module = await import(modulePath);
    if (typeof module.createTheme !== "function") {
      throw new Error(`Motyw Hosta "${key}" nie eksportuje createTheme(root)`);
    }
    factories.set(key, module.createTheme);
    return module.createTheme;
  }

  async function activate(key, root) {
    try {
      const createTheme = await loadFactory(key);
      const theme = createTheme(root) || {};
      root.dataset.hostTheme = key;
      root.dataset.hostRuled = String(theme.ruled !== false);
      return key;
    } catch (error) {
      console.warn(`[host2] nie udało się wczytać motywu "${key}":`, error);
      if (key === FALLBACK_KEY) return currentKey;
      return activate(FALLBACK_KEY, root);
    }
  }

  async function apply(row) {
    const root = document.documentElement;
    const key = row.detail?.display?.theme || defaultKey;
    if (key !== currentKey) currentKey = await activate(key, root);

    const colors = row.detail?.display?.colors || {};
    root.style.setProperty("--h-dot", colors.DOT || DEFAULT_COLORS.DOT);
    root.style.setProperty("--cover-grad-a", colors.A || DEFAULT_COLORS.A);
    root.style.setProperty("--cover-grad-b", colors.B || DEFAULT_COLORS.B);
  }

  return { apply };
}
