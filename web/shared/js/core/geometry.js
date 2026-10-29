// Pomiary na żywo — jedyne miejsce, które zapisuje położenie i rozmiar liczone
// z pomiarów (menu, dymki, ramka zaznaczania, kadr, zoom, kolumny, siatka).
// Skrypt ustawia tylko zmienne CSS i klasę `geo-*`; jak element się układa,
// mówią reguły silnika (components.css, warstwa states):
//   geo-float      element nad stroną (position: fixed) w punkcie --float-x/-y
//   geo-box        prostokąt w kontenerze: --box-x/-y/-w/-h
//   geo-shift      przesunięcie i skala: --shift-x/-y/-scale
//   geo-cell       komórka siatki: --cell-row/-col
//   geo-w, geo-min-w   szerokość / najmniejsza szerokość: --geo-w / --geo-min-w
//   geo-measuring  chwilowo widoczny, ale niewidzialny i bez kliknięć (pomiar)
//   geo-anchor     kontener odniesienia dla geo-box (position: relative)

const px = (v) => (typeof v === "number" ? `${Math.round(v * 100) / 100}px` : v);

function vars(el, map) {
  for (const [name, value] of Object.entries(map)) {
    if (value == null || value === "") el.style.removeProperty(name);
    else el.style.setProperty(name, px(value));
  }
}

// Początek szuflady pod zmienną wysokością jej paska narzędzi.
export function setDrawerTop(el, top) {
  if (el) vars(el, { '--drawer-top': top });
}

// Przodek z transform/filter/perspective tworzy dla position: fixed własny
// układ odniesienia (np. wysuwany panel Poczty) — wtedy współrzędne okna
// trzeba przeliczyć względem niego.
function fixedOrigin(el) {
  for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (s.transform !== "none" || s.filter !== "none" || s.perspective !== "none" || /paint|layout|strict|content/.test(s.contain)) {
      return a.getBoundingClientRect();
    }
  }
  return null;
}

/** Element nad stroną: left/top (albo bottom) we współrzędnych okna, opcjonalnie width i maxHeight. */
export function setFloat(el, { left = null, top = null, bottom = null, width = null, maxHeight = null } = {}) {
  if (!el) return;
  const o = fixedOrigin(el);
  if (o) {
    if (typeof left === "number") left -= o.left;
    if (typeof top === "number") top -= o.top;
    if (typeof bottom === "number") bottom -= innerHeight - o.bottom;
  }
  vars(el, { "--float-x": left, "--float-y": top, "--float-bottom": bottom, "--float-w": width, "--float-max-h": maxHeight });
  el.classList.add("geo-float");
  el.classList.toggle("geo-float--sized", width != null || maxHeight != null);
}

export function clearFloat(el) {
  if (!el) return;
  vars(el, { "--float-x": null, "--float-y": null, "--float-bottom": null, "--float-w": null, "--float-max-h": null });
  el.classList.remove("geo-float", "geo-float--sized");
}

/** Pomiar ukrytego elementu: na czas fn widoczny dla układu, niewidzialny dla oka i kliknięć. */
export function measureHidden(el, fn) {
  const wasHidden = el.hidden;
  if (wasHidden) {
    el.hidden = false;
    el.classList.add("geo-measuring");
  }
  try { return fn(el.getBoundingClientRect()); }
  finally {
    if (wasHidden) {
      el.classList.remove("geo-measuring");
      el.hidden = true;
    }
  }
}

/** Prostokąt w kontenerze (ramka zaznaczania, kadr obrazu). */
export function setBox(el, { left, top, width, height }) {
  if (!el) return;
  vars(el, { "--box-x": left, "--box-y": top, "--box-w": width, "--box-h": height });
  el.classList.add("geo-box");
}

/** Kontener odniesienia dla setBox, gdy sam nie jest pozycjonowany. */
export function anchorBox(container) {
  if (container && getComputedStyle(container).position === "static") container.classList.add("geo-anchor");
}

/** Przesunięcie i skala (zoom, przesuwanie siatki za tekstem); null zdejmuje. */
export function setShift(el, shift) {
  if (!el) return;
  if (!shift) {
    vars(el, { "--shift-x": null, "--shift-y": null, "--shift-scale": null });
    el.classList.remove("geo-shift");
    return;
  }
  const { x = 0, y = 0, scale = 1 } = shift;
  vars(el, { "--shift-x": x, "--shift-y": y, "--shift-scale": String(scale) });
  el.classList.add("geo-shift");
}

/** Komórka siatki (wiersz, kolumna — liczba albo zapis "1 / 3"). */
export function setCell(el, row, col) {
  if (!el) return;
  vars(el, { "--cell-row": String(row), "--cell-col": String(col) });
  el.classList.add("geo-cell");
}

/** Szerokość z pomiaru (kolumna, okno); null zdejmuje. */
export function setWidth(el, width) {
  if (!el) return;
  vars(el, { "--geo-w": width });
  el.classList.toggle("geo-w", width != null && width !== "");
}

/** Najmniejsza szerokość z pomiaru (tabela szersza niż okno). */
export function setMinWidth(el, width) {
  if (!el) return;
  vars(el, { "--geo-min-w": width });
  el.classList.toggle("geo-min-w", width != null && width !== "");
}

/** To samo jako atrybut style w szablonie HTML (np. <col>): tylko zmienne CSS. */
export function widthAttr(width) {
  return `class="geo-w" style="--geo-w:${px(width)}"`;
}
export function minWidthAttr(width) {
  return `style="--geo-min-w:${px(width)}"`;
}
