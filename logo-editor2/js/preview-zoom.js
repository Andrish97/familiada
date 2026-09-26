// familiada/logo-editor2/js/preview-zoom.js
// Pełnoekranowy podgląd: własny pinch-zoom/pan na canvasie i blokada
// powiększania całej strony na czas otwarcia podglądu.

// Własny pinch-zoom/pan na canvasie podglądu, niezależny od powiększania
// całej strony przeglądarki (patrz touch-action:none w logo-editor.css —
// bez tego dwa palce na canvasie zoomowałyby cały layout, nie samą treść).
export function initPreviewPinchZoom(container, canvas) {
  // Model: canvas ma transform-origin 0 0, a jego NIEPRZEKSZTAŁCONY
  // lewy-górny róg leży w kontenerze w punkcie (offX, offY) — kontener
  // centruje canvas (flex), więc zwykle to NIE jest (0,0). Punkt treści p
  // (w pikselach canvasa przy scale=1) jest na ekranie w:
  //   container.left + offX + tx + p * scale
  // Wcześniej offX/offY były pomijane, a pinch dodawał przesunięcie palców
  // do już przesuniętego tx przy KAŻDYM ruchu (błąd się kumulował) — stąd
  // skakanie obrazu przy przybliżaniu i ograniczaniu przesuwania.
  let scale = 1, tx = 0, ty = 0;
  const MIN_SCALE = 1, MAX_SCALE = 6;
  const pointers = new Map();
  let pinch = null;    // { p: {x,y}, startScale, startDist } — punkt treści pod palcami
  let panStart = null; // { x, y, tx, ty } dla pojedynczego palca gdy scale>1

  // Geometria liczona RAZ na początku gestu: nasz zoom to tylko CSS
  // transform (nie zmienia layoutu), a odczyty getBoundingClientRect()/
  // offsetWidth przy każdym pointermove wymuszały reflow i lagi.
  let geo = null; // { left, top, w, h, offX, offY, cw, ch }
  const measure = () => {
    const cRect = container.getBoundingClientRect();
    const kRect = canvas.getBoundingClientRect();
    geo = {
      left: cRect.left, top: cRect.top, w: cRect.width, h: cRect.height,
      // kRect uwzględnia bieżący transform: left = container.left + offX + tx
      offX: kRect.left - cRect.left - tx,
      offY: kRect.top - cRect.top - ty,
      cw: canvas.offsetWidth, ch: canvas.offsetHeight,
    };
  };

  // Zapis transformu najwyżej raz na klatkę.
  let rafId = null;
  const apply = () => {
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      canvas.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    });
  };

  const reset = () => {
    scale = 1; tx = 0; ty = 0;
    pointers.clear();
    pinch = null; panStart = null; geo = null;
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    canvas.style.transform = "";
  };

  // Treść większa od kontenera — nie odsuwaj jej krawędzi do środka;
  // mniejsza — trzymaj ją wyśrodkowaną.
  const clampAxis = (t, off, size, box) => {
    const s = size * scale;
    if (s <= box) return (box - s) / 2 - off;
    return Math.max(box - off - s, Math.min(-off, t));
  };
  const clamp = () => {
    if (!geo) measure();
    tx = clampAxis(tx, geo.offX, geo.cw, geo.w);
    ty = clampAxis(ty, geo.offY, geo.ch, geo.h);
  };

  const local = (pt) => ({ x: pt.x - geo.left - geo.offX, y: pt.y - geo.top - geo.offY });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const startPinch = () => {
    const [a, b] = [...pointers.values()];
    const m = local(mid(a, b));
    pinch = {
      p: { x: (m.x - tx) / scale, y: (m.y - ty) / scale },
      startScale: scale,
      startDist: dist(a, b) || 1,
    };
    panStart = null;
  };
  const startPan = (pt) => { panStart = { x: pt.x, y: pt.y, tx, ty }; };

  container.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    container.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    measure();
    if (pointers.size === 2) startPinch();
    else if (pointers.size === 1 && scale > 1) startPan({ x: e.clientX, y: e.clientY });
  }, { passive: true });

  container.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.startScale * ((dist(a, b) || 1) / pinch.startDist)));
      // Ten sam punkt treści zostaje pod środkiem palców.
      const m = local(mid(a, b));
      tx = m.x - pinch.p.x * scale;
      ty = m.y - pinch.p.y * scale;
      clamp();
      apply();
    } else if (pointers.size === 1 && panStart) {
      tx = panStart.tx + (e.clientX - panStart.x);
      ty = panStart.ty + (e.clientY - panStart.y);
      clamp();
      apply();
    }
  }, { passive: true });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    pinch = null;
    if (pointers.size === 1 && scale > 1) {
      // Z dwóch palców na jeden: przesuwanie pozostałym palcem od razu,
      // od jego bieżącej pozycji (bez skoku).
      const [remaining] = pointers.values();
      startPan(remaining);
    } else if (pointers.size === 0) {
      panStart = null;
    }
    if (scale <= 1 && pointers.size === 0) reset();
  };
  container.addEventListener("pointerup", endPointer, { passive: true });
  container.addEventListener("pointercancel", endPointer, { passive: true });

  let lastTap = 0;
  container.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch" || pointers.size > 0) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      // Podwójne stuknięcie: 1x <-> 2.5x, stuknięty punkt na środek.
      if (scale > 1) {
        reset();
      } else {
        measure();
        const pt = local({ x: e.clientX, y: e.clientY });
        const p = { x: (pt.x - tx) / scale, y: (pt.y - ty) / scale };
        scale = 2.5;
        tx = geo.w / 2 - geo.offX - p.x * scale;
        ty = geo.h / 2 - geo.offY - p.y * scale;
        clamp();
        apply();
      }
      lastTap = 0;
      return;
    }
    lastTap = now;
  }, { passive: true });

  // Jawne zablokowanie natywnych gestów (pinch strony, scroll) — sam
  // touch-action:none nie zawsze wystarcza.
  const stopNativeGesture = (e) => { if (e.cancelable) e.preventDefault(); };
  container.addEventListener("touchstart", (e) => { if (e.touches && e.touches.length >= 2) stopNativeGesture(e); }, { passive: false });
  container.addEventListener("touchmove", stopNativeGesture, { passive: false });
  // Safari: własny mechanizm pinch-zoom niezależny od touch/pointer.
  container.addEventListener("gesturestart", (e) => e.preventDefault());
  container.addEventListener("gesturechange", (e) => e.preventDefault());

  return { reset };
}

// touch-action:none na kontenerze canvasa (logo-editor.css) nie wystarcza
// niezawodnie na wszystkich przeglądarkach (zwłaszcza iOS Safari potrafi
// i tak obsłużyć dwa palce jako natywny zoom CAŁEJ strony, niezależnie od
// touch-action) — na czas otwarcia podglądu dodatkowo blokujemy
// powiększanie strony przez meta viewport. WAŻNE: iOS Safari na wielu
// wersjach IGNORUJE zmianę samego atrybutu content= na już wczytanej
// stronie (viewport jest odczytywany raz, przy pierwszym parsowaniu) —
// dlatego USUWAMY i wstawiamy NOWY element <meta>, żeby wymusić ponowne
// odczytanie przez silnik przeglądarki.
export function lockPageZoomForPreview() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || meta.dataset.locked === "1") return;
  const orig = meta.getAttribute("content") || "";
  meta.dataset.origViewport = orig;
  const next = meta.cloneNode(true);
  next.setAttribute("content", `${orig}, maximum-scale=1, user-scalable=no`);
  next.dataset.locked = "1";
  next.dataset.origViewport = orig;
  meta.replaceWith(next);
}
export function unlockPageZoomAfterPreview() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || meta.dataset.origViewport == null) return;
  const next = meta.cloneNode(true);
  next.setAttribute("content", meta.dataset.origViewport);
  delete next.dataset.origViewport;
  delete next.dataset.locked;
  meta.replaceWith(next);
}
