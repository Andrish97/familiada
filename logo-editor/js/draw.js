// familiada/logo-editorjs/draw.js
// DRAW -> Fabric.js (wektor) -> raster 150x70 bits (PIX_150x70)
//
// ZAŁOŻENIA (Twoje):
// - WORLD = SCENA (rozmiar świata = rozmiar canvasa; granice świata = granice sceny)
// - można przybliżać (zoom in), ale oddalać tylko do granic świata (min zoom = 1)
// - pan tylko gdy zoom > 1 i zawsze ograniczony (bez pokazywania "poza")
// - nie można rysować / przesuwać obiektów poza granice świata
// - gumka: tylko usuwanie obiektów "dotykiem" (bez ustawień)
// - kolor obramowania = kolor domyślny narzędzia (⬛️/⬜️ na toolbarze)
// - fill ma osobny wybór koloru w ustawieniach narzędzia (dla figur)
// - kursor: overlay (PS-like): pędzel = kółko, gumka = kwadrat, figury = crosshair
// - skróty: PS-like + (Space=Pan temp, Ctrl/Cmd=Select temp, Shift idealne kształty, strzałki przesuwają)

import { confirmModal } from "../../js/core/modal.js?v=v2026-04-04T03010";
import { initUiSelect } from "../../js/core/ui-select.js?v=v2026-04-04T03010";
import { t } from "../../translation/translation.js?v=v2026-04-04T03010";
import { v as cacheBust } from "../../js/core/cache-bust.js?v=v2026-04-04T03010";

export function initDrawEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // =========================================================
  // DOM
  // =========================================================
  const paneDraw = document.getElementById("paneDraw");
  const drawCanvasEl = document.getElementById("drawStage");
  const drawStageHost = document.getElementById("drawStageHost"); // ratio box
  const drawSettings = document.getElementById("drawSettings"); // contextual settings

  // Font picker elements
  const drawFontPickPop = document.getElementById("drawFontPickPop");
  const drawFontSearchInp = document.getElementById("drawFontSearchInp");
  const drawFontSearchClear = document.getElementById("drawFontSearchClear");
  const drawFontList = document.getElementById("drawFontList");
  const drawFontEmpty = document.getElementById("drawFontEmpty");

  // Buttons (z HTML)
  const tSelect   = document.getElementById("tSelect");
  const tPan      = document.getElementById("tPan");
  const tText     = document.getElementById("tText");
  const tZoomIn   = document.getElementById("tZoomIn");
  const tZoomOut  = document.getElementById("tZoomOut");

  const tBrush    = document.getElementById("tBrush");
  const tEraser   = document.getElementById("tEraser");
  const tLine     = document.getElementById("tLine");
  const tRect     = document.getElementById("tRect");
  const tEllipse  = document.getElementById("tEllipse");
  const tPoly     = document.getElementById("tPoly");

  const tUndo     = document.getElementById("tUndo");
  const tRedo     = document.getElementById("tRedo");
  const tClear    = document.getElementById("tClear");
  const tEye      = document.getElementById("tEye");

  const tPolyDone = document.getElementById("tPolyDone");

  // Kolory: bg (tło sceny)
  const tBg       = document.getElementById("tBg");     // 🖼️

    // =========================================================
  // Ikony dynamiczne: FG (kolor narzędzia) i BG (tło sceny)
  // =========================================================

  const ICON_BG = {

    // BIAŁE TŁO — pełny prostokąt
    WHITE: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect class="fill"
              x="4" y="5" width="16" height="14" rx="2"></rect>
      </svg>
    `,
  
    // CZARNE TŁO — pusty prostokąt z cienkim obramowaniem
    BLACK: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4.5" y="5.5" width="15" height="13" rx="2"
              stroke-width="1"></rect>
      </svg>
    `,
  };

  // =========================================================
  // Kolory
  // =========================================================

  // fg = kolor kreski/pędzla/tekstu (BLACK/WHITE)
  // bg = tło sceny (BLACK/WHITE)
  // W display: BLACK = piksel zapalony (1), WHITE = piksel zgaszony (0)
  let fg = "BLACK"; // WHITE | BLACK — kolor rysowania

  function syncDynamicIcons() {
    if (tBg) {
      tBg.innerHTML = ICON_BG[bg] || ICON_BG.BLACK;
      tBg.setAttribute("aria-label", t("logoEditor.draw.aria.backgroundColor", { color: bg === "BLACK" ? t("logoEditor.draw.colors.black") : t("logoEditor.draw.colors.white") }));
    }
  }

  // =========================================================
  // Kontekstowe ustawienia W TOOLBARZE (inline)
  // =========================================================
  const toolCtx = document.getElementById("toolCtxSettings");

  function ctxHTML(html) {
    if (!toolCtx) return;
    toolCtx.innerHTML = html;
  }
  function ctxHide() {
    if (!toolCtx) return;
    toolCtx.innerHTML = "";
  }

  // Wybór koloru: przycisk wypełniony aktualnym kolorem
  // value = "BLACK" | "WHITE" | "MIXED"
  function ctxColorBtn(value) {
    const isMixed = value === "MIXED";
    const isBlack = value === "BLACK";
    const bg = isMixed ? "linear-gradient(135deg, #000 50%, #fff 50%)" : (isBlack ? '#000' : '#fff');
    return `<button class="ctxColorBtn" type="button" data-color-toggle="${isMixed ? 'mixed' : (isBlack ? 'black' : 'white')}" style="background:${bg};${isBlack ? 'border-color:#444' : 'border-color:#999'};" title="${isMixed ? 'Mieszany' : (isBlack ? 'Czarny' : 'Biały')}"></button>`;
  }
  function ctxColorBind(fn) {
    toolCtx?.querySelectorAll("[data-color-toggle]").forEach(btn => {
      btn.addEventListener("click", () => fn(btn.dataset.colorToggle));
    });
  }
  function fabricToBW(color) {
    if (!color || color === "transparent" || color === "rgba(0,0,0,0)") return "WHITE";
    const c = color.toLowerCase().trim();
    if (c === "#000" || c === "#000000" || c === "rgb(0,0,0)" || c === "rgb(0, 0, 0)" || c === "black") return "BLACK";
    return "WHITE";
  }

  // =========================================================
  // Ustawienia narzędzia (gdy nic nie zaznaczone)
  // =========================================================
  function renderToolSettings() {
    const tn = tool.toLowerCase();
    if (tn === "brush") {
      ctxHTML(`<div class="ctxGroup"><span class="ctxLabel">Grubość</span><input id="cStrokeW" class="ctxInput" type="number" min="1" max="50" step="1" value="${strokeWidth}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">Kolor</span>${ctxColorBtn(fg)}</div>`);
      document.getElementById("cStrokeW")?.addEventListener("input", e => { strokeWidth = clamp(+e.target.value||1,1,50); updateCursor(); });
      ctxColorBind(() => { fg = fg==="BLACK"?"WHITE":"BLACK"; syncDynamicIcons(); renderToolSettings(); });
    } else if (tn === "eraser") {
      ctxHTML(`<div class="ctxGroup"><span class="ctxLabel">Rozmiar</span><input id="cEraser" class="ctxInput" type="number" min="1" max="50" step="1" value="${eraserSize}"/></div>`);
      document.getElementById("cEraser")?.addEventListener("input", e => { eraserSize = clamp(+e.target.value||10,1,50); updateCursor(); });
    } else if (tn === "line") {
      ctxHTML(`<div class="ctxGroup"><span class="ctxLabel">Grubość</span><input id="cStrokeW" class="ctxInput" type="number" min="1" max="50" step="1" value="${strokeWidth}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">Kolor</span>${ctxColorBtn(fg)}</div>`);
      document.getElementById("cStrokeW")?.addEventListener("input", e => { strokeWidth = clamp(+e.target.value||1,1,50); });
      ctxColorBind(() => { fg = fg==="BLACK"?"WHITE":"BLACK"; syncDynamicIcons(); renderToolSettings(); });
    } else if (tn === "rect" || tn === "ellipse" || tn === "poly") {
      ctxHTML(`<div class="ctxGroup"><span class="ctxLabel">Obrys</span><input id="cStrokeW" class="ctxInput" type="number" min="0" max="50" step="1" value="${strokeWidth}"/></div>
        <div class="ctxGroup">${ctxColorBtn(fg)}</div>
        <div class="ctxGroup"><label class="ctxChk"><input type="checkbox" id="cFill" ${fillEnabled?"checked":""}/>Wypeł.</label>${ctxColorBtn(fabricToBW(fillColor))}</div>`);
      document.getElementById("cStrokeW")?.addEventListener("input", e => { strokeWidth = clamp(+e.target.value||1,0,50); });
      document.getElementById("cFill")?.addEventListener("change", e => { fillEnabled = e.target.checked; renderToolSettings(); });
      ctxColorBind(() => { fg = fg==="BLACK"?"WHITE":"BLACK"; fillColor = fillColor==="#000000"?"#ffffff":"#000000"; renderToolSettings(); });
    } else if (tn === "text") {
      const fntLbl = DRAW_FONTS.find(f=>f.value===textFont)?.label || "Font";
      ctxHTML(`<div class="ctxGroup"><button class="ctxBtn" id="cFont" style="min-width:80px;max-width:120px;justify-content:space-between;display:flex;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fntLbl}</span><span style="opacity:.4;">▾</span></button></div>
        <div class="ctxGroup"><span class="ctxLabel">Roz.</span><input id="cSz" class="ctxInput" type="number" min="10" max="220" step="1" value="${textFontSize}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">Linia</span><input id="cLH" class="ctxInput" type="number" min="0.6" max="3.0" step="0.05" value="${textLineHeight}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">Odst.</span><input id="cSp" class="ctxInput" type="number" min="0" max="20" step="0.5" value="${textLetterSpacing}"/></div>
        <div class="ctxGroup"><button class="ctxBtn" id="cB" ${textBold?"on":""}>B</button><button class="ctxBtn" id="cI" ${textItalic?"on":""}>I</button><button class="ctxBtn" id="cU" ${textUnderline?"on":""}>U</button></div>
        <div class="ctxGroup"><span class="ctxLabel">Kolor</span>${ctxColorBtn(fg)}</div>`);
      document.getElementById("cFont")?.addEventListener("click", () => { openDrawFontPicker(v=>{textFont=v;renderToolSettings();},textFont); });
      document.getElementById("cSz")?.addEventListener("input", e => { textFontSize = clamp(+e.target.value||130,10,220); });
      document.getElementById("cLH")?.addEventListener("input", e => { textLineHeight = clamp(+e.target.value||1,0.6,3); });
      document.getElementById("cSp")?.addEventListener("input", e => { textLetterSpacing = clamp(+e.target.value||0,0,20); });
      document.getElementById("cB")?.addEventListener("click", e => { textBold=!textBold; e.target.classList.toggle("on",textBold); });
      document.getElementById("cI")?.addEventListener("click", e => { textItalic=!textItalic; e.target.classList.toggle("on",textItalic); });
      document.getElementById("cU")?.addEventListener("click", e => { textUnderline=!textUnderline; e.target.classList.toggle("on",textUnderline); });
      ctxColorBind(() => { fg = fg==="BLACK"?"WHITE":"BLACK"; syncDynamicIcons(); renderToolSettings(); });
    } else {
      ctxHide();
    }
  }

  function getSelectedObjects() {
    if (!fabricCanvas) return [];
    const active = fabricCanvas.getActiveObjects();
    return Array.isArray(active) ? active.filter(Boolean) : [];
  }

  function allSame(arr) {
    if (!arr.length) return { mixed: false, value: undefined };
    const v = arr[0];
    const all = arr.every(x => x === v);
    return { mixed: !all, value: v };
  }

  /** Multi-selection: pokazujemy TYLKO wspólne właściwości */
  function renderObjectSettings() {
    const objs = getSelectedObjects();
    if (!objs.length) { ctxHide(); return; }

    const textObjs = objs.filter(o => o.type === "i-text" || o.type === "textbox" || o.type === "text");
    const fillShapes = objs.filter(o => o.type === "rect" || o.type === "ellipse" || o.type === "polygon" || o.type === "path");
    const strokeObjs = objs.filter(o => o.type === "line");
    const hasText = textObjs.length > 0;
    const hasFillShapes = fillShapes.length > 0;
    const hasStrokeObjs = strokeObjs.length > 0;
    const allText = textObjs.length === objs.length;

    // --- SAME TEXT ---
    if (allText) {
      const fonts = textObjs.map(o => o.fontFamily || "");
      const sizes = textObjs.map(o => o.fontSize || 40);
      const lineHs = textObjs.map(o => o.lineHeight || 1);
      const spacings = textObjs.map(o => o.charSpacing || 0);
      const weights = textObjs.map(o => o.fontWeight);
      const styles = textObjs.map(o => o.fontStyle);
      const underlines = textObjs.map(o => o.underline);
      const aligns = textObjs.map(o => o.textAlign);
      const fills = textObjs.map(o => o.fill || "#ffffff");
      const strokes = textObjs.map(o => o.stroke || "transparent");
      const strokeWs = textObjs.map(o => o.strokeWidth || 0);

      const font = allSame(fonts);
      const fontLabel = font.mixed ? "—" : (DRAW_FONTS.find(f => f.value === font.value)?.label || "Font");
      const sz = allSame(sizes); const lh = allSame(lineHs); const sp = allSame(spacings);
      const w = allSame(weights); const st = allSame(styles); const un = allSame(underlines); const al = allSame(aligns);
      const fillColor = allSame(fills);
      const hasStroke = strokes.some(s => s && s !== "transparent");
      const strokeCol = allSame(strokes); const strokeW = allSame(strokeWs.map(Math.round));

      const alignIcon = al.mixed ? "⇆" : al.value === "center" ? "⇆" : al.value === "right" ? "⇥" : "⇤";
      ctxHTML(`
        <div class="ctxGroup"><button class="ctxBtn" id="cFont" style="min-width:80px;max-width:120px;justify-content:space-between;display:flex;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fontLabel}</span><span style="opacity:.4;">▾</span></button></div>
        <div class="ctxGroup"><input id="cSz" class="ctxInput" type="number" min="10" max="220" step="1" value="${sz.mixed?'':sz.value}" placeholder="${sz.mixed?'—':''}" title="Rozmiar"/></div>
        <div class="ctxGroup"><input id="cLH" class="ctxInput" type="number" min="0.6" max="3.0" step="0.05" value="${lh.mixed?'':lh.value}" placeholder="${lh.mixed?'—':''}" title="Linia"/></div>
        <div class="ctxGroup"><input id="cSp" class="ctxInput" type="number" min="0" max="20" step="0.5" value="${sp.mixed?'':sp.value}" placeholder="${sp.mixed?'—':''}" title="Odstępy"/></div>
        <div class="ctxGroup"><button class="ctxBtn" id="cB" ${w.mixed||w.value!=="bold"?"":"on"}>B</button><button class="ctxBtn" id="cI" ${st.mixed||st.value!=="italic"?"":"on"}>I</button><button class="ctxBtn" id="cU" ${un.mixed||!un.value?"":"on"}>U</button></div>
        <div class="ctxGroup"><button class="ctxBtn" id="cAlign">${alignIcon}</button></div>
        <div class="ctxGroup">${ctxColorBtn(fillColor.mixed?"MIXED":fabricToBW(fillColor.value))}</div>
        <div class="ctxGroup"><label class="ctxChk"><input type="checkbox" id="cStrokeChk" ${hasStroke?"checked":""}/>S</label>${ctxColorBtn(!hasStroke?"WHITE":strokeCol.mixed?"MIXED":fabricToBW(strokeCol.value))}<input id="cStrokeW" class="ctxInput" type="number" min="0" max="20" step="1" value="${strokeW.mixed?'':strokeW.value}" style="width:40px" ${!hasStroke?"disabled":""} placeholder="${strokeW.mixed?'—':''}"/></div>
      `);
      document.getElementById("cFont")?.addEventListener("click", () => { openDrawFontPicker(v=>{objs.forEach(o=>o.set("fontFamily",v));fabricCanvas.renderAll();renderObjectSettings();},fonts[0]); });
      document.getElementById("cSz")?.addEventListener("input", e => { const v=clamp(+e.target.value||40,10,220);objs.forEach(o=>o.set("fontSize",v));fabricCanvas.renderAll(); });
      document.getElementById("cLH")?.addEventListener("input", e => { const v=clamp(+e.target.value||1,0.6,3);objs.forEach(o=>o.set("lineHeight",v));fabricCanvas.renderAll(); });
      document.getElementById("cSp")?.addEventListener("input", e => { const v=clamp(+e.target.value||0,0,20);objs.forEach(o=>o.set("charSpacing",v));fabricCanvas.renderAll(); });
      document.getElementById("cB")?.addEventListener("click", e => { const nb=w.value!=="bold";objs.forEach(o=>o.set("fontWeight",nb?"bold":"normal"));e.target.classList.toggle("on",nb);fabricCanvas.renderAll(); });
      document.getElementById("cI")?.addEventListener("click", e => { const ni=st.value!=="italic";objs.forEach(o=>o.set("fontStyle",ni?"italic":"normal"));e.target.classList.toggle("on",ni);fabricCanvas.renderAll(); });
      document.getElementById("cU")?.addEventListener("click", e => { const nu=!un.value;objs.forEach(o=>o.set("underline",nu));e.target.classList.toggle("on",nu);fabricCanvas.renderAll(); });
      document.getElementById("cAlign")?.addEventListener("click", e => { const cur=al.value||"left";const next=cur==="left"?"center":cur==="center"?"right":"left";objs.forEach(o=>o.set("textAlign",next));e.target.textContent=next==="left"?"⇤":next==="right"?"⇥":"⇆";fabricCanvas.renderAll(); });
      const cbs = toolCtx?.querySelectorAll("[data-color-toggle]")||[];
      if(cbs[0]) cbs[0].addEventListener("click",()=>{const c=fabricToBW(objs[0]?.fill);const n=c==="BLACK"?"#ffffff":"#000000";objs.forEach(o=>o.set("fill",n));fabricCanvas.renderAll();renderObjectSettings();});
      if(cbs[1]) cbs[1].addEventListener("click",()=>{const c=fabricToBW(objs[0]?.stroke);const n=c==="BLACK"?"#ffffff":"#000000";objs.forEach(o=>o.set("stroke",n));fabricCanvas.renderAll();renderObjectSettings();});
      document.getElementById("cStrokeChk")?.addEventListener("change",e=>{objs.forEach(o=>{o.set("stroke",e.target.checked?(strokeCol.mixed?'#ffffff':strokeCol.value):null);o.set("strokeWidth",e.target.checked?1:0)});fabricCanvas.renderAll();renderObjectSettings();});
      document.getElementById("cStrokeW")?.addEventListener("input",e=>{objs.forEach(o=>o.set("strokeWidth",clamp(+e.target.value||1,0,20)));fabricCanvas.renderAll();});
      return;
    }

    // --- MIX TYPÓW: pokazujemy TYLKO wspólne ---
    // fill: wspólne dla fillShapes + text (oba mają fill), ale NIE z liniami
    // stroke: wspólne dla fillShapes + strokeObjs (oba mają stroke), ale NIE z tekstem
    const showFill = hasFillShapes && !hasStrokeObjs;  // fillShapes SAME lub z tekstem
    const showStroke = (hasFillShapes || hasStrokeObjs) && !hasText; // fillShapes+strokeObjs, BEZ tekstu

    // Czy są JAKIEKOLWIEK wspólne?
    if (!showFill && !showStroke) { ctxHide(); return; }

    let html = "";
    if (showFill) {
      const objsWithFill = hasText ? [...textObjs, ...fillShapes] : fillShapes;
      const fills = objsWithFill.map(o => o.fill || "transparent");
      const fillCol = allSame(fills);
      html += `<div class="ctxGroup"><span class="ctxLabel">Wyp.</span>${ctxColorBtn(fillCol.mixed?"MIXED":fabricToBW(fillCol.value))}</div>`;
    }
    if (showStroke) {
      const allWithStroke = [...fillShapes, ...strokeObjs];
      const strokeWs = allWithStroke.map(o => o.strokeWidth || 1);
      const strokeCols = allWithStroke.map(o => o.stroke || "#ffffff");
      const strokeW = allSame(strokeWs.map(Math.round));
      const strokeCol = allSame(strokeCols);
      html += `<div class="ctxGroup"><span class="ctxLabel">Obrys</span><input id="cObjStroke" class="ctxInput" type="number" min="0" max="50" step="1" value="${strokeW.mixed?'':strokeW.value}" placeholder="${strokeW.mixed?'—':''}"/></div>`;
      html += `<div class="ctxGroup">${ctxColorBtn(strokeCol.mixed?"MIXED":fabricToBW(strokeCol.value))}</div>`;
    }

    ctxHTML(html);

    // Eventy
    const cbs = toolCtx?.querySelectorAll("[data-color-toggle]")||[];
    if (showFill) {
      const objsWithFill = hasText ? [...textObjs, ...fillShapes] : fillShapes;
      const fillIdx = 0;
      if(cbs[fillIdx]) cbs[fillIdx].addEventListener("click",()=>{
        const c=fabricToBW(objsWithFill.find(x=>x.fill&&x.fill!=="transparent")?.fill||"#fff");
        const n=c==="BLACK"?"#ffffff":"#000000";
        objsWithFill.forEach(o=>o.set("fill",n)); fabricCanvas.renderAll(); renderObjectSettings();
      });
    }
    if (showStroke) {
      const allWithStroke = [...fillShapes, ...strokeObjs];
      const strokeIdx = showFill ? 1 : 0;
      document.getElementById("cObjStroke")?.addEventListener("input", e => { allWithStroke.forEach(o=>o.set("strokeWidth",clamp(+e.target.value||1,0,50))); fabricCanvas.renderAll(); });
      if(cbs[strokeIdx]) cbs[strokeIdx].addEventListener("click",()=>{
        const c=fabricToBW(allWithStroke.find(x=>x.stroke&&x.stroke!=="transparent")?.stroke||"#fff");
        const n=c==="BLACK"?"#ffffff":"#000000";
        allWithStroke.forEach(o=>o.set("stroke",n)); fabricCanvas.renderAll(); renderObjectSettings();
      });
    }
  }

  function isTextObj(obj) {
    return obj && (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text");
  }

  function getActiveObj() {
    if (!fabricCanvas) return null;
    return fabricCanvas.getActiveObject();
  }

  /** Centralna funkcja: renderuje ustawienia wg aktualnego narzędzia + zaznaczenia */
  function renderCurrentSettings() {
    // TEXT tool: jeśli zaznaczony tekst → pokaż pełne ustawienia tekstu
    if (tool === TOOL.TEXT) {
      const objs = getSelectedObjects().filter(isTextObj);
      if (objs.length) {
        renderObjectSettings();
        return;
      }
    }

    // SELECT tool: jeśli coś zaznaczone → pokaż ustawienia obiektów
    if (tool === TOOL.SELECT) {
      const objs = getSelectedObjects();
      if (objs.length) {
        renderObjectSettings();
        return;
      }
    }

    // Inne narzędzia → pokaż ustawienia narzędzia
    renderToolSettings();
  }

  function setTool(next) {
    baseTool = next;
    tool = next;
    applyToolBehavior();
    renderCurrentSettings();
  }

  function recomputeTempTool() {
    // Priorytet jak w praktyce: Space (Pan) ma wyższy priorytet niż Ctrl (Select)
    let next = baseTool;
    if (holdSpace) next = TOOL.PAN;
    else if (holdCtrl) next = TOOL.SELECT;

    if (next !== tool) {
      tool = next;
      applyToolBehavior();
      renderCurrentSettings();
    }
  }

  // =========================================================
  // Undo/Redo
  // =========================================================
  function snapshotJSON() {
    if (!fabricCanvas) return null;
    // zapisujemy wszystkie właściwości, które wpływają na wygląd
    return fabricCanvas.toDatalessJSON([
      "stroke","strokeWidth","strokeLineCap","strokeLineJoin","fill",
      "opacity","skewX","skewY","angle"
    ]);
  }

  function pushUndo() {
    if (!fabricCanvas || undoBusy) return;
    const j = snapshotJSON();
    if (!j) return;

    const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
    const sj = JSON.stringify(j);
    const sl = last ? JSON.stringify(last) : "";
    if (sj === sl) return;

    undoStack.push(j);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function restoreFrom(json) {
    if (!fabricCanvas || !json) return;
    undoBusy = true;
    fabricCanvas.loadFromJSON(json, () => {
      undoBusy = false;
      fabricCanvas.requestRenderAll();
      ctx.markDirty?.();
      schedulePreview(80);
    });
  }

  function undo() {
    if (!fabricCanvas) return;
    if (undoStack.length < 2) return;
    const current = undoStack.pop();
    redoStack.push(current);
    restoreFrom(undoStack[undoStack.length - 1]);
    updateUndoRedoButtons();
  }

  function redo() {
    if (!fabricCanvas) return;
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    restoreFrom(next);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    if (tUndo) tUndo.disabled = undoStack.length < 2;
    if (tRedo) tRedo.disabled = redoStack.length < 1;
  }

  // =========================================================
  // Polygon
  // =========================================================
  function clearPolyDraft() {
    polyPoints = [];
    if (polyPreview && fabricCanvas) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
      fabricCanvas.requestRenderAll();
    }
    syncToolButtons();
  }

  function popPolyPoint() {
    if (polyPoints.length === 0) return;
    polyPoints.pop();
    if (!fabricCanvas) return;

    if (!polyPreview) return;

    if (polyPoints.length === 0) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
    } else {
      polyPreview.set({ points: polyPoints });
    }

    fabricCanvas.requestRenderAll();
    syncToolButtons();
  }

  function getWorldPointFromMouse(ev) {
    const f = requireFabric();
    const rect = (fabricCanvas?.upperCanvasEl || drawCanvasEl).getBoundingClientRect();
    const canvasPt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
    const inv = f.util.invertTransform(fabricCanvas.viewportTransform);
    const wp = f.util.transformPoint(canvasPt, inv);
    return clampWorldPoint({ x: wp.x, y: wp.y });
  }

  function addPolyPoint(worldPt) {
    const p = clampWorldPoint(worldPt);
    polyPoints.push({ x: p.x, y: p.y });

    const f = requireFabric();
    const style = makeStrokeFillStyle();

    if (!polyPreview) {
      polyPreview = new f.Polyline(polyPoints, {
        ...style,
        fill: "rgba(0,0,0,0)",
        selectable: false,
        evented: true,
        objectCaching: false,
      });
      fabricCanvas.add(polyPreview);
    } else {
      polyPreview.set({ points: polyPoints });
    }

    fabricCanvas.requestRenderAll();
    syncToolButtons();
  }

  function finalizePolygon() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    if (polyPoints.length < 3) return;

    const style = makeStrokeFillStyle();

    if (polyPreview) {
      fabricCanvas.remove(polyPreview);
      polyPreview = null;
    }

    const poly = new f.Polygon(polyPoints, {
      ...style,
      selectable: false,
      evented: true,
      objectCaching: false,
    });

    fabricCanvas.add(poly);
    fabricCanvas.requestRenderAll();

    clearPolyDraft();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  // =========================================================
  // Shapes (line/rect/ellipse)
  // Shift constraints:
  // - LINE: 45°
  // - RECT: square
  // - ELLIPSE: circle
  // =========================================================
  function startFigure(ev, shiftKey) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const p0 = getWorldPointFromMouse(ev);
    drawingStart = p0;
    drawingShift = !!shiftKey;

    const style = makeStrokeFillStyle();

    if (tool === TOOL.LINE) {
      drawingObj = new f.Line([p0.x, p0.y, p0.x, p0.y], {
        ...style,
        fill: "rgba(0,0,0,0)",
        selectable: false,
        evented: true,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }

    if (tool === TOOL.RECT) {
      drawingObj = new f.Rect({
        left: p0.x,
        top: p0.y,
        width: 1,
        height: 1,
        originX: "left",
        originY: "top",
        ...style,
        selectable: false,
        evented: true,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }

    if (tool === TOOL.ELLIPSE) {
      drawingObj = new f.Ellipse({
        left: p0.x,
        top: p0.y,
        rx: 1,
        ry: 1,
        originX: "left",
        originY: "top",
        ...style,
        selectable: false,
        evented: true,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      return;
    }
  }

  function updateFigure(ev, shiftKey) {
    if (!fabricCanvas || !drawingObj || !drawingStart) return;
    const p = getWorldPointFromMouse(ev);
    const shift = !!shiftKey;

    if (tool === TOOL.LINE && drawingObj.type === "line") {
      let x2 = p.x, y2 = p.y;

      if (shift) {
        // 45° snap
        const dx = p.x - drawingStart.x;
        const dy = p.y - drawingStart.y;
        const ang = Math.atan2(dy, dx);
        const step = Math.PI / 4; // 45deg
        const snapped = Math.round(ang / step) * step;
        const len = Math.hypot(dx, dy);
        x2 = drawingStart.x + Math.cos(snapped) * len;
        y2 = drawingStart.y + Math.sin(snapped) * len;

        const cl = clampWorldPoint({ x: x2, y: y2 });
        x2 = cl.x; y2 = cl.y;
      }

      drawingObj.set({ x2, y2 });
      fabricCanvas.requestRenderAll();
      return;
    }

    if (tool === TOOL.RECT && drawingObj.type === "rect") {
      const x0 = drawingStart.x;
      const y0 = drawingStart.y;

      let w = p.x - x0;
      let h = p.y - y0;

      if (shift) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }

      const left = w >= 0 ? x0 : x0 + w;
      const top  = h >= 0 ? y0 : y0 + h;

      const pLT = clampWorldPoint({ x: left, y: top });
      const pRB = clampWorldPoint({ x: left + Math.abs(w), y: top + Math.abs(h) });

      drawingObj.set({
        left: pLT.x,
        top: pLT.y,
        width: Math.max(1, pRB.x - pLT.x),
        height: Math.max(1, pRB.y - pLT.y),
      });

      fabricCanvas.requestRenderAll();
      return;
    }

    if (tool === TOOL.ELLIPSE && drawingObj.type === "ellipse") {
      const x0 = drawingStart.x;
      const y0 = drawingStart.y;

      let w = p.x - x0;
      let h = p.y - y0;

      if (shift) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }

      const left = w >= 0 ? x0 : x0 + w;
      const top  = h >= 0 ? y0 : y0 + h;

      const pLT = clampWorldPoint({ x: left, y: top });
      const pRB = clampWorldPoint({ x: left + Math.abs(w), y: top + Math.abs(h) });

      // Fabric ellipse: rx/ry to promienie
      drawingObj.set({
        left: pLT.x,
        top: pLT.y,
        rx: Math.max(1, (pRB.x - pLT.x) / 2),
        ry: Math.max(1, (pRB.y - pLT.y) / 2),
      });

      fabricCanvas.requestRenderAll();
      return;
    }
  }

  function finishFigure() {
    if (!fabricCanvas || !drawingObj) return;
    drawingObj.setCoords();
    drawingObj = null;
    drawingStart = null;
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  // =========================================================
  // Clamp obiektów w SELECT (przesuwanie/skalowanie)
  // =========================================================
  function clampObjectToWorld(obj) {
    if (!fabricCanvas || !obj) return;
    const f = requireFabric();

    // bounding rect w coords canvasa (po viewport)
    const br = obj.getBoundingRect(true, true);

    const inv = f.util.invertTransform(fabricCanvas.viewportTransform);

    const tlCanvas = new f.Point(br.left, br.top);
    const brCanvas = new f.Point(br.left + br.width, br.top + br.height);

    const tlWorld = f.util.transformPoint(tlCanvas, inv);
    const brWorld = f.util.transformPoint(brCanvas, inv);

    let dx = 0;
    let dy = 0;

    if (tlWorld.x < 0) dx = -tlWorld.x;
    if (tlWorld.y < 0) dy = -tlWorld.y;

    if (brWorld.x > worldW) dx = dx + (worldW - brWorld.x);
    if (brWorld.y > worldH) dy = dy + (worldH - brWorld.y);

    if (dx !== 0 || dy !== 0) {
      obj.left = (obj.left || 0) + dx;
      obj.top  = (obj.top  || 0) + dy;
      obj.setCoords();
    }
  }

  // =========================================================
  // Preview/export (stabilne, niezależne od zoom/pan)
  // =========================================================
  async function renderWorldTo208x88CanvasStable() {
    if (!fabricCanvas) return null;
    const f = requireFabric();
  
    const json = snapshotJSON();
    if (!json) return null;
  
    const el = f.util.createCanvasElement();
    el.width = RAST_W;
    el.height = RAST_H;
  
    const sc = new f.StaticCanvas(el, {
      backgroundColor: bgColor(),
      renderOnAddRemove: false,
    });
  
    // świat (worldW/worldH) ma proporcję 26:11 tak jak 208/88,
    // więc skala powinna wejść 1:1 bez letterboxa
    const sx = RAST_W / Math.max(1, worldW);
    const sy = RAST_H / Math.max(1, worldH);
    const s = Math.min(sx, sy);
  
    sc.setViewportTransform([s, 0, 0, s, 0, 0]);
  
    await new Promise((res) => {
      sc.loadFromJSON(json, () => {
        sc.renderAll();
        res();
      });
    });
  
    return el;
  }

  function decimate208x88To150x70(srcCanvas) {
    const src = srcCanvas.getContext("2d", { willReadFrequently: true });
    const srcImg = src.getImageData(0, 0, RAST_W, RAST_H).data;
  
    // docelowy canvas 150x70
    const dst = document.createElement("canvas");
    dst.width = DOT_W;
    dst.height = DOT_H;
    const g = dst.getContext("2d", { willReadFrequently: true });
    const out = g.createImageData(DOT_W, DOT_H);
  
    // Reguła:
    // X: bloki 7 kolumn -> bierz 5, wytnij 2 (czyli pomijaj x%7==5,6) dla x<203
    // Y: bloki 9 wierszy -> bierz 7, wytnij 2 (czyli pomijaj y%9==7,8) dla y<81
    //
    // Resztówki:
    // - x >= 203 (ostatnie 5 kolumn) bierz wszystkie
    // - y >= 81  (ostatnie 7 wierszy) bierz wszystkie
  
    let dy = 0;
    for (let y = 0; y < RAST_H; y++) {
      const inMainBlockY = y < 81;
      if (inMainBlockY) {
        const my = y % 9;
        if (my === 7 || my === 8) continue; // wycinamy 2 wiersze
      }
  
      let dx = 0;
      for (let x = 0; x < RAST_W; x++) {
        const inMainBlockX = x < 203;
        if (inMainBlockX) {
          const mx = x % 7;
          if (mx === 5 || mx === 6) continue; // wycinamy 2 kolumny
        }
  
        const si = (y * RAST_W + x) * 4;
        const di = (dy * DOT_W + dx) * 4;
  
        out.data[di + 0] = srcImg[si + 0];
        out.data[di + 1] = srcImg[si + 1];
        out.data[di + 2] = srcImg[si + 2];
        out.data[di + 3] = 255;
  
        dx++;
        // bezpieczeństwo (nie powinno się zdarzyć przy poprawnej regule)
        if (dx >= DOT_W) break;
      }
  
      dy++;
      if (dy >= DOT_H) break;
    }
  
    g.putImageData(out, 0, 0);
    return dst;
  }
  

  function canvasToBits150(c) {
    const g = c.getContext("2d", { willReadFrequently: true });
    const { data } = g.getImageData(0, 0, DOT_W, DOT_H);
    const out = new Uint8Array(DOT_W * DOT_H);

    for (let i = 0; i < out.length; i++) {
      const r = data[i*4+0], gg = data[i*4+1], b = data[i*4+2];
      const lum = 0.2126*r + 0.7152*gg + 0.0722*b;
      // BLACK (ciemne) = 1 (zapalone), WHITE (jasne) = 0 (zgaszone)
      out[i] = lum < 128 ? 1 : 0;
    }
    return out;
  }

  function schedulePreview(ms = 80) {
    clearTimeout(_deb);
    const mySeq = ++_previewSeq;
  
    _deb = setTimeout(async () => {
      if (mySeq !== _previewSeq) return;
  
      const c208 = await renderWorldTo208x88CanvasStable();
      if (!c208) return;
      if (mySeq !== _previewSeq) return;
  
      const c150 = decimate208x88To150x70(c208);
      bits150 = canvasToBits150(c150);
  
      ctx.onPreview?.({ kind: "PIX", bits: bits150 });
    }, ms);
  }

  async function refreshPreviewNow() {
    const c208 = await renderWorldTo208x88CanvasStable();
    if (!c208) return;
  
    const c150 = decimate208x88To150x70(c208);
    bits150 = canvasToBits150(c150);
  
    ctx.onPreview?.({ kind: "PIX", bits: bits150 });
  }

  function openEyePreview() {
    window.dispatchEvent(new CustomEvent("logoeditor:openPreview", {
      detail: { kind: "PIX", bits: bits150 }
    }));
  }

  // =========================================================
  // Settings modal (fill color + stroke)
  // =========================================================
  function toolHasSettings(t) {
    return t === TOOL.BRUSH || t === TOOL.LINE || t === TOOL.RECT || t === TOOL.ELLIPSE || t === TOOL.POLY;
  }

  function toolLabel(tool) {
    return tool === TOOL.BRUSH ? t("logoEditor.draw.tools.brush") :
           tool === TOOL.ERASER ? t("logoEditor.draw.tools.eraser") :
           tool === TOOL.LINE ? t("logoEditor.draw.tools.line") :
           tool === TOOL.RECT ? t("logoEditor.draw.tools.rect") :
           tool === TOOL.ELLIPSE ? t("logoEditor.draw.tools.ellipse") :
           tool === TOOL.POLY ? t("logoEditor.draw.tools.poly") :
           tool === TOOL.PAN ? t("logoEditor.draw.tools.pan") :
           tool === TOOL.TEXT ? t("logoEditor.draw.tools.text") :
           t("logoEditor.draw.tools.select");
  }

  // =========================================================
  // Helpers: delete/duplicate/move selection
  // =========================================================
  function deleteSelection() {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    if (active.type === "activeSelection") {
      active.getObjects().forEach(o => fabricCanvas.remove(o));
    } else {
      fabricCanvas.remove(active);
    }

    fabricCanvas.discardActiveObject();
    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  function moveSelection(dx, dy) {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    const moveObj = (o) => {
      o.left = (o.left || 0) + dx;
      o.top  = (o.top  || 0) + dy;
      clampObjectToWorld(o);
      o.setCoords();
    };

    if (active.type === "activeSelection") {
      active.getObjects().forEach(moveObj);
      active.setCoords();
    } else {
      moveObj(active);
    }

    fabricCanvas.requestRenderAll();
    ctx.markDirty?.();
    schedulePreview(80);
  }

  async function duplicateSelection() {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    const f = requireFabric();

    // klon działa różnie w zależności od typu
    active.clone((cloned) => {
      fabricCanvas.discardActiveObject();

      if (cloned.type === "activeSelection") {
        cloned.canvas = fabricCanvas;
        cloned.getObjects().forEach((obj) => {
          obj.left += 10;
          obj.top  += 10;
          clampObjectToWorld(obj);
          fabricCanvas.add(obj);
        });
        cloned.setCoords();
      } else {
        cloned.left += 10;
        cloned.top  += 10;
        clampObjectToWorld(cloned);
        fabricCanvas.add(cloned);
      }

      fabricCanvas.requestRenderAll();
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    }, ["stroke","strokeWidth","fill","strokeLineCap","strokeLineJoin"]);
  }

  // =========================================================
  // Fabric setup
  // =========================================================
  function installFabricOnce() {
    if (initialized) return;
    initialized = true;

    if (!drawCanvasEl) throw new Error("Brak #drawStage w HTML.");
    const f = requireFabric();

    fabricCanvas = new f.Canvas(drawCanvasEl, {
      backgroundColor: bgColor(),
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    const kickOffsetIfNeeded = () => {
      if (!_needOffsetKick) return;
      _needOffsetKick = false;
      fabricCanvas.calcOffset();
    };

    window.__drawFabric = fabricCanvas;
    window.__drawDbg = {
      c: fabricCanvas,
      info() {
        const c = fabricCanvas;
        const up = c.upperCanvasEl;
        const low = c.lowerCanvasEl;
      },
      calcOffset() {
        fabricCanvas.calcOffset();
      },
      list() {
        const objs = fabricCanvas.getObjects();
        console.table(objs.map((o,i)=>({
          i,
          type:o.type,
          selectable:o.selectable,
          evented:o.evented,
          stroke:o.stroke,
          fill:o.fill
        })));
      }
    };


    ensureCursorOverlay();

    // Cursor overlay follow — MUSI być na upperCanvasEl (Fabric)
    const cursorEl = fabricCanvas.upperCanvasEl; // TO JEST WAŻNE

    cursorEl.addEventListener("pointerdown", () => {
      kickOffsetIfNeeded();
    }, { passive: true });
    
    cursorEl.addEventListener("pointermove", (ev) => {
      kickOffsetIfNeeded();
      lastPointer = { x: ev.clientX, y: ev.clientY };
      if (tool === TOOL.BRUSH || tool === TOOL.ERASER) placeOverlayAt(ev.clientX, ev.clientY);
    }, { passive: true });
    
    cursorEl.addEventListener("pointerleave", () => {
      hideOverlayCursor();
    }, { passive: true });


    // rozmiar + world
    resizeScene();
    updateZoomButtons();

    // undo start
    undoStack = [];
    redoStack = [];
    pushUndo();
    updateUndoRedoButtons();

    // Zmiany -> preview
    fabricCanvas.on("path:created", (e) => {
      // upewniamy się, że path jest "trafialny" (dla gumki/klików)
      if (e?.path) {
        e.path.evented = true;
        e.path.selectable = false; // bo zwykle nie chcesz od razu zaznaczać po narysowaniu
      }
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    fabricCanvas.on("object:modified", (e) => {
      if (tool === TOOL.SELECT && e?.target) clampObjectToWorld(e.target);
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
      renderCurrentSettings();
    });

    fabricCanvas.on("object:removed", () => {
      if (undoBusy) return;
      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    fabricCanvas.on("selection:created", () => {
      renderCurrentSettings();
    });
    fabricCanvas.on("selection:updated", () => {
      renderCurrentSettings();
    });
    fabricCanvas.on("selection:cleared", () => {
      renderCurrentSettings();
    });

    fabricCanvas.on("object:modified", () => {
      renderCurrentSettings();
    });

    fabricCanvas.on("object:moving", (e) => {
      if (tool !== TOOL.SELECT) return;
      if (!e?.target) return;
      clampObjectToWorld(e.target);
    });

    fabricCanvas.on("object:scaling", (e) => {
      if (tool !== TOOL.SELECT) return;
      if (!e?.target) return;
      clampObjectToWorld(e.target);
    });

    // Mouse handlers
    fabricCanvas.on("mouse:down", (opt) => {
      pointerDown = true;
      const ev = opt.e;

      // aktualizacja overlay kursora
      // w mouse:down
      lastPointer = { x: ev.clientX, y: ev.clientY };
      
      if (tool === TOOL.BRUSH || tool === TOOL.ERASER) {
        placeOverlayAt(ev.clientX, ev.clientY);
      } else {
        hideOverlayCursor();
      }

      if (tool === TOOL.PAN) {
        if (fabricCanvas.getZoom() <= MIN_ZOOM + 1e-6) return; // pan nie ma sensu przy z=1
        panDown = true;
        updateCursorVisual();
        panStart = { x: ev.clientX, y: ev.clientY };
        vptStart = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : null;
        return;
      }

      if (tool === TOOL.ERASER) {
        kickOffsetIfNeeded(); // ważne, żeby nie było przesunięcia
        
        // tymczasowo podbij tolerancję dla pewności
        const oldTol = fabricCanvas.targetFindTolerance;
        const oldPx  = fabricCanvas.perPixelTargetFind;
        
        fabricCanvas.perPixelTargetFind = true;
        fabricCanvas.targetFindTolerance = 12;
        
        const target = opt.target || fabricCanvas.findTarget(opt.e);
        
        fabricCanvas.perPixelTargetFind = oldPx;
        fabricCanvas.targetFindTolerance = oldTol;
        
        if (target) {
          fabricCanvas.remove(target);
          fabricCanvas.requestRenderAll();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
        }
        return;
      }

      if (tool === TOOL.POLY) {
        const wp = getWorldPointFromMouse(ev);
        addPolyPoint(wp);
        return;
      }

      if (tool === TOOL.LINE || tool === TOOL.RECT || tool === TOOL.ELLIPSE) {
        startFigure(ev, ev.shiftKey);
        return;
      }

      if (tool === TOOL.TEXT) {
        const pointer = fabricCanvas.getPointer(opt.e);
        // Check if clicking on existing text
        const target = fabricCanvas.findTarget(ev);
        if (target && (target.type === "i-text" || target.type === "textbox" || target.type === "text")) {
          // Select existing text for editing
          fabricCanvas.setActiveObject(target);
          target.enterEditing();
          target.selectAll();
          fabricCanvas.renderAll();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
        } else {
          // Create new text
          const textObj = new fabric.IText("Tekst", {
            left: pointer.x,
            top: pointer.y,
            fontSize: textFontSize,
            lineHeight: textLineHeight,
            charSpacing: textLetterSpacing,
            fontWeight: textBold ? "bold" : "normal",
            fontStyle: textItalic ? "italic" : "normal",
            underline: textUnderline,
            textAlign: textAlign,
            fill: fgColor(),
            stroke: null,
            strokeWidth: 0,
            editable: true,
          });
          if (textFont) textObj.set("fontFamily", textFont);
          fabricCanvas.add(textObj);
          fabricCanvas.setActiveObject(textObj);
          textObj.enterEditing();
          textObj.selectAll();
          fabricCanvas.renderAll();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
        }
        return;
      }
    });

    fabricCanvas.on("mouse:move", (opt) => {
      const ev = opt.e;
      lastPointer = { x: ev.clientX, y: ev.clientY };
      if (tool === TOOL.BRUSH || tool === TOOL.ERASER || tool === TOOL.TEXT) {
        placeOverlayAt(ev.clientX, ev.clientY);
      } else {
        hideOverlayCursor();
      }
      if (tool === TOOL.PAN && panDown && vptStart) {
        const dx = ev.clientX - panStart.x;
        const dy = ev.clientY - panStart.y;
        const v = vptStart.slice();
        v[4] += dx;
        v[5] += dy;
        fabricCanvas.setViewportTransform(v);
        clampViewport();
        fabricCanvas.requestRenderAll();
        updateCursorVisual();
        return;
      }

      // Gumka: usuwa obiekty, które dotyka (ciągły erase)
      if (tool === TOOL.ERASER && pointerDown) {
        kickOffsetIfNeeded();
      
        const oldTol = fabricCanvas.targetFindTolerance;
        const oldPx  = fabricCanvas.perPixelTargetFind;
      
        fabricCanvas.perPixelTargetFind = true;
        fabricCanvas.targetFindTolerance = 12;
      
        const target = fabricCanvas.findTarget(opt.e);
      
        fabricCanvas.perPixelTargetFind = oldPx;
        fabricCanvas.targetFindTolerance = oldTol;
      
        if (target) {
          fabricCanvas.remove(target);
          fabricCanvas.requestRenderAll();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
        }
        return;
      }

      if (drawingObj) updateFigure(ev, ev.shiftKey);
    });

    fabricCanvas.on("mouse:up", () => {
      pointerDown = false;
      if (tool === TOOL.PAN) {
        panDown = false;
        updateCursorVisual();
        vptStart = null;
        return;
      }
      if (drawingObj) finishFigure();
    });

    fabricCanvas.on("mouse:over", () => updateCursorVisual());
    fabricCanvas.on("mouse:out",  () => updateCursorVisual());


    // Dwuklik kończy polygon LUB edytuje tekst
    drawCanvasEl.addEventListener("dblclick", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;

      // Polygon: finalize
      if (tool === TOOL.POLY) {
        ev.preventDefault();
        finalizePolygon();
        return;
      }

      // SELECT tool: double-click on text → edit mode
      if (tool === TOOL.SELECT && fabricCanvas) {
        const pointer = fabricCanvas.getPointer(ev);
        const target = fabricCanvas.findTarget(ev);
        if (target && (target.type === "i-text" || target.type === "textbox" || target.type === "text")) {
          ev.preventDefault();
          fabricCanvas.setActiveObject(target);
          target.enterEditing();
          target.selectAll();
          fabricCanvas.renderAll();
          return;
        }
      }
    });

    // Wheel zoom (tylko select/pan) + min zoom = 1
    drawCanvasEl.addEventListener("wheel", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!(tool === TOOL.PAN || tool === TOOL.SELECT)) return;

      ev.preventDefault();

      const rect = drawCanvasEl.getBoundingClientRect();
      const pt = new f.Point(ev.clientX - rect.left, ev.clientY - rect.top);
      zoomBy(ev.deltaY < 0 ? 1.1 : 0.9, pt);

      schedulePreview(120);
    }, { passive: false });

    // ResizeObserver (debounce przez rAF)
    const ro = new ResizeObserver(() => {
      if (ctx.getMode?.() !== "DRAW") return;
      cancelAnimationFrame(_resizeRaf);
      _resizeRaf = requestAnimationFrame(resizeScene);
    });
    if (drawStageHost) ro.observe(drawStageHost);
    else if (paneDraw) ro.observe(paneDraw);

    // Start
    baseTool = TOOL.SELECT;
    tool = TOOL.SELECT;
    applyToolBehavior();
    zoomTo100();
    schedulePreview(80);
  }

  // =========================================================
  // Keyboard shortcuts
  // =========================================================
  function cycleShapeTool() {
    // Linia -> Prostokąt -> Elipsa -> Wielokąt
    const order = [TOOL.LINE, TOOL.RECT, TOOL.ELLIPSE, TOOL.POLY];
    const i = order.indexOf(baseTool);
    const next = order[(i >= 0 ? i + 1 : 0) % order.length];
    setBaseTool(next);
  }

  function toggleFg() {
    fg = (fg === "BLACK") ? "WHITE" : "BLACK";
    if (tool === TOOL.BRUSH) applyBrushStyle();
    schedulePreview(80);
    syncDynamicIcons();
  }

  function toggleBg() {
    bg = (bg === "BLACK") ? "WHITE" : "BLACK";
    if (fabricCanvas) {
      fabricCanvas.backgroundColor = bgColor();
      fabricCanvas.requestRenderAll();
      schedulePreview(80);
      syncDynamicIcons();
    }
  }

  function onKeyDown(ev) {
    if (ctx.getMode?.() !== "DRAW") return;
    if (isEditableTarget(ev.target)) return;

    const key = ev.key;
    const k = key.length === 1 ? key.toLowerCase() : key;

    // Temp modifiers:
    if (key === " " && !holdSpace) {
      ev.preventDefault();
      holdSpace = true;
      recomputeTempTool();
      return;
    }

    if ((ev.ctrlKey || ev.metaKey) && !holdCtrl) {
      // Uwaga: to się aktywuje też przy Ctrl+Z itd.
      // My trzymamy holdCtrl jako "wciśnięty Ctrl/Cmd" tylko wtedy,
      // gdy *nie* jest to skrót operacyjny. Żeby było stabilnie:
      // - ustawiamy holdCtrl na true tylko przy "gołym" Ctrl/Cmd bez litery
      // Ale w JS ciężko to rozróżnić 100%. Robimy pragmatycznie:
      // - jeśli to dokładnie Ctrl lub Meta, wtedy temp-select.
      if (key === "Control" || key === "Meta") {
        holdCtrl = true;
        recomputeTempTool();
        return;
      }
    }

    // Historia
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && k === "z") {
      ev.preventDefault();
      undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && k === "z") {
      ev.preventDefault();
      redo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && k === "y") {
      ev.preventDefault();
      redo();
      return;
    }

    // Zoom
    if ((ev.ctrlKey || ev.metaKey) && k === "1") {
      ev.preventDefault();
      zoomTo100();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && k === "0") {
      ev.preventDefault();
      zoomTo100(); // w tym modelu fit==100
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (k === "+" || k === "=")) {
      ev.preventDefault();
      zoomBy(1.15, null);
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && k === "-") {
      ev.preventDefault();
      zoomBy(0.87, null);
      return;
    }

    // Narzędzia
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (k === "v") { ev.preventDefault(); setBaseTool(TOOL.SELECT); return; }
      if (k === "h") { ev.preventDefault(); setBaseTool(TOOL.PAN); return; }
      if (k === "b") { ev.preventDefault(); setBaseTool(TOOL.BRUSH); return; }
      if (k === "e") { ev.preventDefault(); setBaseTool(TOOL.ERASER); return; }
      if (k === "u") { ev.preventDefault(); cycleShapeTool(); return; }

      // alternatywne bez U (i tak możesz mieć)
      if (k === "l") { ev.preventDefault(); setBaseTool(TOOL.LINE); return; }
      if (k === "r") { ev.preventDefault(); setBaseTool(TOOL.RECT); return; }
      if (k === "o") { ev.preventDefault(); setBaseTool(TOOL.ELLIPSE); return; }
      if (k === "p") { ev.preventDefault(); setBaseTool(TOOL.POLY); return; }

      // Fill toggle (tylko figury z fill)
      if (k === "f") {
        if (baseTool === TOOL.RECT || baseTool === TOOL.ELLIPSE || baseTool === TOOL.POLY) {
          ev.preventDefault();
          toolSettings[baseTool] = { ...(toolSettings[baseTool] || {}), fill: !toolSettings[baseTool]?.fill };
          schedulePreview(80);
        }
        return;
      }

      // Poly
      if (baseTool === TOOL.POLY && key === "Enter") { ev.preventDefault(); finalizePolygon(); return; }
      if (baseTool === TOOL.POLY && key === "Escape") { ev.preventDefault(); clearPolyDraft(); return; }
      if (baseTool === TOOL.POLY && (key === "Backspace" || key === "Delete")) { ev.preventDefault(); popPolyPoint(); return; }

      // [ ] grubość
      if (k === "[") {
        ev.preventDefault();
        const t = baseTool;
        if (toolSettings[t]?.stroke != null) {
          toolSettings[t] = { ...(toolSettings[t] || {}), stroke: clamp((toolSettings[t].stroke || 6) - 1, 1, 80) };
          if (t === TOOL.BRUSH && tool === TOOL.BRUSH) applyBrushStyle();
          updateCursorVisual();
          schedulePreview(80);
        }
        return;
      }
      if (k === "]") {
        ev.preventDefault();
        const t = baseTool;
        if (toolSettings[t]?.stroke != null) {
          toolSettings[t] = { ...(toolSettings[t] || {}), stroke: clamp((toolSettings[t].stroke || 6) + 1, 1, 80) };
          if (t === TOOL.BRUSH && tool === TOOL.BRUSH) applyBrushStyle();
          updateCursorVisual();
          schedulePreview(80);
        }
        return;
      }
    }

    // Delete selection (w Select)
    if ((key === "Backspace" || key === "Delete") && baseTool === TOOL.SELECT) {
      ev.preventDefault();
      deleteSelection();
      return;
    }

    // Duplicuj (Ctrl/Cmd + D)
    if ((ev.ctrlKey || ev.metaKey) && k === "d") {
      ev.preventDefault();
      duplicateSelection();
      return;
    }

    // Strzałki: przesuw zaznaczone (Select)
    if (baseTool === TOOL.SELECT) {
      const step = ev.shiftKey ? 10 : 1;
      if (key === "ArrowLeft")  { ev.preventDefault(); moveSelection(-step, 0); return; }
      if (key === "ArrowRight") { ev.preventDefault(); moveSelection(step, 0); return; }
      if (key === "ArrowUp")    { ev.preventDefault(); moveSelection(0, -step); return; }
      if (key === "ArrowDown")  { ev.preventDefault(); moveSelection(0, step); return; }
    }
  }

  function onKeyUp(ev) {
    if (ctx.getMode?.() !== "DRAW") return;
    if (isEditableTarget(ev.target)) return;

    if (ev.key === " ") {
      holdSpace = false;
      recomputeTempTool();
      return;
    }

    if (ev.key === "Control" || ev.key === "Meta") {
      holdCtrl = false;
      recomputeTempTool();
      return;
    }
  }

  // =========================================================
  // UI bind
  // =========================================================
  let uiBound = false;

  function bindUiOnce() {
    // Tool buttons
    tSelect?.addEventListener("click", () => setBaseTool(TOOL.SELECT));
    tPan?.addEventListener("click", () => setBaseTool(TOOL.PAN));

    tBrush?.addEventListener("click", () => setBaseTool(TOOL.BRUSH));
    tEraser?.addEventListener("click", () => setBaseTool(TOOL.ERASER));
    tLine?.addEventListener("click", () => setBaseTool(TOOL.LINE));
    tRect?.addEventListener("click", () => setBaseTool(TOOL.RECT));
    tEllipse?.addEventListener("click", () => setBaseTool(TOOL.ELLIPSE));
    tPoly?.addEventListener("click", () => setBaseTool(TOOL.POLY));

    // Zoom buttons
    tZoomIn?.addEventListener("click", () => { zoomBy(1.15); schedulePreview(120); });
    tZoomOut?.addEventListener("click", () => { zoomBy(0.87); schedulePreview(120); });

    // History
    tUndo?.addEventListener("click", () => undo());
    tRedo?.addEventListener("click", () => redo());

    // Clear
    tClear?.addEventListener("click", async () => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!fabricCanvas) return;

      const ok = await confirmModal({ text: t("logoEditor.draw.confirmClear") });
      if (!ok) return;

      clearPolyDraft();
      fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
      fabricCanvas.backgroundColor = bgColor();
      fabricCanvas.requestRenderAll();

      pushUndo();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    // Eye
    tEye?.addEventListener("click", () => openEyePreview());

    // Text tool
    tText?.addEventListener("click", () => setTool(TOOL.TEXT));

    // Poly done
    tPolyDone?.addEventListener("click", () => finalizePolygon());

    // Background toolbar button
    tBg?.addEventListener("click", () => {
      bg = bg === "BLACK" ? "WHITE" : "BLACK";
      syncDynamicIcons();
      if (fabricCanvas) {
        fabricCanvas.backgroundColor = bgColor();
        fabricCanvas.requestRenderAll();
        ctx.markDirty?.();
        schedulePreview(50);
      }
    });

    // Keyboard
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  // =========================================================
  // API
  // =========================================================
  return {
    open(payload = null) {
      show(paneDraw, true);
      loadDrawFonts();

      if (!uiBound) { bindUiOnce(); uiBound = true; }
      installFabricOnce();

      const source = payload?.source || {};
      const fabricData = source.fabricData || null;

      // reset sesji rysunku (ustawienia narzędzi + kolory zostają w pamięci sesji)
      if (fabricCanvas) {
        ctxHide();
        clearPolyDraft();

        if (fabricData) {
          undoBusy = true;
          fabricCanvas.loadFromJSON(fabricData, () => {
            undoBusy = false;
            fabricCanvas.backgroundColor = bgColor();
            fabricCanvas.requestRenderAll();
            
            undoStack = [];
            redoStack = [];
            pushUndo();
            updateUndoRedoButtons();
            
            schedulePreview(150);
          });
        } else {
          fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
          fabricCanvas.backgroundColor = bgColor();
          fabricCanvas.requestRenderAll();

          undoStack = [];
          redoStack = [];
          pushUndo();
          updateUndoRedoButtons();
        }

        resizeScene();
        _needOffsetKick = true;
        requestAnimationFrame(() => {
          if (!fabricCanvas) return;
          fabricCanvas.calcOffset();
        });
        zoomTo100();

        holdSpace = false;
        holdCtrl = false;

        baseTool = TOOL.SELECT;
        tool = TOOL.SELECT;
        applyToolBehavior();

        ctx.clearDirty?.();
        schedulePreview(80);
      }
    },

    close() {
      show(paneDraw, false);
      ctxHide();
      hideOverlayCursor();
    },

    async getCreatePayload() {
      // odśwież bity stabilnie
      await refreshPreviewNow();

      return {
        ok: true,
        type: TYPE_PIX,
        payload: {
          w: DOT_W,
          h: DOT_H,
          format: "BITPACK_MSB_FIRST_ROW_MAJOR",
          bits_b64: ctx.packBitsRowMajorMSB(bits150, DOT_W, DOT_H),
          source: {
            mode: "DRAW",
            fabricData: snapshotJSON()
          }
        },
      };
    },
  };
}
