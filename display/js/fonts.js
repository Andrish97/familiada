export const loadJson = async (url) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nie można wczytać: ${url}`);
  return res.json();
};

export const buildGlyphMap = (FONT) => {
  const map = new Map();
  for (const group of ["letters","digits","punctuation","math","special"]) {
    for (const [k, v] of Object.entries(FONT[group] || {})) map.set(k, v);
  }
  return map;
};

export const resolveGlyph = (GLYPHS, ch) => {
  const v = GLYPHS.get(ch);
  if (!v) return GLYPHS.get(" ") || [0,0,0,0,0,0,0];
  if (typeof v === "string" && v.startsWith("@")) return resolveGlyph(GLYPHS, v.slice(1));
  return v;
};
