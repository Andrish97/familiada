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

import { confirmModal } from "../../js/core/modal.js?v=v2026-04-23T22332";
import { initUiSelect } from "../../js/core/ui-select.js?v=v2026-04-23T22332";
import { t } from "../../translation/translation.js?v=v2026-04-23T22332";
import { v as cacheBust } from "../../js/core/cache-bust.js?v=v2026-04-23T22332";

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
  const tShapes   = document.getElementById("tShapes");
  const shapePicker = document.getElementById("shapePicker");

  const tUndo     = document.getElementById("tUndo");
  const tRedo     = document.getElementById("tRedo");
  const tClear    = document.getElementById("tClear");
  const tEye      = document.getElementById("tEye");

  // Tło sceny — 🖼️
  const tBg       = document.getElementById("tBg");     // 🖼️ (tło)

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

  const ICON_FG = {
  
    // BIAŁE — puste kółko
    WHITE: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle class="fill" cx="12" cy="12" r="7"></circle>
      </svg>
    `,
  
    // CZARNE — pełne kółko
    BLACK: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="7"
                stroke-width="2"></circle>
      </svg>
    `,
  };

  function getColorLabel(color) {
    return color === "BLACK"
      ? t("logoEditor.draw.colors.black")
      : t("logoEditor.draw.colors.white");
  }
  
  function syncDynamicIcons() {
    // bg / tBg
    if (tBg) {
      tBg.innerHTML = ICON_BG[bg] || ICON_BG.BLACK;
      tBg.setAttribute("aria-label", t("logoEditor.draw.aria.backgroundColor", { color: getColorLabel(bg) }));
    }
  }

  // =========================================================
  // Kontekstowe ustawienia (w toolbarze, drugi rząd)
  // =========================================================
  const toolCtx = document.getElementById("toolCtxSettings");

  function showSettings(html) {
    if (!toolCtx) return;
    toolCtx.innerHTML = html;
  }

  function hideSettings() {
    if (!toolCtx) return;
    toolCtx.innerHTML = "";
  }

  // Helper: przycisk koloru (prostokątny, cały wypełniony)
  function ctxColorBtn(value) {
    const isBlack = value === "BLACK";
    return `<button class="ctxColorBtn ${isBlack ? 'black' : 'white'}" type="button" data-color-toggle="${isBlack ? 'black' : 'white'}" title="${isBlack ? t("logoEditor.draw.ui.colorBlack") : t("logoEditor.draw.ui.colorWhite")}"></button>`;
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
  function allSame(arr) {
    if (!arr.length) return { mixed: false, value: undefined };
    const v = arr[0];
    const all = arr.every(x => x === v);
    return { mixed: !all, value: v };
  }

  // =========================================================
  // Ustawienia narzędzia (gdy nic nie zaznaczone)
  // =========================================================
  function renderToolSettings() {
    const tn = tool.toLowerCase();
    const T = (k) => t(`logoEditor.draw.ui.${k}`);
    const TS = (k) => t(`logoEditor.draw.ui.shapes.${k}`);
    const LS = (k) => t(`logoEditor.draw.ui.lineStyles.${k}`);

    if (tn === "brush") {
      const ts = toolSettings[TOOL.BRUSH];
      showSettings(`
        <div class="ctxGroup"><span class="ctxLabel">${T("strokeLabel")}</span><input id="cStrokeW" class="ctxInput" type="number" min="1" max="50" step="1" value="${ts.stroke}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">${T("styleLabel")}</span>
          <select id="cLineStyle" class="ctxInput">${LINE_STYLES.map(s => `<option value="${s.id}" ${ts.lineStyle===s.id?"selected":""}>${LS(s.id)}</option>`).join('')}</select>
        </div>
        <div class="ctxGroup"><span class="ctxLabel">${T("colorLabel")}</span>${ctxColorBtn(ts.fg)}</div>
      `);
      document.getElementById("cStrokeW")?.addEventListener("input", e => {
        toolSettings[TOOL.BRUSH].stroke = clamp(+e.target.value||1,1,50);
        updateCursorVisual();
      });
      document.getElementById("cLineStyle")?.addEventListener("change", e => {
        toolSettings[TOOL.BRUSH].lineStyle = e.target.value;
      });
      const brushBtns = toolCtx?.querySelectorAll("[data-color-toggle]") || [];
      if (brushBtns[0]) brushBtns[0].addEventListener("click", () => {
        toolSettings[TOOL.BRUSH].fg = toolSettings[TOOL.BRUSH].fg === "BLACK" ? "WHITE" : "BLACK";
        syncDynamicIcons();
        renderToolSettings();
      });
    }
    else if (tn === "eraser") {
      const es = toolSettings[TOOL.ERASER];
      showSettings(`<div class="ctxGroup"><span class="ctxLabel">${T("sizeLabel")}</span><input id="cEraser" class="ctxInput" type="number" min="1" max="50" step="1" value="${es.size}"/></div>`);
      document.getElementById("cEraser")?.addEventListener("input", e => {
        toolSettings[TOOL.ERASER].size = clamp(+e.target.value||10,1,50);
        updateCursorVisual();
      });
    }
    else if (tn === "shapes") {
      const ts = toolSettings[TOOL.SHAPES];
      const shape = SHAPES.find(s => s.id === currentShape) || SHAPES[0];
      const isPoly = shape.isPoly;
      const hasFill = shape.hasFill;

      let html = `
        <div class="ctxGroup" style="position:relative;">
          <button class="ctxBtn" id="cShapeBtn" style="min-width:90px;max-width:150px;justify-content:space-between;display:flex;align-items:center;gap:4px;">
            <span style="display:flex;align-items:center;gap:4px;">${shape.icon}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t(shape.label)}</span></span>
            <span style="opacity:.4;">▾</span>
          </button>
        </div>
        <div class="ctxGroup"><span class="ctxLabel">${T("strokeLabel")}</span><input id="cStrokeW" class="ctxInput" type="number" min="0" max="50" step="1" value="${ts.stroke}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">${T("styleLabel")}</span>
          <select id="cLineStyle" class="ctxInput">${LINE_STYLES.map(s => `<option value="${s.id}" ${ts.lineStyle===s.id?"selected":""}>${LS(s.id)}</option>`).join('')}</select>
        </div>
        <div class="ctxGroup"><span class="ctxLabel">${T("colorLabel")}</span>${ctxColorBtn(ts.fg)}</div>
      `;

      if (hasFill) {
        html += `<div class="ctxGroup"><label class="ctxChk"><input type="checkbox" id="cFill" ${ts.fill?"checked":""}/> ${T("fillCheckbox")}</label>${ctxColorBtn(ts.fillColor)}</div>`;
      }

      if (isPoly && polyPoints.length > 0) {
        html += `<div class="ctxGroup"><button class="ctxBtn on" id="cPolyDone">${T("polygonDone")}</button></div>`;
      }

      showSettings(html);

      document.getElementById("cShapeBtn")?.addEventListener("click", () => { openShapePicker(); });
      document.getElementById("cStrokeW")?.addEventListener("input", e => {
        toolSettings[TOOL.SHAPES].stroke = clamp(+e.target.value||1,0,50);
      });
      document.getElementById("cLineStyle")?.addEventListener("change", e => {
        toolSettings[TOOL.SHAPES].lineStyle = e.target.value;
      });

      const shapeBtns = toolCtx?.querySelectorAll("[data-color-toggle]") || [];
      if (shapeBtns[0]) shapeBtns[0].addEventListener("click", () => {
        toolSettings[TOOL.SHAPES].fg = toolSettings[TOOL.SHAPES].fg === "BLACK" ? "WHITE" : "BLACK";
        syncDynamicIcons();
        renderToolSettings();
      });
      if (shapeBtns[1] && hasFill) shapeBtns[1].addEventListener("click", () => {
        toolSettings[TOOL.SHAPES].fillColor = ts.fillColor === "BLACK" ? "WHITE" : "BLACK";
        renderToolSettings();
      });
      document.getElementById("cFill")?.addEventListener("change", e => {
        toolSettings[TOOL.SHAPES].fill = e.target.checked;
        renderToolSettings();
      });

      document.getElementById("cPolyDone")?.addEventListener("click", () => finalizePolygon());
    }
    else if (tn === "text") {
      const ts = toolSettings[TOOL.TEXT];
      const fntLbl = DRAW_FONTS.find(f=>f.value===textFont)?.label || "Font";
      showSettings(`
        <div class="ctxGroup"><button class="ctxBtn" id="cFont" style="min-width:90px;max-width:140px;justify-content:space-between;display:flex;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fntLbl}</span><span style="opacity:.4;">▾</span></button></div>
        <div class="ctxGroup"><span class="ctxLabel">Roz.</span><input id="cSz" class="ctxInput" type="number" min="10" max="220" step="1" value="${textFontSize}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">Linia</span><input id="cLH" class="ctxInput" type="number" min="0.6" max="3.0" step="0.05" value="${textLineHeight}"/></div>
        <div class="ctxGroup"><span class="ctxLabel">Odst.</span><input id="cSp" class="ctxInput" type="number" min="0" max="20" step="0.5" value="${textLetterSpacing}"/></div>
        <div class="ctxGroup"><button class="ctxBtn ${textBold?'on':''}" id="cB">B</button><button class="ctxBtn ${textItalic?'on':''}" id="cI">I</button><button class="ctxBtn ${textUnderline?'on':''}" id="cU">U</button></div>
        <div class="ctxGroup">
          <button class="ctxBtn ${textAlign==='left'?'on':''}" id="cAlignL">⇤</button>
          <button class="ctxBtn ${textAlign==='center'?'on':''}" id="cAlignC">⇆</button>
          <button class="ctxBtn ${textAlign==='right'?'on':''}" id="cAlignR">⇥</button>
        </div>
        <div class="ctxGroup"><span class="ctxLabel">Kolor</span>${ctxColorBtn(ts.fg)}</div>
      `);
      document.getElementById("cFont")?.addEventListener("click", () => { openDrawFontPicker(v=>{textFont=v;renderToolSettings();},textFont); });
      document.getElementById("cSz")?.addEventListener("input", e => { textFontSize = clamp(+e.target.value||40,10,220); });
      document.getElementById("cLH")?.addEventListener("input", e => { textLineHeight = clamp(+e.target.value||1,0.6,3); });
      document.getElementById("cSp")?.addEventListener("input", e => { textLetterSpacing = clamp(+e.target.value||0,0,20); });
      document.getElementById("cB")?.addEventListener("click", e => { textBold=!textBold; e.currentTarget.classList.toggle("on",textBold); });
      document.getElementById("cI")?.addEventListener("click", e => { textItalic=!textItalic; e.currentTarget.classList.toggle("on",textItalic); });
      document.getElementById("cU")?.addEventListener("click", e => { textUnderline=!textUnderline; e.currentTarget.classList.toggle("on",textUnderline); });
      document.getElementById("cAlignL")?.addEventListener("click", () => { textAlign="left"; renderToolSettings(); });
      document.getElementById("cAlignC")?.addEventListener("click", () => { textAlign="center"; renderToolSettings(); });
      document.getElementById("cAlignR")?.addEventListener("click", () => { textAlign="right"; renderToolSettings(); });
      const textBtns = toolCtx?.querySelectorAll("[data-color-toggle]") || [];
      if (textBtns[0]) textBtns[0].addEventListener("click", () => {
        toolSettings[TOOL.TEXT].fg = toolSettings[TOOL.TEXT].fg === "BLACK" ? "WHITE" : "BLACK";
        syncDynamicIcons();
        renderToolSettings();
      });
    }
    else {
      hideSettings();
    }
  }
  function getSelectedObjects() {
    if (!fabricCanvas) return [];
    const active = fabricCanvas.getActiveObjects();
    return Array.isArray(active) ? active.filter(Boolean) : [];
  }

  /** Ustawienia zaznaczonego obiektu TEKSTU (font, rozmiar, B/I/U, align) */
  function renderTextObjectSettings(obj) {
    if (!obj || !isTextObj(obj)) { hideSettings(); return; }

    const objFont = obj.fontFamily || "";
    const fontLabel = DRAW_FONTS.find(f => f.value === objFont)?.label || "Font";
    const objSize = Math.round(obj.fontSize || 40);
    const objLH = obj.lineHeight || 1;
    const objSpacing = Math.round((obj.charSpacing || 0) / 50);
    const objBold = obj.fontWeight === "bold" || obj.fontWeight == 700 || obj.fontWeight === "700";
    const objItalic = obj.fontStyle === "italic";
    const objUnderline = !!obj.underline;
    const objAlign = obj.textAlign || "left";
    const objFill = obj.fill || "#ffffff";
    const T = (k) => t(`logoEditor.draw.ui.${k}`);

    showSettings(`
      <div class="ctxGroup"><button class="ctxBtn" id="cTFont" style="min-width:90px;max-width:140px;justify-content:space-between;display:flex;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fontLabel}</span><span style="opacity:.4;">▾</span></button></div>
      <div class="ctxGroup"><span class="ctxLabel">${T("radiusLabel")}</span><input id="cTSize" class="ctxInput" type="number" min="10" max="220" step="1" value="${objSize}"/></div>
      <div class="ctxGroup"><span class="ctxLabel">${T("lineHeightLabel")}</span><input id="cTLH" class="ctxInput" type="number" min="0.6" max="3.0" step="0.05" value="${objLH}"/></div>
      <div class="ctxGroup"><span class="ctxLabel">${T("letterSpacingLabel")}</span><input id="cTSp" class="ctxInput" type="number" min="0" max="20" step="0.5" value="${objSpacing}"/></div>
      <div class="ctxGroup"><button class="ctxBtn ${objBold?'on':''}" id="cTB">${T("bold")}</button><button class="ctxBtn ${objItalic?'on':''}" id="cTI">${T("italic")}</button><button class="ctxBtn ${objUnderline?'on':''}" id="cTU">${T("underline")}</button></div>
      <div class="ctxGroup">
        <button class="ctxBtn ${objAlign==='left'?'on':''}" id="cAlignL">⇤</button>
        <button class="ctxBtn ${objAlign==='center'?'on':''}" id="cAlignC">⇆</button>
        <button class="ctxBtn ${objAlign==='right'?'on':''}" id="cAlignR">⇥</button>
      </div>
      <div class="ctxGroup"><span class="ctxLabel">${T("colorLabel")}</span>${ctxColorBtn(fabricToBW(objFill))}</div>
    `);

    document.getElementById("cTFont")?.addEventListener("click", () => {
      openDrawFontPicker(v => { obj.set("fontFamily", v); fabricCanvas.renderAll(); renderTextObjectSettings(obj); }, objFont);
    });
    document.getElementById("cTSize")?.addEventListener("input", e => {
      pushUndo();
      obj.set("fontSize", clamp(+e.target.value||40, 10, 220));
      fabricCanvas.renderAll();
    });
    document.getElementById("cTLH")?.addEventListener("input", e => {
      pushUndo();
      obj.set("lineHeight", clamp(+e.target.value||1, 0.6, 3));
      fabricCanvas.renderAll();
    });
    document.getElementById("cTSp")?.addEventListener("input", e => {
      const uiVal = clamp(+e.target.value||0, 0, 20);
      pushUndo();
      obj.set("charSpacing", uiVal * 50);
      fabricCanvas.renderAll();
    });
    document.getElementById("cTB")?.addEventListener("click", e => {
      pushUndo();
      obj.set("fontWeight", !objBold ? "bold" : "normal");
      fabricCanvas.renderAll();
      renderTextObjectSettings(obj);
    });
    document.getElementById("cTI")?.addEventListener("click", e => {
      pushUndo();
      obj.set("fontStyle", !objItalic ? "italic" : "normal");
      fabricCanvas.renderAll();
      renderTextObjectSettings(obj);
    });
    document.getElementById("cTU")?.addEventListener("click", e => {
      pushUndo();
      obj.set("underline", !objUnderline);
      fabricCanvas.renderAll();
      renderTextObjectSettings(obj);
    });
    document.getElementById("cAlignL")?.addEventListener("click", () => {
      pushUndo();
      obj.set("textAlign", "left");
      fabricCanvas.renderAll();
      renderTextObjectSettings(obj);
    });
    document.getElementById("cAlignC")?.addEventListener("click", () => {
      pushUndo();
      obj.set("textAlign", "center");
      fabricCanvas.renderAll();
      renderTextObjectSettings(obj);
    });
    document.getElementById("cAlignR")?.addEventListener("click", () => {
      pushUndo();
      obj.set("textAlign", "right");
      fabricCanvas.renderAll();
      renderTextObjectSettings(obj);
    });

    const objTextBtns = toolCtx?.querySelectorAll("[data-color-toggle]") || [];
    if (objTextBtns[0]) objTextBtns[0].addEventListener("click", () => {
      const currentBW = fabricToBW(obj.fill);
      const newColor = currentBW === "BLACK" ? "#ffffff" : "#000000";
      obj.set("fill", newColor); fabricCanvas.renderAll(); renderTextObjectSettings(obj);
    });
  }

  /** Multi-selection: TYLKO przecięcie właściwości */
  function renderObjectSettings() {
    const objs = getSelectedObjects();
    if (!objs.length) { hideSettings(); return; }

    const textObjs = objs.filter(o => o.type === "i-text" || o.type === "textbox" || o.type === "text");
    const hasText = textObjs.length > 0;

    // Tekst z czymkolwiek → NIC
    if (hasText) { hideSettings(); return; }

    // Wszystkie nie-tekstowe kształty
    const shapes = objs.filter(o => !textObjs.includes(o));
    if (shapes.length === 0) return;

    // Sprawdź które MOGĄ mieć wypełnienie - zasada AND
    // Linia/polyline = NIGDY
    // Rect/Ellipse = ZAWSZE
    // Path z _canHaveFill (flaga ustawiona przy tworzeniu) = MOŻE
    // Path bez flagi (linie/strzałki) = NIGDY
    const canHaveFill = shapes.filter(o => {
      if (o.type === "line" || o.type === "polyline") return false;
      if (o.type === "rect" || o.type === "ellipse") return true;
      if (o.type === "path") return !!o._canHaveFill;
      return !!o._canHaveFill;
    });
    const allCanFill = canHaveFill.length === shapes.length;

    const strokeWs = shapes.map(o => o.strokeWidth || 1);
    const strokeCols = shapes.map(o => o.stroke || "#ffffff");
    const strokeW = allSame(strokeWs.map(Math.round));
    const strokeCol = allSame(strokeCols);
    const fills = shapes.map(o => o.fill || "transparent");
    const fillCol = allSame(fills);

    let html = `
      <div class="ctxGroup"><span class="ctxLabel">${t("logoEditor.draw.ui.outlineLabel")}</span><input id="cObjStroke" class="ctxInput" type="number" min="0" max="50" step="1" value="${strokeW.mixed?'':strokeW.value}" placeholder="${strokeW.mixed?'—':''}"/></div>
      <div class="ctxGroup"><span class="ctxLabel">${t("logoEditor.draw.ui.styleLabel")}</span>
        <select id="cObjLineStyle" class="ctxInput">${LINE_STYLES.map(s=>`<option value="${s.id}">${s.label()}</option>`).join('')}</select>
      </div>
      <div class="ctxGroup">${ctxColorBtn(strokeCol.mixed?"MIXED":fabricToBW(strokeCol.value))}</div>
    `;

    // Tylko jeśli WSZYSTKIE mogą mieć wypełnienie
    if (allCanFill) {
      const allHaveFill = shapes.every(o => o.fill && o.fill !== "transparent");
      html += `<div class="ctxGroup"><label class="ctxChk"><input type="checkbox" id="cObjFill" ${allHaveFill?"checked":""}/> ${t("logoEditor.draw.ui.fillCheckbox")}</label>${ctxColorBtn(fillCol.mixed?"MIXED":fabricToBW(fillCol.value))}</div>`;
    }

    showSettings(html);

    document.getElementById("cObjStroke")?.addEventListener("input", e => {
      shapes.forEach(o => o.set("strokeWidth", clamp(+e.target.value || 1, 0, 50)));
      fabricCanvas.renderAll();
      pushUndo();
    });
    document.getElementById("cObjLineStyle")?.addEventListener("change", e => {
      shapes.forEach(o => applyLineStyle(o, e.target.value, shapes[0]?.strokeWidth));
      fabricCanvas.renderAll();
      pushUndo();
    });
    const objShapeBtns = toolCtx?.querySelectorAll("[data-color-toggle]") || [];
    if (objShapeBtns[0]) objShapeBtns[0].addEventListener("click", () => {
      const c = fabricToBW(shapes[0]?.stroke);
      const n = c === "BLACK" ? "#ffffff" : "#000000";
      shapes.forEach(o => o.set("stroke", n));
      fabricCanvas.renderAll();
      pushUndo();
      renderObjectSettings();
    });
    if (objShapeBtns[1] && allCanFill) objShapeBtns[1].addEventListener("click", () => {
      const c = fabricToBW(shapes.find(x => x.fill && x.fill !== "transparent")?.fill || "#fff");
      const n = c === "BLACK" ? "#ffffff" : "#000000";
      shapes.forEach(o => { if (o.fill !== undefined) o.set("fill", n); });
      fabricCanvas.renderAll();
      pushUndo();
      renderObjectSettings();
    });
    document.getElementById("cObjFill")?.addEventListener("change", e => {
      const nc = e.target.checked ? "#ffffff" : "transparent";
      shapes.forEach(o => o.set("fill", nc));
      fabricCanvas.renderAll();
      pushUndo();
      renderObjectSettings();
    });
  }
  function injectIcon(id, html){
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html || "";
    // a11y: jeśli button nie ma aria-label, dodaj prosty fallback
    if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", id);
  }

  const ICONS = {
    tSelect: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3l6 14 2-6 6-2L5 3z"></path></svg>`,
    tPan: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 12V7.2a1.2 1.2 0 0 1 2.4 0V12"></path><path d="M10.4 12V6.4a1.2 1.2 0 0 1 2.4 0V12"></path><path d="M12.8 12V7.8a1.2 1.2 0 0 1 2.4 0V12"></path><path d="M15.2 12V9.2a1.2 1.2 0 0 1 2.4 0V14.2"></path><path d="M8 12c0 6 2.6 8 6.6 8 3.1 0 5.4-2 5.4-5.1v-.7"></path></svg>`,
    tZoomIn: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6"></circle><path d="M21 21l-5.2-5.2"></path><path d="M10 7v6"></path><path d="M7 10h6"></path></svg>`,
    tZoomOut: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6"></circle><path d="M21 21l-5.2-5.2"></path><path d="M7 10h6"></path></svg>`,
    tText: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 6h14"></path><path d="M12 6v12"></path><path d="M8 18h8"></path></svg>`,
    tBrush: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"></path><path d="M14 6l3 3"></path></svg>`,
    tEraser: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 16l8.5-8.5a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L11 19H7l-2-2 2-1z"></path><path d="M11 19h10"></path><path d="M9.2 14.8l4 4"></path></svg>`,
    tShapes: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="6" height="6" rx="1" fill="currentColor"/><circle cx="17" cy="7" r="3" fill="currentColor"/><polygon points="12,15 17,21 7,21" fill="currentColor"/></svg>`,
    tUndo: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 7H5v4"></path><path d="M5 11c2-4 6-6 10-4 2 1 4 3 4 6"></path></svg>`,
    tRedo: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 7h4v4"></path><path d="M19 11c-2-4-6-6-10-4-2 1-4 3-4 6"></path></svg>`,
    tClear: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 7h12"></path><path d="M9 7V5h6v2"></path><path d="M8 7l1 14h6l1-14"></path></svg>`,
    tDuplicate: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"></rect><rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"></rect></svg>`,
    tEye: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle class="fill" cx="12" cy="12" r="2"></circle></svg>`,
  };

  // Wstrzyknij wszystkie ikonki
  for (const [id, svg] of Object.entries(ICONS)) {
    injectIcon(id, svg);
  }

    // =========================================================
  // Tooltipy — z dynamicznym pozycjonowaniem
  // =========================================================
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);

  const K = {
    MOD: isMac ? "⌘" : "Ctrl",
    ALT: isMac ? "⌥" : "Alt",
    SHIFT: isMac ? "⇧" : "Shift",
  };

  function tip2(action, shortcut, extra = "") {
    // Show only the shortcut for the current OS
    const line2 = `${t("logoEditor.draw.ui.shortcutPrefix")}${shortcut}`;
    return extra ? `${action}\n${line2}\n${extra}` : `${action}\n${line2}`;
  }

  function setTip(el, txt) {
    if (!el) return;
    // Store tooltip text as data attribute for JS-based tooltip
    el.setAttribute("data-tip", txt);
  }

  // Dynamic tooltip positioning — shows above the hovered element
  let _tipEl = null;
  function showTip(el) {
    if (!el) return;
    const tipText = el.getAttribute("data-tip");
    if (!tipText) return;
    hideTip();
    const tip = document.createElement("div");
    tip.className = "draw-tip";
    tip.textContent = tipText;
    tip.style.visibility = "hidden";
    document.body.appendChild(tip);
    _tipEl = tip;

    // Force layout so we can measure
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    const rect = el.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - tw / 2;
    const top = rect.top - th - 10;

    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
    tip.style.visibility = "visible";
    tip.style.opacity = "1";
    tip.style.transform = "translateY(0)";
  }

  function hideTip() {
    if (_tipEl) {
      _tipEl.remove();
      _tipEl = null;
    }
  }

  // Attach hover listeners to all toolbar buttons
  function initTooltips() {
    const btns = document.querySelectorAll(".editorToolbar .tbtn");
    btns.forEach(btn => {
      // Remove old listeners first
      btn.removeEventListener("mouseenter", btn._tipEnter);
      btn.removeEventListener("mouseleave", btn._tipLeave);
      btn.removeEventListener("focus", btn._tipFocus);
      btn.removeEventListener("blur", btn._tipBlur);

      // Create bound handlers
      btn._tipEnter = () => showTip(btn);
      btn._tipLeave = hideTip;
      btn._tipFocus = () => showTip(btn);
      btn._tipBlur = hideTip;

      btn.addEventListener("mouseenter", btn._tipEnter);
      btn.addEventListener("mouseleave", btn._tipLeave);
      btn.addEventListener("focus", btn._tipFocus);
      btn.addEventListener("blur", btn._tipBlur);
    });
  }

  function updateTooltips() {
    // Select / Pan
    setTip(tSelect, tip2(t("logoEditor.draw.tooltips.select"), `${K.MOD} (przytrzymaj)`));
    setTip(tPan,    tip2(t("logoEditor.draw.tooltips.pan"), "Spacja (przytrzymaj)"));

    // Zoom
    setTip(tZoomIn,  tip2(t("logoEditor.draw.tooltips.zoomIn"), `${K.MOD} + +`));
    setTip(tZoomOut, tip2(t("logoEditor.draw.tooltips.zoomOut"), `${K.MOD} + -`));

    // Kolor / tło
    setTip(tBg,    t("logoEditor.draw.tooltips.background"));

    // Narzędzia
    setTip(tBrush,   tip2(t("logoEditor.draw.tooltips.brush"), "B"));
    setTip(tEraser,  tip2(t("logoEditor.draw.tooltips.eraser"), "E"));
    setTip(tShapes,  tip2(t("logoEditor.draw.tooltips.shapes"), "S"));
    setTip(tText,    tip2(t("logoEditor.draw.tooltips.text"), "T"));
    setTip(tUndo, tip2(t("logoEditor.draw.tooltips.undo"), isMac ? "⌘Z" : "Ctrl+Z"));
    setTip(tRedo, tip2(t("logoEditor.draw.tooltips.redo"), isMac ? "⌘⇧Z / ⌘Y" : "Ctrl+Shift+Z / Ctrl+Y"));
    setTip(tDuplicate, t("logoEditor.draw.tooltips.duplicate") || "Duplikuj");

    // Akcje
    setTip(tClear,    t("logoEditor.draw.tooltips.clear"));
    setTip(tEye,      t("logoEditor.draw.tooltips.preview"));
  }

  updateTooltips();
  initTooltips();
  window.addEventListener("i18n:lang", () => {
    updateTooltips();
    initTooltips(); // re-bind after text update
    syncDynamicIcons();
  });

  // =========================================================
  // Consts / helpers
  // =========================================================
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const ASPECT = 26 / 11;

  const RAST_W = 208;
  const RAST_H = 88;

  // WORLD = SCENA:
  let worldW = 1;
  let worldH = 1;

  const MIN_ZOOM = 1.0;
  const MAX_ZOOM = 12.0;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

  function requireFabric() {
    const f = window.fabric;
    if (!f) throw new Error(t("logoEditor.draw.errors.missingFabric"));
    return f;
  }

  function isEditableTarget(t) {
    if (!t) return false;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (t.isContentEditable) return true;
    return false;
  }

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function clampWorldPoint(p) {
    return { x: clamp(p.x, 0, worldW), y: clamp(p.y, 0, worldH) };
  }

  // =========================================================
  // Tool state
  // =========================================================
  const TOOL = {
    SELECT: "SELECT",
    PAN: "PAN",
    TEXT: "TEXT",
    BRUSH: "BRUSH",
    ERASER: "ERASER",
    SHAPES: "SHAPES",
  };

  // Lista dostępnych kształtów - label jako key tłumaczenia
  const SHAPES = [
    { id: "line", label: "logoEditor.draw.ui.shapes.line", hasFill: false, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` },
    { id: "rect", label: "logoEditor.draw.ui.shapes.rect", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><rect x="4" y="6" width="16" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>` },
    { id: "roundRect", label: "logoEditor.draw.ui.shapes.roundRect", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><rect x="4" y="6" width="16" height="12" rx="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>` },
    { id: "ellipse", label: "logoEditor.draw.ui.shapes.ellipse", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><ellipse cx="12" cy="12" rx="9" ry="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>` },
    { id: "triangle", label: "logoEditor.draw.ui.shapes.triangle", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><polygon points="12,4 20,20 4,20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
    { id: "diamond", label: "logoEditor.draw.ui.shapes.diamond", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><polygon points="12,3 21,12 12,21 3,12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
    { id: "pentagon", label: "logoEditor.draw.ui.shapes.pentagon", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><polygon points="12,3 21,9 18,20 6,20 3,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
    { id: "hexagon", label: "logoEditor.draw.ui.shapes.hexagon", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><polygon points="12,3 21,8 21,16 12,21 3,16 3,8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
    { id: "star5", label: "logoEditor.draw.ui.shapes.star5", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
    { id: "arrow1", label: "logoEditor.draw.ui.shapes.arrow1", hasFill: false, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M5 12h14M14 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    { id: "arrow2", label: "logoEditor.draw.ui.shapes.arrow2", hasFill: false, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M5 12h14M14 7l5 5-5 5M10 7L5 12l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    { id: "arrow1Fill", label: "logoEditor.draw.ui.shapes.arrow1Fill", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 19L19 12L12 5V9H5V15H12V19Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
    { id: "arrow2Fill", label: "logoEditor.draw.ui.shapes.arrow2Fill", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M7 8H17V5L22 12L17 19V16H7V19L2 12L7 5V8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>` },
    { id: "heart", label: "logoEditor.draw.ui.shapes.heart", hasFill: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 21C12 21 4 15 4 8.5 4 5 7 3 12 7c5-4 8-2 8 1.5 0 6.5-8 12.5-8 12.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
    { id: "polygon", label: "logoEditor.draw.ui.shapes.polygon", hasFill: true, isPoly: true, icon: `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><polygon points="3,5 20,3 22,16 8,21" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` },
  ];

  // Style linii
  const LINE_STYLES = [
    { id: "solid", label: () => t("logoEditor.draw.ui.lineStyles.solid"), dash: null },
    { id: "dashed", label: () => t("logoEditor.draw.ui.lineStyles.dashed"), dash: (w) => [w * 2, w] },
    { id: "dotted", label: () => t("logoEditor.draw.ui.lineStyles.dotted"), dash: (w) => [Math.max(w * 0.5, 1), w * 1.5] },
    { id: "dashDot", label: () => t("logoEditor.draw.ui.lineStyles.dashDot"), dash: (w) => [w * 3, w, Math.max(w * 0.5, 1), w] },
  ];

  // Aktualny kształt i styl linii
  let currentShape = "rect";
  let currentLineStyle = "solid";

  // baseTool = narzędzie wybrane przez klik / klawisz
  // tool = narzędzie aktualne (może być chwilowo podmienione przez Space/Ctrl)
  let baseTool = TOOL.SELECT;
  let tool = TOOL.SELECT;

  // Kolor domyślny (stroke) — USUNIĘTO na rzecz individual tool settings
  // let fg = "WHITE"; 

  function fgColor() { 
    // Pobierz kolor z ustawień aktualnego narzędzia
    const tKey = tool === TOOL.SHAPES ? TOOL.SHAPES : tool.toUpperCase();
    const ts = toolSettings[tKey] || {};
    return (ts.fg || "WHITE") === "BLACK" ? "#000" : "#fff"; 
  }
  function fgLabel() { 
    const c = fgColor();
    return c === "#000" ? "⬛️" : "⬜️"; 
  }

  // Tło sceny — 🖼️
  let bg = "BLACK"; // BLACK | WHITE
  function bgColor() { return bg === "WHITE" ? "#fff" : "#000"; }

  // Stroke/fill settings
  let strokeWidth = 2;
  let eraserSize = 10;
  let fillEnabled = false;
  let fillColor = "#ffffff";

  // Text tool settings
  let textFont = "";
  let textFontSize = 80;
  let textLineHeight = 1;
  let textLetterSpacing = 0;
  let textBold = false;
  let textItalic = false;
  let textUnderline = false;
  let textAlign = "center";

  // Font loading + picker
  let DRAW_FONTS = [];
  async function loadDrawFonts() {
    if (DRAW_FONTS.length) return DRAW_FONTS;
    try {
      const url = await cacheBust(new URL("./fonts.json", import.meta.url).href);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      DRAW_FONTS = Array.isArray(data) ? data.filter(f => f && f.value && f.label) : [];
      return DRAW_FONTS;
    } catch { return []; }
  }

  // Font picker state
  let drawFontOpen = false;
  let drawFontFiltered = [];
  let drawFontOnSelect = null; // callback

  function closeDrawFontPicker() {
    if (!drawFontPickPop) return;
    drawFontOpen = false;
    drawFontPickPop.hidden = true;
    if (drawFontSearchInp) drawFontSearchInp.value = "";
  }

  function openDrawFontPicker(onSelect, currentValue) {
    if (!drawFontPickPop || !DRAW_FONTS.length) return;
    drawFontOpen = true;
    drawFontOnSelect = onSelect;
    drawFontPickPop.hidden = false;

    // Position below the toolbar
    const toolbar = document.getElementById("toolsDraw");
    if (toolbar) {
      const r = toolbar.getBoundingClientRect();
      drawFontPickPop.style.top = `${Math.round(r.bottom + 8)}px`;
      drawFontPickPop.style.left = `${Math.max(8, Math.round(r.left))}px`;
    }

    if (drawFontSearchInp) {
      drawFontSearchInp.value = "";
      drawFontSearchInp.focus();
    }
    renderDrawFontList(currentValue);
  }

  function renderDrawFontList(currentValue) {
    if (!drawFontList || !drawFontEmpty) return;
    const q = (drawFontSearchInp?.value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    drawFontFiltered = !q ? DRAW_FONTS : DRAW_FONTS.filter(f =>
      f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
    );

    drawFontEmpty.hidden = drawFontFiltered.length > 0;
    drawFontList.innerHTML = "";

    for (const f of drawFontFiltered) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "fontPickItem" + (f.value === currentValue ? " on" : "");
      // Nazwa czcionki systemowym fontem, sample czcionką docelową
      item.innerHTML = `<span style="flex:1;text-align:left;font-family:system-ui,-apple-system,sans-serif;">${f.label}</span><span class="fontPickSwatch" style="font-family:${f.value};">${t("logoEditor.draw.ui.sampleText")}</span>`;
      item.addEventListener("click", () => {
        if (drawFontOnSelect) drawFontOnSelect(f.value);
        closeDrawFontPicker();
      });
      drawFontList.appendChild(item);
    }
  }

  // Wire up font picker events
  if (drawFontSearchInp) {
    drawFontSearchInp.addEventListener("input", () => renderDrawFontList(textFont));
  }
  if (drawFontSearchClear) {
    drawFontSearchClear.addEventListener("click", () => {
      if (drawFontSearchInp) drawFontSearchInp.value = "";
      renderDrawFontList(textFont);
      drawFontSearchInp?.focus();
    });
  }
  // Close on outside click
  document.addEventListener("pointerdown", (ev) => {
    if (!drawFontOpen) return;
    const t = ev.target;
    if (t === drawFontSearchInp || t === drawFontSearchClear || drawFontPickPop?.contains(t)) return;
    closeDrawFontPicker();
  }, true);

  function currentTool() {
    return tool;
  }

  syncDynamicIcons();

  // Ustawienia narzędzi:
  // - brush: stroke
  // - eraser: brak ustawień
  // - line: stroke
  // - rect/ellipse/poly: stroke + fill bool + fillColor (WHITE/BLACK)
  const toolSettings = {
    [TOOL.BRUSH]:   { stroke: 6, fg: "WHITE", lineStyle: "solid" },
    [TOOL.SHAPES]:  { stroke: 6, fg: "WHITE", lineStyle: "solid", fill: false, fillColor: "WHITE" },
    [TOOL.TEXT]:    { fontSize: 40, fg: "WHITE" },
    [TOOL.ERASER]:  { size: 10 },
  };

  function getStroke() {
    const s = toolSettings[tool]?.stroke;
    return clamp(Number(s || 6), 1, 80);
  }

  // =========================================================
  // Style linii
  // =========================================================
  function getDashArray(lineStyle, width) {
    const style = LINE_STYLES.find(s => s.id === lineStyle);
    if (!style || !style.dash) return null;
    return style.dash(width || 6);
  }

  function applyLineStyle(obj, lineStyle, width) {
    obj.set("strokeDashArray", getDashArray(lineStyle, width));
    if (lineStyle === "dotted") {
      obj.set("strokeLineCap", "round");
    } else {
      obj.set("strokeLineCap", "butt");
    }
  }

  // Dropdown wyboru kształtu
  let shapePickerOpen = false;
  function svgPathToPath(pathStr) {
    const commands = [];
    const tokens = pathStr.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    for (const token of tokens) {
      const cmd = token[0].toUpperCase();
      const nums = token.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
      commands.push([cmd, ...nums]);
    }
    return commands;
  }

  function openShapePicker(e) {
    if (e) e.stopPropagation();
    if (shapePickerOpen) { closeShapePicker(); return; }
    shapePickerOpen = true;
    const btn = document.getElementById("cShapeBtn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    let html = `<div class="shapePickerPop" id="shapePickerPop" style="position:fixed;z-index:1000;background:rgba(15,18,28,.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:8px;box-shadow:0 16px 48px rgba(0,0,0,.6);display:grid;grid-template-columns:repeat(5,42px);gap:5px;top:${rect.bottom+6}px;left:${rect.left}px;opacity:0;transition:opacity .12s;">`;
    SHAPES.forEach(s => {
      html += `<button class="spi" data-shape="${s.id}" style="width:42px;height:42px;display:grid;place-items:center;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);border-radius:10px;color:rgba(255,255,255,.9);cursor:pointer;transition:all .1s;">${s.icon}</button>`;
    });
    html += `</div>`;
    document.body.insertAdjacentHTML("beforeend", html);
    const pop = document.getElementById("shapePickerPop");
    requestAnimationFrame(() => { pop.style.opacity = "1"; });
    
    pop.querySelectorAll(".spi").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        currentShape = item.dataset.shape;
        closeShapePicker();
        renderToolSettings();
      });
      item.addEventListener("mouseenter", () => {
        const shape = SHAPES.find(s => s.id === item.dataset.shape);
        if (!shape) return;
        const tip = document.createElement("div");
        tip.textContent = t(shape.label);
        tip.style.cssText = "position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:rgba(0,0,0,.9);color:#ffeaa6;padding:4px 8px;border-radius:6px;font-size:11px;white-space:nowrap;pointer-events:none;z-index:1100;font-weight:600;letter-spacing:.3px;";
        item.appendChild(tip);
        item._tipEl = tip;
      });
      item.addEventListener("mouseleave", () => {
        if (item._tipEl) { item._tipEl.remove(); item._tipEl = null; }
      });
    });

    // Zamykanie przy kliknięciu poza - używamy setTimeout żeby nie zamknąć od razu
    setTimeout(() => {
      document.addEventListener("mousedown", shapePickerOutsideHandler);
    }, 100);
  }
  function shapePickerOutsideHandler(e) {
    const pop = document.getElementById("shapePickerPop");
    const btn = document.getElementById("cShapeBtn");
    if (pop && !pop.contains(e.target) && btn && !btn.contains(e.target)) {
      closeShapePicker();
    }
  }
  function closeShapePicker() {
    shapePickerOpen = false;
    document.getElementById("shapePickerPop")?.remove();
    document.removeEventListener("mousedown", shapePickerOutsideHandler);
  }
  function svgPathToArray(pathStr) {
    // Parsuje SVG path string na array fabric.js: [['M',x,y],['L',x,y],['Z']]
    const commands = [];
    const tokens = pathStr.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    for (const token of tokens) {
      const cmd = token[0].toUpperCase();
      const nums = token.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
      commands.push([cmd, ...nums]);
    }
    return commands;
  }

  // =========================================================
  function buildShapePath(shapeId, x1, y1, x2, y2, strokeWidth) {
    const cx = (x1+x2)/2, cy = (y1+y2)/2;
    const w = Math.abs(x2-x1) || 10, h = Math.abs(y2-y1) || 10;
    const r = Math.min(w,h)/2;
    const sw = strokeWidth || 6;
    const len = Math.hypot(x2-x1, y2-y1);

    switch(shapeId) {
      case "line": return `M ${x1} ${y1} L ${x2} ${y2}`;
      case "arrow1": return buildArrowPath(x1,y1,x2,y2,1,sw,false);
      case "arrow2": return buildArrowPath(x1,y1,x2,y2,2,sw,false);
      case "arrow1Fill": return buildArrowPath(x1,y1,x2,y2,1,sw,true);
      case "arrow2Fill": return buildArrowPath(x1,y1,x2,y2,2,sw,true);
      case "triangle": return `M ${cx} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
      case "diamond": return `M ${cx} ${y1} L ${x2} ${cy} L ${cx} ${y2} L ${x1} ${cy} Z`;
      case "pentagon": return buildPolygonPath(cx, cy, r, 5);
      case "hexagon": return buildPolygonPath(cx, cy, r, 6);
      case "star5": return buildStarPath(cx, cy, r, r*0.4, 5);
      case "heart": return buildHeartPath(cx, cy, Math.max(w,h));
      case "polygon": return `M ${x1} ${y1}`;
      default: return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
  }

  function buildArrowPath(x1, y1, x2, y2, dirCount, strokeW, isFilled) {
    const dx = x2 - x1, dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const c = Math.cos(ang), s = Math.sin(ang);
    
    const tf = (pts) => pts.map(([px, py]) => [x1 + px*c - py*s, y1 + px*s + py*c]);
    const fp = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
    
    if (isFilled) {
      const sh = Math.min(strokeW * 4 + L * 0.018, L * 0.3);
      const hh = Math.min(sh * 2.2, L * 0.4);
      let hl = Math.min(sh * 2.5, L * 0.35);
      
      if (dirCount === 2) {
        if (hl * 2 > L * 0.7) hl = L * 0.35;
        const pts = tf([
          [hl, -hh], [0, 0], [hl, hh], [hl, sh],
          [L-hl, sh], [L-hl, hh], [L, 0],
          [L-hl, -hh], [L-hl, -sh], [hl, -sh]
        ]);
        return `M ${fp(pts[0])} ${pts.slice(1).map(p => `L ${fp(p)}`).join(' ')} Z`;
      }
      
      const pts = tf([
        [0, -sh], [L-hl, -sh], [L-hl, -hh], [L, 0], [L-hl, hh], [L-hl, sh], [0, sh]
      ]);
      return `M ${fp(pts[0])} ${pts.slice(1).map(p => `L ${fp(p)}`).join(' ')} Z`;
    }
    
    // LINIA - otwarty kontur
    let hl = strokeW * 5;
    if (hl > L * 0.8) hl = L * 0.8;
    const hh = strokeW * 2.5;
    
    if (dirCount === 2) {
      if (hl > L * 0.38) hl = L * 0.38;
      const shaft = tf([[0,0], [L,0]]);
      const headE = tf([[L-hl, -hh], [L,0], [L-hl, hh]]);
      const headS = tf([[hl, -hh], [0,0], [hl, hh]]);
      return `M ${fp(shaft[0])} L ${fp(shaft[1])} M ${fp(headE[0])} L ${fp(headE[1])} L ${fp(headE[2])} M ${fp(headS[0])} L ${fp(headS[1])} L ${fp(headS[2])}`;
    }
    
    const shaft = tf([[0,0], [L,0]]);
    const head = tf([[L-hl, -hh], [L,0], [L-hl, hh]]);
    return `M ${fp(shaft[0])} L ${fp(shaft[1])} M ${fp(head[0])} L ${fp(head[1])} L ${fp(head[2])}`;
  }

  function buildPolygonPath(cx,cy,r,sides) {
    let p="";
    for(let i=0;i<sides;i++){const a=(i/sides)*Math.PI*2-Math.PI/2; p+=(i===0?"M ":" L ")+`${cx+r*Math.cos(a)} ${cy+r*Math.sin(a)}`;}
    return p+" Z";
  }

  function buildStarPath(cx,cy,oR,iR,pts) {
    let p="";
    for(let i=0;i<pts*2;i++){const a=(i/(pts*2))*Math.PI*2-Math.PI/2; const r=i%2===0?oR:iR; p+=(i===0?"M ":" L ")+`${cx+r*Math.cos(a)} ${cy+r*Math.sin(a)}`;}
    return p+" Z";
  }

  function buildHeartPath(cx,cy,sz) { const s=sz/2; return `M ${cx} ${cy+s*0.7} C ${cx-s*1.2} ${cy-s*0.2}, ${cx-s*0.5} ${cy-s*1.2}, ${cx} ${cy-s*0.4} C ${cx+s*0.5} ${cy-s*1.2}, ${cx+s*1.2} ${cy-s*0.2}, ${cx} ${cy+s*0.7} Z`; }

  function getFillEnabled() {
    return !!toolSettings[tool]?.fill;
  }

  function getFillColorHex() {
    const c = toolSettings[tool]?.fillColor === "BLACK" ? "#000" : "#fff";
    return c;
  }

  // =========================================================
  // Fabric
  // =========================================================
  let fabricCanvas = null;
  let initialized = false;

  let _needOffsetKick = true;

  // Pan
  let panDown = false;
  let panStart = { x: 0, y: 0 };
  let vptStart = null;

  // Shapes in progress
  let drawingObj = null;
  let drawingStart = null; // world point start (for shift constraints)
  let drawingShift = false;

  // Polygon
  let polyPoints = [];
  let polyPreview = null;

  // Undo/Redo
  let undoStack = [];
  let redoStack = [];
  let undoBusy = false;

  // Preview bits
  let bits150 = new Uint8Array(DOT_W * DOT_H);
  let _deb = null;
  let _previewSeq = 0;

  // Temp modifiers
  let holdSpace = false;
  let holdCtrl = false;

  // Cursor overlay
  let cursorLayer = null;
  let cursorDot = null;  // div we draw as circle/square via CSS
  let lastPointer = { x: 0, y: 0 };

  let pointerDown = false;

  // =========================================================
  // Sizing: WORLD = SCENA
  // =========================================================
  function getStageSize() {
    const host = drawStageHost || drawCanvasEl?.parentElement;
    const rect = host?.getBoundingClientRect?.() || { width: 800, height: 400 };

    let w = Math.max(320, Math.floor(rect.width));
    let h = Math.floor(w / ASPECT);

    if (rect.height > 0 && h > rect.height) {
      h = Math.max(180, Math.floor(rect.height));
      w = Math.floor(h * ASPECT);
    }
    return { w, h };
  }

  function updateWorldSize(w, h) {
    worldW = Math.max(1, Math.floor(w));
    worldH = Math.max(1, Math.floor(h));
  }

  function updateClipPath() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    // clip w układzie świata (absolutePositioned)
    fabricCanvas.clipPath = new f.Rect({
      left: 0,
      top: 0,
      width: worldW,
      height: worldH,
      absolutePositioned: true,
    });
  }

  function resetView() {
    if (!fabricCanvas) return;
    // WORLD=SCENA: zoom=1 i brak przesunięcia
    fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fabricCanvas.requestRenderAll();
  }

  function clampViewport() {
    if (!fabricCanvas) return;

    const cw = fabricCanvas.getWidth();
    const ch = fabricCanvas.getHeight();
    const z = fabricCanvas.getZoom();

    const v = fabricCanvas.viewportTransform ? fabricCanvas.viewportTransform.slice() : [z,0,0,z,0,0];

    // Gdy z==1: minE = 0, maxE=0 -> zawsze 0
    const minE = cw - worldW * z;
    const maxE = 0;
    const minF = ch - worldH * z;
    const maxF = 0;

    v[4] = clamp(v[4], minE, maxE);
    v[5] = clamp(v[5], minF, maxF);

    fabricCanvas.setViewportTransform(v);
  }

  // Skalowanie istniejących obiektów przy resize (WORLD zmienia rozmiar)
  function scaleAllObjects(oldW, oldH, newW, newH) {
    if (!fabricCanvas) return;
    if (oldW <= 0 || oldH <= 0) return;
    // aspekt stały, więc skala w praktyce ta sama
    const sx = newW / oldW;
    const sy = newH / oldH;
    const s = (Math.abs(sx - sy) < 1e-6) ? sx : Math.min(sx, sy);

    if (!isFinite(s) || s <= 0) return;
    if (Math.abs(s - 1) < 1e-6) return;

    fabricCanvas.getObjects().forEach(o => {
      // Fabric ogarnia większość typów przez scale/left/top
      o.scaleX = (o.scaleX || 1) * s;
      o.scaleY = (o.scaleY || 1) * s;
      o.left = (o.left || 0) * s;
      o.top  = (o.top  || 0) * s;

      // Dla linii/polilinii/poligonów/punktów: skala też działa, ale współrzędne punktów zostają
      // w "lokalnym" układzie — i tak Fabric to renderuje przez scaleX/scaleY.
      o.setCoords();
    });

    fabricCanvas.requestRenderAll();
  }

  let _resizeRaf = 0;
  function resizeScene() {
    if (!fabricCanvas || !drawCanvasEl) return;
    const { w, h } = getStageSize();

    const oldW = worldW;
    const oldH = worldH;

    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();

    updateWorldSize(w, h);
    updateClipPath();

    // dopasuj content do nowej sceny (WORLD=SCENA)
    if (oldW > 1 && oldH > 1) scaleAllObjects(oldW, oldH, worldW, worldH);

    resetView();
    clampViewport();
    updateCursorVisual(); // żeby kursor zgadzał się z zoom
    schedulePreview(60);
  }

  // =========================================================
  // Zoom
  // =========================================================
  function setZoomClamped(nextZoom, center = null) {
    if (!fabricCanvas) return;
    const f = requireFabric();
    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const pt = center || new f.Point(fabricCanvas.getWidth()/2, fabricCanvas.getHeight()/2);
    fabricCanvas.zoomToPoint(pt, z);

    // przy min zoom ustawiamy też twardo pan=0
    if (z <= MIN_ZOOM + 1e-6) {
      fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    } else {
      clampViewport();
    }

    fabricCanvas.requestRenderAll();
    updateCursorVisual();
    updateZoomButtons();
  }

  function zoomBy(factor, center = null) {
    if (!fabricCanvas) return;
    setZoomClamped(fabricCanvas.getZoom() * factor, center);
  }

  function zoomTo100() {
    setZoomClamped(1.0, null);
  }

  function updateZoomButtons() {
    if (!fabricCanvas) return;
    const z = fabricCanvas.getZoom();
    if (tZoomOut) tZoomOut.disabled = z <= MIN_ZOOM + 1e-6;
    if (tPan) {
      // ręka w sensie "tryb" nadal można mieć, ale pan fizycznie nic nie zrobi przy zoom=1
      // nie blokujemy przycisku, tylko w mouse down ignorujemy.
    }
  }

  // =========================================================
  // Styles
  // =========================================================
  function makeStrokeFillStyle() {
    const ts = toolSettings[tool] || toolSettings[TOOL.SHAPES] || {};
    
    const w = ts.stroke ?? strokeWidth;
    const strokeHex = fgColor();
    
    // Bezpieczne odczytywanie ustawień wypełnienia
    const fillEnabled = !!ts.fill;
    const fillColorHex = ts.fillColor === "BLACK" ? "#000" : "#fff";
    const fillHex = fillEnabled ? fillColorHex : "rgba(0,0,0,0)";
    
    return {
      stroke: strokeHex,
      strokeWidth: w,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      fill: fillHex,
      strokeDashArray: getDashArray(ts.lineStyle || "solid", w),
    };
  }

  function applyBrushStyle() {
    if (!fabricCanvas) return;
    const f = requireFabric();
    if (!fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush = new f.PencilBrush(fabricCanvas);
    }
    fabricCanvas.freeDrawingBrush.width = getStroke();
    fabricCanvas.freeDrawingBrush.color = fgColor();
    fabricCanvas.freeDrawingBrush.decimate = 0;
  }

  // =========================================================
  // Cursor overlay (metoda 2)
  // =========================================================

  function hideOverlayCursor() {
    if (!cursorDot) return;
    cursorDot.style.transform = "translate(-9999px, -9999px)";
  }
  
  function showOverlayCursor() {
    // tu nic nie musimy robić – pokazanie to po prostu ustawienie transform w placeOverlayAt()
    // ale zostawiamy funkcję, bo czasem chcesz ją wołać dla czytelności
  }
  
  function setCursorClass(mode, isDown = false) {
    if (!drawStageHost) return;
  
    drawStageHost.classList.remove("cur-select","cur-pan","cur-cross","cur-none","down");
  
    if (mode === "select") drawStageHost.classList.add("cur-select");
    else if (mode === "pan") drawStageHost.classList.add("cur-pan");
    else if (mode === "cross") drawStageHost.classList.add("cur-cross");
    else if (mode === "none") drawStageHost.classList.add("cur-none");
  
    if (isDown) drawStageHost.classList.add("down");
  }
  
  function ensureCursorOverlay() {
    if (!drawStageHost) return;
    if (cursorLayer) return;

    cursorLayer = document.createElement("div");
    cursorLayer.style.position = "absolute";
    cursorLayer.style.inset = "0";
    cursorLayer.style.pointerEvents = "none";
    cursorLayer.style.zIndex = "25"; // nad canvasem, pod popoverem (ten ma z-index 30)

    cursorDot = document.createElement("div");
    cursorDot.style.position = "absolute";
    cursorDot.style.left = "0";
    cursorDot.style.top = "0";
    cursorDot.style.transform = "translate(-9999px, -9999px)";
    cursorDot.style.border = "1px solid rgba(255,255,255,.85)";
    cursorDot.style.boxShadow = "0 0 0 1px rgba(0,0,0,.35)";
    cursorDot.style.borderRadius = "999px";
    cursorDot.style.background = "transparent";

    cursorLayer.appendChild(cursorDot);
    drawStageHost.style.position = "relative";
    drawStageHost.appendChild(cursorLayer);
  }

  function updateCursorVisual() {
    if (!fabricCanvas) return;
    ensureCursorOverlay();
  
    // reset overlay
    hideOverlayCursor();
  
    // Uwaga: Fabric czasem zmienia hoverCursor na "move".
    // My to wyłączamy wszędzie poza SELECT.
    const setFabricCursors = (def, hov, mov) => {
      fabricCanvas.defaultCursor = def;
      fabricCanvas.hoverCursor = hov;
      fabricCanvas.moveCursor = mov;
      // Reset CSS cursor na upperCanvasEl
      if (fabricCanvas.upperCanvasEl) fabricCanvas.upperCanvasEl.style.cursor = "";
      if (drawCanvasEl) drawCanvasEl.style.cursor = "";
    };
  
    if (tool === TOOL.SELECT) {
      setCursorClass("select", false);
      // default: normalna strzałka
      // hover na obiekcie: move
      // przeciąganie: move
      setFabricCursors("default", "move", "move");
      hideOverlayCursor();
      return;
    }
    
    // PAN: ręka (zależnie od panDown)
    if (tool === TOOL.PAN) {
      setCursorClass("pan", !!panDown);
      // zablokuj "move" od Fabric
      setFabricCursors(panDown ? "grabbing" : "grab", panDown ? "grabbing" : "grab", panDown ? "grabbing" : "grab");
      return;
    }
  
    // BRUSH: tylko kółko overlay, bez strzałki/krzyżyka
    if (tool === TOOL.BRUSH) {
      setCursorClass("none", false);
      setFabricCursors("none", "none", "none");
  
      const z = fabricCanvas.getZoom();
      const d = Math.max(6, Math.round(getStroke() * z));
  
      cursorDot.style.width = `${d}px`;
      cursorDot.style.height = `${d}px`;
      cursorDot.style.borderRadius = "999px";
      cursorDot.style.border = "1px solid rgba(255,255,255,.9)";
      cursorDot.style.background = "transparent";
      cursorDot.style.boxShadow = "0 0 0 1px rgba(0,0,0,.35)";
  
      placeOverlayAt(lastPointer.x, lastPointer.y);
      return;
    }
  
    // ERASER: kwadrat overlay, bez strzałki
    if (tool === TOOL.ERASER) {
      setCursorClass("none", false);
      setFabricCursors("none", "none", "none");

      const z = fabricCanvas.getZoom();
      const es = toolSettings[TOOL.ERASER];
      const d = Math.max(6, Math.round(es.size * z));
      cursorDot.style.width = `${d}px`;
      cursorDot.style.height = `${d}px`;
      cursorDot.style.borderRadius = "2px";
      cursorDot.style.border = "1px solid rgba(255,255,255,.9)";
      cursorDot.style.background = "transparent";
      cursorDot.style.boxShadow = "0 0 0 1px rgba(0,0,0,.35)";
  
      placeOverlayAt(lastPointer.x, lastPointer.y);
      return;
    }
  
    // TEXT: crosshair na pustym polu, I-beam na tekście
    if (tool === TOOL.TEXT) {
      // Nie używamy setCursorClass (nadpisuje wszystko !important)
      // Ustawiamy Fabric cursors: default=crosshair, hover na tekście=text
      fabricCanvas.defaultCursor = "crosshair";
      fabricCanvas.hoverCursor = "text";
      fabricCanvas.moveCursor = "text";
      
      // Reset klasy CSS (żeby !important nie nadpisywał)
      const host = document.getElementById("drawStageHost");
      if (host) host.className = "";
      if (fabricCanvas.upperCanvasEl) fabricCanvas.upperCanvasEl.style.cursor = "";
      if (drawCanvasEl) drawCanvasEl.style.cursor = "";
      
      hideOverlayCursor();
      return;
    }

    // SHAPES + POLY: krzyżyk
    setCursorClass("cross", false);
    setFabricCursors("crosshair", "crosshair", "crosshair");
  }

  function placeOverlayAt(clientX, clientY) {
    if (!cursorDot || !fabricCanvas) return;
  
    // FABRIC: realne eventy/cursor są na upperCanvasEl
    const el = fabricCanvas.upperCanvasEl || drawCanvasEl;
    if (!el) return;
  
    const rect = el.getBoundingClientRect();
    const x = Math.round(clientX - rect.left);
    const y = Math.round(clientY - rect.top);
  
    // poza obszarem => chowamy overlay
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      hideOverlayCursor();
      return;
    }
  
    // center overlay
    const w = cursorDot.offsetWidth || 0;
    const h = cursorDot.offsetHeight || 0;
    cursorDot.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px)`;
  }

  // =========================================================
  // UI: tools
  // =========================================================
  function syncToolButtons() {
    setBtnOn(tSelect, tool === TOOL.SELECT);
    setBtnOn(tPan, tool === TOOL.PAN);

    setBtnOn(tBrush, tool === TOOL.BRUSH);
    setBtnOn(tEraser, tool === TOOL.ERASER);
    setBtnOn(tShapes, tool === TOOL.SHAPES);
    setBtnOn(tText, tool === TOOL.TEXT);
  }

  function applyToolBehavior() {
    if (!fabricCanvas) return;

    const setAll = ({ selectable, evented }) => {
      fabricCanvas.forEachObject(o => {
        o.selectable = !!selectable;
        o.evented = !!evented; // <-- KLUCZ
      });
    };

    if (tool === TOOL.SELECT) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = true;

      setAll({ selectable: true, evented: true });

      // lepsze trafianie cienkich obiektów
      fabricCanvas.perPixelTargetFind = true;
      fabricCanvas.targetFindTolerance = 10;

      clearPolyDraft();
    }
    else if (tool === TOOL.PAN) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();

      // NIE zaznaczamy, ale eventy mają działać (hover/target)
      setAll({ selectable: false, evented: true });

      fabricCanvas.perPixelTargetFind = false;
      fabricCanvas.targetFindTolerance = 0;

      clearPolyDraft();
    }
    else if (tool === TOOL.TEXT) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = true;
      fabricCanvas.discardActiveObject();

      // Tekst musi być selectable i evented
      setAll({ selectable: true, evented: true });

      fabricCanvas.perPixelTargetFind = false;
      fabricCanvas.targetFindTolerance = 0;

      clearPolyDraft();
    }
    else if (tool === TOOL.BRUSH) {
      fabricCanvas.isDrawingMode = true;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
  
      // ważne: evented=true zostaje, selectable=false
      setAll({ selectable: false, evented: true });
  
      fabricCanvas.perPixelTargetFind = false;
      fabricCanvas.targetFindTolerance = 0;
  
      clearPolyDraft();
      applyBrushStyle();
    }
    else if (tool === TOOL.ERASER) {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
  
      // gumka MUSI mieć targetowanie
      setAll({ selectable: false, evented: true });
  
      fabricCanvas.perPixelTargetFind = true;
      fabricCanvas.targetFindTolerance = 10;
  
      clearPolyDraft();
    }
    else {
      // figury + POLY
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
  
      // evented=true musi zostać, żeby gumka działała zawsze
      setAll({ selectable: false, evented: true });
  
      fabricCanvas.perPixelTargetFind = false;
      fabricCanvas.targetFindTolerance = 0;
  
      if (tool !== TOOL.POLY) clearPolyDraft();
    }
  
    syncToolButtons();
    updateCursorVisual();
    schedulePreview(80);
  }

  function setBaseTool(next) {
    baseTool = next;
    // jeśli nie trzymamy temp-modyfikatorów — zmieniamy od razu
    if (!holdSpace && !holdCtrl) {
      tool = baseTool;
      // Zdejmij zaznaczenie przy zmianie narzędzia (oprócz Select)
      if (tool !== TOOL.SELECT && fabricCanvas) {
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
      }
      applyToolBehavior();
      renderCurrentSettings();
      syncToolButtons();
      updateCursorVisual();
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
  function renderCurrentSettings(optObj) {
    const obj = optObj || getActiveObj();

    // SELECT tool:
    if (tool === TOOL.SELECT) {
      // Kształty: pokaż ustawienia obiektu (przecięcie właściwości)
      if (obj && !isTextObj(obj)) {
        renderObjectSettings();
        return;
      }
      // Tekst w Select: NIE pokazujemy ustawień tekstu - Select służy tylko do przesuwania
      if (isTextObj(obj)) {
        hideSettings();
        return;
      }
      // Brak zaznaczenia
      hideSettings();
      return;
    }

    // TEXT tool + zaznaczony tekst → pokaż ustawienia TEKSTU OBIEKTU
    if (tool === TOOL.TEXT && isTextObj(obj)) {
      renderTextObjectSettings(obj);
      return;
    }

    // Inne narzędzia -> pokaż ustawienia narzędzia
    renderToolSettings();
  }

  function setTool(next) {
    baseTool = next;
    tool = next;
    applyToolBehavior();
    renderCurrentSettings();
    syncToolButtons();
    updateCursorVisual();
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
    return fabricCanvas.toJSON([
      // Obrys
      "stroke","strokeWidth","strokeLineCap","strokeLineJoin","strokeDashArray","strokeUniform",
      // Wypełnienie i przezroczystość
      "fill","opacity",
      // Transformacja
      "skewX","skewY","angle",
      // Tekst
      "fontFamily","fontSize","fontWeight","fontStyle","underline",
      "textAlign","lineHeight","charSpacing","text",
      // Stan interakcji
      "selectable","evented",
      // Nasze flagi
      "_canHaveFill"
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
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  /** Wymuszony pushUndo - dodaje snapshot nawet jeśli się nie zmienił */
  function pushUndoForce() {
    if (!fabricCanvas || undoBusy) return;
    const j = snapshotJSON();
    if (!j) return;

    undoStack.push(j);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function restoreFrom(json) {
    if (!fabricCanvas || !json) return;
    undoBusy = true;
    fabricCanvas.loadFromJSON(json, () => {
      // Przywróć właściwości obiektów (selectable: false itp.)
      fabricCanvas.forEachObject(o => {
        if (o._selectable !== undefined) {
          o.selectable = o._selectable;
          o.evented = o._evented;
        } else if (!o._canHaveFill) {
          // Domyślnie: nowe obiekty są nie-selectable
          o.selectable = false;
          o.evented = true;
        }
      });
      undoBusy = false;
      fabricCanvas.requestRenderAll();
      ctx.markDirty?.();
      schedulePreview(80);
      updateUndoRedoButtons();
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
  // Export/Import edit history
  // =========================================================
  function getEditHistory() {
    return {
      undoStack: undoStack.slice(), // kopia
      redoStack: redoStack.slice()
    };
  }

  function setEditHistory(history) {
    if (!history) return;
    undoStack = Array.isArray(history.undoStack) ? history.undoStack.slice() : [];
    redoStack = Array.isArray(history.redoStack) ? history.redoStack.slice() : [];
    updateUndoRedoButtons();
  }

  function clearEditHistory() {
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
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
    // Odśwież ustawienia, żeby pokazać przycisk zamykania jeśli to wielokąt
    if (tool === TOOL.SHAPES && currentShape === "polygon") {
      renderCurrentSettings();
    }
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

    const ts = toolSettings[TOOL.SHAPES];
    const style = makeStrokeFillStyle();
    const shape = SHAPES.find(s => s.id === currentShape);
    const noFill = !shape?.hasFill;
    const fillVal = noFill ? "transparent" : (ts.fill ? (ts.fillColor === "BLACK" ? "#000" : "#fff") : "transparent");

    if (currentShape === "line" || currentShape.startsWith("arrow")) {
      let pathArr;
      if (currentShape === "line") {
        pathArr = [['M', p0.x, p0.y], ['L', p0.x + 1, p0.y + 1]];
      } else {
        const isArrowFill = currentShape.endsWith("Fill");
        const arrowDir = currentShape === "arrow2" || currentShape === "arrow2Fill" ? 2 : 1;
        pathArr = buildArrowPath(p0.x, p0.y, p0.x + 1, p0.y + 1, arrowDir, ts.stroke, isArrowFill);
      }
      drawingObj = new f.Path(pathArr, {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeUniform: true, // strokeWidth niezależne od scale
        fill: fillVal,
        strokeLineCap: style.strokeLineCap,
        strokeLineJoin: style.strokeLineJoin,
        strokeDashArray: style.strokeDashArray,
        _canHaveFill: currentShape.startsWith("arrow"), // strzałki mogą mieć fill
        selectable: false,
        evented: true,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      drawingObj.setCoords();
      fabricCanvas.requestRenderAll();
      return;
    }

    if (currentShape === "rect" || currentShape === "roundRect") {
      drawingObj = new f.Rect({
        left: p0.x, top: p0.y, width: 1, height: 1,
        originX: "left", originY: "top", rx: currentShape==="roundRect"?20:0, ry: currentShape==="roundRect"?20:0,
        ...style, fill: fillVal, selectable: false, evented: true, objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
    } else if (currentShape === "ellipse") {
      drawingObj = new f.Ellipse({
        left: p0.x, top: p0.y, rx: 1, ry: 1,
        originX: "left", originY: "top",
        ...style, fill: fillVal, selectable: false, evented: true, objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
    } else {
      // Kształty Path - generuj od (0,0) do (10,10), pozycjonuj przez left/top
      const pathStr = buildShapePath(currentShape, 0, 0, 10, 10, ts.stroke);
      const pathArr = svgPathToPath(pathStr);
      drawingObj = new f.Path(pathArr, {
        left: p0.x - 5,
        top: p0.y - 5,
        originX: "left",
        originY: "top",
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeUniform: true,
        fill: fillVal,
        strokeLineCap: style.strokeLineCap,
        strokeLineJoin: style.strokeLineJoin,
        strokeDashArray: style.strokeDashArray,
        _canHaveFill: shape?.hasFill || false,
        selectable: false,
        evented: true,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      drawingObj.setCoords();
      fabricCanvas.requestRenderAll();
    }
  }

  function updateFigure(ev, shiftKey) {
    if (!fabricCanvas || !drawingObj || !drawingStart) return;
    const f = requireFabric();
    const p = getWorldPointFromMouse(ev);
    const shift = !!shiftKey;
    const shape = currentShape;
    const ts = toolSettings[TOOL.SHAPES];
    const style = makeStrokeFillStyle();
    const shapeInfo = SHAPES.find(s => s.id === currentShape);
    const noFill = !shapeInfo?.hasFill;
    const fillVal = noFill ? "transparent" : (ts.fill ? (ts.fillColor === "BLACK" ? "#000" : "#fff") : "transparent");

    // Linie i strzałki - generuj od (0,0) do (w,h), pozycjonuj przez left/top
    if (shape === "line" || shape.startsWith("arrow")) {
      let w = p.x - drawingStart.x, h = p.y - drawingStart.y;
      if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w||1)*m; h = Math.sign(h||1)*m; }
      const absW = Math.max(2, Math.abs(w)), absH = Math.max(2, Math.abs(h));
      
      let pathArr, arrowFill;
      if (shape === "line") {
        pathArr = [['M', 0, 0], ['L', absW, absH]];
        arrowFill = "transparent";
      } else {
        const isArrowFill = currentShape.endsWith("Fill");
        const arrowDir = currentShape === "arrow2" || currentShape === "arrow2Fill" ? 2 : 1;
        arrowFill = isArrowFill ? (ts.fill ? (ts.fillColor === "BLACK" ? "#000" : "#fff") : "transparent") : "transparent";
        const pathStr = buildArrowPath(0, 0, absW, absH, arrowDir, ts.stroke, isArrowFill);
        pathArr = svgPathToPath(pathStr);
      }
      
      const left = w >= 0 ? drawingStart.x : drawingStart.x + w;
      const top = h >= 0 ? drawingStart.y : drawingStart.y + h;
      
      fabricCanvas.remove(drawingObj);
      drawingObj = new f.Path(pathArr, {
        left, top,
        originX: "left",
        originY: "top",
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeUniform: true, // strokeWidth niezależne od scale
        fill: arrowFill,
        strokeLineCap: style.strokeLineCap,
        strokeLineJoin: style.strokeLineJoin,
        strokeDashArray: style.strokeDashArray,
        _canHaveFill: shape.startsWith("arrow"), // strzałki mogą mieć fill
        selectable: false,
        evented: true,
        objectCaching: false,
      });
      fabricCanvas.add(drawingObj);
      drawingObj.setCoords();
      fabricCanvas.requestRenderAll();
      return;
    }

    // Prostokąt
    if (shape === "rect" || shape === "roundRect") {
      const x0 = drawingStart.x, y0 = drawingStart.y;
      let w = p.x - x0, h = p.y - y0;
      if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w||1)*m; h = Math.sign(h||1)*m; }
      const left = w>=0 ? x0 : x0+w, top = h>=0 ? y0 : y0+h;
      drawingObj.set({ left:clampWorldPoint({x:left,y:top}).x, top:clampWorldPoint({x:left,y:top}).y, width:Math.max(1,Math.abs(w)), height:Math.max(1,Math.abs(h)) });
      fabricCanvas.requestRenderAll();
      return;
    }

    // Elipsa
    if (shape === "ellipse") {
      const x0 = drawingStart.x, y0 = drawingStart.y;
      let w = p.x - x0, h = p.y - y0;
      if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w||1)*m; h = Math.sign(h||1)*m; }
      const left = w>=0 ? x0 : x0+w, top = h>=0 ? y0 : y0+h;
      drawingObj.set({ left:clampWorldPoint({x:left,y:top}).x, top:clampWorldPoint({x:left,y:top}).y, rx:Math.max(0.5,Math.abs(w)/2), ry:Math.max(0.5,Math.abs(h)/2) });
      fabricCanvas.requestRenderAll();
      return;
    }

    // Kształty Path - generuj od (0,0) do (w,h), pozycjonuj przez left/top
    let w = p.x - drawingStart.x, h = p.y - drawingStart.y;
    if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w||1)*m; h = Math.sign(h||1)*m; }
    const absW = Math.max(2, Math.abs(w)), absH = Math.max(2, Math.abs(h));
    const pathStr = buildShapePath(shape, 0, 0, absW, absH, ts.stroke);
    const pathArr = svgPathToPath(pathStr);
    const left = w >= 0 ? drawingStart.x : drawingStart.x + w;
    const top = h >= 0 ? drawingStart.y : drawingStart.y + h;
    
    fabricCanvas.remove(drawingObj);
    drawingObj = new f.Path(pathArr, {
      left, top,
      originX: "left",
      originY: "top",
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeUniform: true,
      fill: fillVal,
      strokeLineCap: style.strokeLineCap,
      strokeLineJoin: style.strokeLineJoin,
      strokeDashArray: style.strokeDashArray,
      _canHaveFill: shapeInfo?.hasFill || false, // flaga dla renderObjectSettings
      selectable: false,
      evented: true,
      objectCaching: false,
    });
    fabricCanvas.add(drawingObj);
    fabricCanvas.requestRenderAll();
  }

  function finishFigure() {
    if (!fabricCanvas || !drawingObj) return;
    drawingObj.set({ selectable: true, evented: true });
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
      out[i] = lum >= 128 ? 1 : 0;
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
           tool === TOOL.SHAPES && currentShape === "polygon" ? t("logoEditor.draw.tools.poly") :
           tool === TOOL.PAN ? t("logoEditor.draw.tools.pan") :
           tool === TOOL.TEXT ? t("logoEditor.draw.tools.text") :
           t("logoEditor.draw.tools.select");
  }

  // =========================================================
  // Helpers: delete/duplicate/move selection
  // =========================================================
  function duplicateSelection() {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    let clones;
    if (active.type === "activeSelection") {
      // Multi-selection: klonujemy każdy obiekt
      clones = active.getObjects().map(o => {
        const clone = fabric.util.object.clone(o);
        clone.left = (o.left || 0) + 10;
        clone.top = (o.top || 0) + 10;
        clone.selectable = false;
        clone.evented = true;
        return clone;
      });
    } else {
      // Pojedynczy obiekt
      const clone = fabric.util.object.clone(active);
      clone.left = (active.left || 0) + 10;
      clone.top = (active.top || 0) + 10;
      clone.selectable = false;
      clone.evented = true;
      clones = [clone];
    }

    // Dodaj klony do canvasu
    clones.forEach(c => fabricCanvas.add(c));

    // Zaznacz wszystkie klony
    if (clones.length === 1) {
      fabricCanvas.setActiveObject(clones[0]);
    } else {
      const sel = new fabric.ActiveSelection(clones, {
        canvas: fabricCanvas,
      });
      fabricCanvas.setActiveObject(sel);
    }

    fabricCanvas.requestRenderAll();
    pushUndo();
    ctx.markDirty?.();
    schedulePreview(80);
  }

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
        e.path.strokeUniform = true; // strokeWidth niezależne od scale
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

    fabricCanvas.on("object:rotating", (e) => {
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
        kickOffsetIfNeeded();

        // Tolerancja skaluje się z rozmiarem gumki
        const es = toolSettings[TOOL.ERASER];
        const eraserTol = Math.max(10, es.size * 2);
        
        const oldTol = fabricCanvas.targetFindTolerance;
        const oldPx  = fabricCanvas.perPixelTargetFind;

        fabricCanvas.perPixelTargetFind = true;
        fabricCanvas.targetFindTolerance = eraserTol;

        // Sprawdź WSZYSTKIE obiekty pod kursorem
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

      if (tool === TOOL.SHAPES && currentShape === "polygon") {
        const wp = getWorldPointFromMouse(ev);
        addPolyPoint(wp);
        return;
      }

      if (tool === TOOL.SHAPES) {
        if (currentShape === "polygon") {
          const wp = getWorldPointFromMouse(ev);
          addPolyPoint(wp);
        } else {
          startFigure(ev, ev.shiftKey);
        }
        return;
      }

      if (tool === TOOL.TEXT) {
        const pointer = fabricCanvas.getPointer(opt.e);
        const target = opt.target || fabricCanvas.findTarget(ev);
        if (target && isTextObj(target)) {
          // Select existing text for editing
          fabricCanvas.setActiveObject(target);
          target.enterEditing();
          target.selectAll();
          fabricCanvas.renderAll();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
          renderTextObjectSettings(target);
          return;
        } else {
          // Jeśli kliknięto w pusty obszar i mamy aktywny obiekt tekstowy - odznacz go
          const active = fabricCanvas.getActiveObject();
          if (active && isTextObj(active)) {
            if (active.isEditing) active.exitEditing();
            fabricCanvas.discardActiveObject();
            fabricCanvas.renderAll();
            renderCurrentSettings();
            return;
          }

          // Create new text
          const textObj = new fabric.IText(t("logoEditor.draw.ui.defaultText"), {
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
      
      if (tool === TOOL.BRUSH || tool === TOOL.ERASER) {
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

        const es = toolSettings[TOOL.ERASER];
        const eraserTol = Math.max(10, es.size * 2);
        
        const oldTol = fabricCanvas.targetFindTolerance;
        const oldPx  = fabricCanvas.perPixelTargetFind;

        fabricCanvas.perPixelTargetFind = true;
        fabricCanvas.targetFindTolerance = eraserTol;

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


    // Kliknięcie POZA canvas → exit edit mode tekstu (tylko gdy nie klikamy na canvas)
    document.addEventListener("mousedown", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;
      // Ignoruj kliknięcia w inputy/select/button/tooltip
      const tag = ev.target.tagName.toLowerCase();
      if (["input","textarea","select","button","option"].includes(tag)) return;
      if (ev.target.closest("#toolsDraw") || ev.target.closest("#toolCtxSettings")) return;
      // Sprawdź czy klikamy w canvas (upperCanvasEl)
      const upperEl = fabricCanvas?.upperCanvasEl;
      if (upperEl && upperEl.contains(ev.target)) return; // klik w canvas - nie exit
      
      const active = fabricCanvas?.getActiveObject();
      if (active && isTextObj(active)) {
        if (active.isEditing) active.exitEditing();
        
        // Usuń puste obiekty tekstowe
        if (active.text?.trim() === "") {
          fabricCanvas?.remove(active);
          fabricCanvas?.discardActiveObject();
          pushUndo();
          ctx.markDirty?.();
          schedulePreview(80);
        } else {
          // Deselect the object if we clicked outside
          fabricCanvas?.discardActiveObject();
        }
        fabricCanvas?.renderAll();
      }
    });

    // Dwuklik kończy polygon LUB włącza edycję tekstu w Select
    drawCanvasEl.addEventListener("dblclick", (ev) => {
      if (ctx.getMode?.() !== "DRAW") return;

      if (tool === TOOL.SHAPES && currentShape === "polygon" && polyPoints.length >= 2) {
        ev.preventDefault();
        finalizePolygon();
        return;
      }

      if (tool === TOOL.SELECT) {
        const target = fabricCanvas.findTarget(ev);
        if (target && isTextObj(target)) {
          ev.preventDefault();
          setBaseTool(TOOL.TEXT);
          syncToolButtons();
          fabricCanvas.setActiveObject(target);
          target.enterEditing();
          target.selectAll();
          fabricCanvas.renderAll();
          renderTextObjectSettings(target);
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

    // Zablokuj skróty gdy edytujemy tekst (IText w trybie edycji)
    const active = fabricCanvas?.getActiveObject();
    if (active && active.isEditing) return; // nie przechwytuj skrótów podczas edycji tekstu
    
    // Dodatkowy check: sprawdź czy upperCanvasEl ma child textarea (Fabric edycja)
    const upperEl = fabricCanvas?.upperCanvasEl;
    if (upperEl && upperEl.querySelector("textarea")) return;

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
      // Enter zamyka wielokąt
      if (key === "Enter" && baseTool === TOOL.SHAPES && currentShape === "polygon" && polyPoints.length >= 2) { ev.preventDefault(); finalizePolygon(); return; }
      if (key === "Escape" && baseTool === TOOL.SHAPES && currentShape === "polygon") { ev.preventDefault(); clearPolyDraft(); return; }
      if ((key === "Backspace" || key === "Delete") && baseTool === TOOL.SHAPES && currentShape === "polygon" && polyPoints.length > 0) { ev.preventDefault(); popPolyPoint(); return; }

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

    // Delete/Backspace usuwa zaznaczone obiekty w Select
    if ((key === "Backspace" || key === "Delete") && baseTool === TOOL.SELECT) {
      const active = fabricCanvas?.getActiveObject();
      if (active && !active.isEditing) {
        ev.preventDefault();
        if (active.type === "activeSelection") {
          active.getObjects().forEach(o => fabricCanvas?.remove(o));
        } else {
          fabricCanvas?.remove(active);
        }
        fabricCanvas?.discardActiveObject();
        fabricCanvas?.requestRenderAll();
        pushUndo();
        ctx.markDirty?.();
        schedulePreview(80);
      }
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
    
    // Shapes dropdown - kliknięcie tShapes TYLKO wybiera narzędzie
    tShapes?.addEventListener("click", (e) => {
      e.stopPropagation();
      setBaseTool(TOOL.SHAPES);
    });

    // Zaznacz aktywny kształt w dropdownie
    shapePicker?.querySelectorAll(".shapeItem").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        currentShape = item.dataset.shape;
        updateShapePickerIcon();
        renderCurrentSettings();
        shapePicker.style.display = "none";
      });
    });
    document.addEventListener("click", (e) => {
      if (shapePicker && !shapePicker.contains(e.target) && e.target !== tShapes) {
        shapePicker.style.display = "none";
      }
    });

    // Zaznacz aktywny kształt w dropdownie
    shapePicker?.querySelectorAll(".shapeItem").forEach(item => {
      item.classList.toggle("active", item.dataset.shape === currentShape);
    });

    // Zoom buttons
    tZoomIn?.addEventListener("click", () => { zoomBy(1.15); schedulePreview(120); });
    tZoomOut?.addEventListener("click", () => { zoomBy(0.87); schedulePreview(120); });

    // History
    tUndo?.addEventListener("click", () => undo());
    tRedo?.addEventListener("click", () => redo());
    tDuplicate?.addEventListener("click", () => duplicateSelection());

    // Clear
    tClear?.addEventListener("click", async () => {
      if (ctx.getMode?.() !== "DRAW") return;
      if (!fabricCanvas) return;

      let ok = false;
      try { ok = await confirmModal({ text: t("logoEditor.draw.confirmClear") }); } catch(e) { ok = confirm(t("logoEditor.draw.ui.confirmClearFallback")); }
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

    // Background toggle
    tBg?.addEventListener("click", () => {
      toggleBg();
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
      const editHistory = source.editHistory || null;

      // Przywróć ustawienia narzędzi i tło
      if (source.bg) {
        bg = source.bg;
      } else if (fabricData && fabricData.backgroundColor) {
        // Fallback: spróbuj wywnioskować z danych Fabric
        bg = fabricToBW(fabricData.backgroundColor);
      } else {
        bg = "BLACK"; // Default
      }

      if (source.toolSettings) {
        // Scalamy, żeby nie zgubić nowych kluczy jeśli by doszły
        Object.assign(toolSettings, source.toolSettings);
      }

      syncDynamicIcons();
      renderCurrentSettings();

      // reset sesji rysunku
      if (fabricCanvas) {
        hideSettings();
        clearPolyDraft();

        const finalizeOpen = () => {
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
          applyToolBehavior(); // To teraz ustawi selectable dla wszystkich załadowanych obiektów

          ctx.clearDirty?.();
          schedulePreview(80);
        };

        if (fabricData) {
          undoBusy = true;
          fabricCanvas.loadFromJSON(fabricData, () => {
            undoBusy = false;
            // Upewnij się, że tło canvasu zgadza się z naszą zmienną bg
            fabricCanvas.backgroundColor = bgColor();
            
            // Domyślne flagi dla obiektów (zostaną nadpisane przez applyToolBehavior)
            fabricCanvas.forEachObject(o => {
              o.selectable = false;
              o.evented = true;
            });

            // Przywróć historię edycji jeśli jest
            if (editHistory) {
              setEditHistory(editHistory);
            } else {
              undoStack = [];
              redoStack = [];
              pushUndo();
              updateUndoRedoButtons();
            }

            fabricCanvas.requestRenderAll();
            finalizeOpen();
          });
        } else {
          fabricCanvas.getObjects().forEach(o => fabricCanvas.remove(o));
          fabricCanvas.backgroundColor = bgColor();
          fabricCanvas.requestRenderAll();

          undoStack = [];
          redoStack = [];
          pushUndo();
          updateUndoRedoButtons();
          finalizeOpen();
        }
      }
    },

    close() {
      show(paneDraw, false);
      hideSettings();
      hideOverlayCursor();
    },

    async getCreatePayload() {
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
            fabricData: snapshotJSON(),
            editHistory: getEditHistory(),
            bg: bg,
            toolSettings: toolSettings,
          }
        },
      };
    },

    // Export/Import edit history
    getEditHistory,
    setEditHistory,
    clearEditHistory,
  };
}
// version trigger
