// host2/js/hostThemeManager.js
// Motyw Hosta idzie za tym samym ustawieniem co Display (row.detail.display.theme,
// patrz control2/js/app.js), ale Host nie ma płótna SVG do przerysowania jak
// display2/js/scene.js — to tylko zestaw tokenów CSS (kolor tła/atramentu,
// czcionka) nałożonych na <html>. Rejestr kluczy motywów (classic/modern,
// wraz z domyślnym) to WSPÓLNY plik z Display (display/js/themes.json) —
// host2.html leży w tym samym katalogu głównym co display2.html, więc ta
// sama względna ścieżka działa tu bez zmian. Host czyta stamtąd wyłącznie
// "key"/"default" — pole "module" (fabryka SVG planszy) go nie dotyczy.
const THEMES_JSON_URL = "./display/js/themes.json?v=v2026-09-25T20010";
const FALLBACK_KEY = "classic";

async function loadRegistryDefault() {
  try {
    const res = await fetch(THEMES_JSON_URL);
    const json = await res.json();
    return json.default || FALLBACK_KEY;
  } catch {
    return FALLBACK_KEY;
  }
}

// Jeden plik na motyw (host2/js/themes/<key>.js) — dodanie kolejnego motywu
// to nowy plik w tym katalogu, bez dotykania tego managera ani render.js.
async function loadHostTheme(key) {
  try {
    const mod = await import(`./themes/${key}.js`);
    if (mod?.hostTheme) return mod.hostTheme;
  } catch {}
  const fallback = await import(`./themes/${FALLBACK_KEY}.js`);
  return fallback.hostTheme;
}

export async function createHostThemeApplier() {
  const defaultKey = await loadRegistryDefault();
  const cache = new Map();
  let currentKey = null;

  async function apply(row) {
    const key = row.detail?.display?.theme || defaultKey;
    if (key === currentKey) return;
    currentKey = key;

    if (!cache.has(key)) cache.set(key, loadHostTheme(key));
    const theme = await cache.get(key);

    const root = document.documentElement;
    root.setAttribute("data-host-theme", theme.key);
    for (const [prop, value] of Object.entries(theme.vars || {})) {
      root.style.setProperty(prop, value);
    }
  }

  return { apply };
}
