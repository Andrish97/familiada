// js/core/fabric-compat.js
// Fabric 7 (web/shared/vendor/fabric.min.js) w trybie zgodnym z zapisami
// z Fabric 5: edytor rysunku logo, raster kropek i logo Prowadzącego.
//
// - Nowe obiekty zaczepiają się w lewym górnym rogu (Fabric 7 domyślnie
//   w środku). Kod edytora liczy left/top od rogu, a starsze sceny bywają
//   zapisane bez originX/originY (np. clipPath).
// - Zapis sceny ma nazwy typów jak w Fabric 5 ("rect", "i-text"…), żeby
//   format zapisanych logo i plików .famlogo się nie zmieniał. Fabric 7
//   wczytuje oba warianty.

const prepared = new WeakSet();

export function prepareFabric(fabric) {
  if (fabric && !prepared.has(fabric)) {
    fabric.FabricObject.ownDefaults.originX = "left";
    fabric.FabricObject.ownDefaults.originY = "top";
    prepared.add(fabric);
  }
  return fabric;
}

const LEGACY_TYPES = {
  Rect: "rect", Ellipse: "ellipse", Circle: "circle", Triangle: "triangle", Line: "line",
  Path: "path", Polygon: "polygon", Polyline: "polyline",
  IText: "i-text", Textbox: "textbox", Text: "text", FabricText: "text",
  Image: "image", FabricImage: "image", Group: "group",
};

/** Scena z canvas.toObject() z nazwami typów jak w Fabric 5 (kopia, wejście nietknięte). */
export function legacySceneTypes(scene) {
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = key === "type" && typeof item === "string" ? (LEGACY_TYPES[item] || item) : visit(item);
    }
    return out;
  };
  return visit(scene);
}
