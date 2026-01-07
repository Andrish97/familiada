export const loadJson = async (url) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nie można wczytać: ${url}`);
  return res.json();
};

// Buduje mapę GLYPHS z *wszystkich* kategorii w font_5x7.json,
// oprócz "meta". Czyli jak dodasz np. "emoji": {...}, to też zadziała.
export const buildGlyphMap = (FONT) => {
  const map = new Map();

  for (const [groupName, groupVal] of Object.entries(FONT || {})) {
    if (groupName === "meta") continue;
    const obj = groupVal || {};
    for (const [k, v] of Object.entries(obj)) {
      map.set(k, v);
    }
  }

  return map;
};

export const resolveGlyph = (GLYPHS, ch) => {
  const v = GLYPHS.get(ch);
  if (!v) return GLYPHS.get(" ") || [0,0,0,0,0,0,0];
  if (typeof v === "string" && v.startsWith("@")) {
    return resolveGlyph(GLYPHS, v.slice(1));
  }
  return v;
};
