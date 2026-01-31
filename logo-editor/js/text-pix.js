// familiada/logo-editor/js/text-pix.js
// Tryb: TEXT_PIX (TinyMCE inline -> "screen-screenshot" -> 150x70 bits)

export function initTextPixEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  let SYSTEM_FONTS = [];

  // DOM
  const paneTextPix = document.getElementById("paneTextPix");
  const rtEditorEl = document.getElementById("rtEditor");
  const pixWarn = document.getElementById("pixWarn");

  const selRtFont = document.getElementById("selRtFont");
  const fontPick = document.getElementById("fontPick");
  const fontPickBtn = document.getElementById("fontPickBtn");
  const fontPickText = document.getElementById("fontPickText");
  const fontPickPop = document.getElementById("fontPickPop");
  const fontPickSearchInp = document.getElementById("fontPickSearchInp");
  const fontPickSearchClear = document.getElementById("fontPickSearchClear");
  const fontPickList = document.getElementById("fontPickList");
  const fontPickEmpty = document.getElementById("fontPickEmpty");

  const inpRtSize = document.getElementById("inpRtSize");
  const inpRtLine = document.getElementById("inpRtLine");
  const inpRtLetter = document.getElementById("inpRtLetter");
  const inpRtPadTop = document.getElementById("inpRtPadTop");
  const inpRtPadBot = document.getElementById("inpRtPadBot");

  const btnRtBold = document.getElementById("btnRtBold");
  const btnRtItalic = document.getElementById("btnRtItalic");
  const btnRtUnderline = document.getElementById("btnRtUnderline");
  const btnRtAlignCycle = document.getElementById("btnRtAlignCycle");

  const chkInvert = document.getElementById("chkInvert");
  const inpThresh = document.getElementById("inpThresh");

  // Tooltipy
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);

  function tip2(action, win, mac, extra = "") {
    const line2 = `Win: ${win} • Mac: ${mac}`;
    return extra ? `${action}\n${line2}\n${extra}` : `${action}\n${line2}`;
  }
  function setTip(el, txt) { if (el) el.setAttribute("data-tip", txt); }

  setTip(btnRtBold,      tip2("Pogrubienie",   "Ctrl+B", "⌘B"));
  setTip(btnRtItalic,    tip2("Kursywa",       "Ctrl+I", "⌘I"));
  setTip(btnRtUnderline, tip2("Podkreślenie",  "Ctrl+U", "⌘U"));
  setTip(btnRtAlignCycle,
    tip2("Wyrównanie (cyklicznie)", "Ctrl+Shift+E", "⌘⇧E", "Klikaj: lewo → środek → prawo")
  );

  // Rozmiary
  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;
  const BIG_W = ctx.BIG_W || 208;
  const BIG_H = ctx.BIG_H || 88;

  const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const toPx = (v) => (v == null || v === "" ? "" : `${Number(v)}px`);

  let invert = false;

  function getTheme() {
    return invert ? { bg: "#fff", fg: "#000" } : { bg: "#000", fg: "#fff" };
  }

  function applyInvertTheme() {
    const { bg, fg } = getTheme();

    if (rtEditorEl) {
      rtEditorEl.style.backgroundColor = bg;
      rtEditorEl.style.color = fg;
    }

    const stage = paneTextPix?.querySelector?.(".rtStage");
    if (stage) stage.style.backgroundColor = bg;
  }

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // TinyMCE state
  let editor = null;
  let currentAlign = "center"; // left|center|right
  let cachedBits150 = new Uint8Array(DOT_W * DOT_H);

  let _deb = null;
  let _token = 0;

  // UI busy guard (żeby nie kradło fokusu)
  let uiBusy = 0;
  const uiLock = () => { uiBusy++; };
  const uiUnlock = () => { uiBusy = Math.max(0, uiBusy - 1); };
  const isUiBusy = () => uiBusy > 0;

  function installUiBusyGuards() {
    const controlsRoot = paneTextPix;
    if (!controlsRoot) return;

    controlsRoot.addEventListener("pointerdown", (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.closest?.("input,select,button,textarea,label")) uiLock();
    }, true);

    const unlock = () => uiUnlock();
    controlsRoot.addEventListener("pointerup", unlock, true);
    controlsRoot.addEventListener("pointercancel", unlock, true);
    controlsRoot.addEventListener("click", unlock, true);
    window.addEventListener("blur", unlock);
  }

  async function loadSystemFonts() {
    if (SYSTEM_FONTS.length) return SYSTEM_FONTS;

    try {
      const res = await fetch("./js/fonts.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Nie mogę wczytać fonts.json");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("fonts.json nie jest tablicą");
      SYSTEM_FONTS = data;
      return SYSTEM_FONTS;
    } catch (err) {
      console.error("Błąd ładowania fontów:", err);
      SYSTEM_FONTS = [];
      return SYSTEM_FONTS;
    }
  }

  async function fillFontSelectOnce() {
    if (!selRtFont) return;

    const fonts = await loadSystemFonts();
    if (!fonts.length) return;

    selRtFont.innerHTML = "";

    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "—";
    selRtFont.appendChild(optEmpty);

    for (const f of fonts) {
      if (!f || !f.label || !f.value) continue;

      const opt = document.createElement("option");
      opt.value = f.value;
      opt.textContent = f.label;
      opt.style.fontFamily = f.value;
      selRtFont.appendChild(opt);
    }

    rebuildFontPickFromSelect();
  }

  /* =========================================================
     FONT PICK (custom)
     - overlay fixed + pozycjonowanie pod buttonem
  ========================================================= */
  let fontPickOpen = false;
  let fontPickIndex = 0;

  let fontAll = [];
  let fontFiltered = [];

  function norm(s){
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function setFontPickLabelFromSelect() {
    if (!selRtFont || !fontPickText) return;
    const opt = selRtFont.selectedOptions?.[0];
    fontPickText.textContent = opt?.textContent?.trim() || "—";

    const ff = String(selRtFont.value || "").trim();
    fontPickText.style.fontFamily = ff ? ff : "";
  }

  function syncFontPickOnState() {
    const root = fontPickList || fontPickPop;
    if (!selRtFont || !root) return;
    const cur = String(selRtFont.value || "");
    for (const it of Array.from(root.querySelectorAll(".fontPickItem"))) {
      it.classList.toggle("on", String(it.dataset.value || "") === cur);
    }
  }

  function getFilterText(){
    return norm(fontPickSearchInp?.value || "");
  }

  function applyFontFilter(){
    const q = getFilterText();

    fontFiltered = !q
      ? fontAll.slice()
      : fontAll.filter(f => norm(f.label).includes(q) || norm(f.value).includes(q));

    if (fontPickList) fontPickList.innerHTML = "";

    // uwaga: w HTML masz fontPickEmpty jako display:none, a my sterujemy hidden:
    if (fontPickEmpty) {
      fontPickEmpty.style.display = fontFiltered.length ? "none" : "block";
    }

    if (!fontPickList) return;

    for (let i = 0; i < fontFiltered.length; i++){
      const f = fontFiltered[i];

      const item = document.createElement("div");
      item.className = "fontPickItem";
      item.dataset.value = f.value;
      item.dataset.index = String(i);

      const sample = document.createElement("div");
      sample.className = "sample";
      sample.textContent = f.label || "—";
      if (f.value) sample.style.fontFamily = f.value;

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = f.value ? "" : "auto";

      item.appendChild(sample);
      item.appendChild(meta);

      item.addEventListener("pointerdown", () => { uiLock(); }, true);
      item.addEventListener("pointerup",   () => { uiUnlock(); }, true);

      item.addEventListener("click", () => {
        selRtFont.value = f.value;
        selRtFont.dispatchEvent(new Event("change", { bubbles: true }));
        setFontPickLabelFromSelect();
        syncFontPickOnState();
        closeFontPick();
      });

      fontPickList.appendChild(item);
    }

    fontPickIndex = 0;
    syncFontPickOnState();
    const on = fontPickList.querySelector?.(".fontPickItem.on");
    on?.scrollIntoView?.({ block:"nearest" });
  }

  function rebuildFontPickFromSelect() {
    if (!selRtFont) return;
    const opts = Array.from(selRtFont.options || []);
    fontAll = opts.map(o => ({
      value: String(o.value || ""),
      label: String(o.textContent || "").trim(),
    }));

    applyFontFilter();
    setFontPickLabelFromSelect();
  }

  function placeFontPickPopover() {
    if (!fontPickPop || !fontPickBtn) return;

    const r = fontPickBtn.getBoundingClientRect();
    const gap = 10;

    // default: pod buttonem, wyrównanie do lewej
    let top = r.bottom + gap;
    let left = r.left;

    // clamp do viewportu
    const popW = Math.min(720, Math.floor(window.innerWidth * 0.92));
    const maxLeft = window.innerWidth - popW - 10;
    left = Math.max(10, Math.min(left, maxLeft));

    // jeśli nie mieści się w dół, otwórz do góry
    const approxH = 420;
    if (top + approxH > window.innerHeight - 10) {
      top = Math.max(10, r.top - gap - approxH);
    }

    fontPickPop.style.top = `${Math.round(top)}px`;
    fontPickPop.style.left = `${Math.round(left)}px`;
  }

  function closeFontPick() {
    if (!fontPickPop || !fontPickBtn) return;
    fontPickOpen = false;
    fontPickPop.hidden = true;
    fontPickBtn.setAttribute("aria-expanded", "false");
  }

  function openFontPick() {
    if (!fontPickPop || !fontPickBtn) return;
    fontPickOpen = true;

    fontPickPop.hidden = false;
    fontPickBtn.setAttribute("aria-expanded", "true");

    placeFontPickPopover();

    // focus na search
    setTimeout(() => fontPickSearchInp?.focus?.(), 0);

    const root = fontPickList || fontPickPop;
    const items = Array.from(root.querySelectorAll(".fontPickItem"));
    const cur = items.findIndex(it => it.classList.contains("on"));
    fontPickIndex = cur >= 0 ? cur : 0;
    focusFontPickIndex();
  }

  function toggleFontPick() {
    if (fontPickOpen) closeFontPick();
    else openFontPick();
  }

  function focusFontPickIndex() {
    const root = fontPickList || fontPickPop;
    if (!root) return;
    const items = Array.from(root.querySelectorAll(".fontPickItem"));
    if (!items.length) return;

    fontPickIndex = Math.max(0, Math.min(items.length - 1, fontPickIndex));
    items[fontPickIndex].scrollIntoView({ block: "nearest" });
  }

  // ==========================================
  //  TinyMCE helpers
  // ==========================================
  function isCollapsed() {
    try { return !!editor?.selection?.getRng?.()?.collapsed; } catch { return false; }
  }

  function applyPendingInlineStyle(styleObj) {
    if (!editor) return false;
    const rng = editor.selection.getRng();
    if (!rng || !rng.collapsed) return false;

    const span = editor.getDoc().createElement("span");
    for (const [k,v] of Object.entries(styleObj)) span.style[k] = v;
    span.appendChild(editor.getDoc().createTextNode("\u200b"));

    rng.insertNode(span);

    const nr = editor.getDoc().createRange();
    nr.setStart(span.firstChild, 1);
    nr.setEnd(span.firstChild, 1);
    editor.selection.setRng(nr);
    return true;
  }

  function getSelectionRangeSafe() {
    try { return editor?.selection?.getRng?.() || null; } catch { return null; }
  }

  function elementStyle(el) {
    try { return window.getComputedStyle(el); } catch { return null; }
  }

  function getActiveElement() {
    if (!editor) return rtEditorEl;
    try {
      return editor.selection.getNode() || rtEditorEl;
    } catch {
      return rtEditorEl;
    }
  }

  function readMixedStyle(propCssName) {
    const rng = getSelectionRangeSafe();
    if (!rng) return { mixed: false, value: "" };

    if (rng.collapsed) {
      const node = getActiveElement();
      const cs = elementStyle(node.nodeType === 1 ? node : node.parentElement);
      const v = cs ? cs.getPropertyValue(propCssName) : "";
      return { mixed: false, value: (v || "").trim() };
    }

    const root = rng.commonAncestorContainer?.nodeType === 1
      ? rng.commonAncestorContainer
      : rng.commonAncestorContainer?.parentElement;

    if (!root) return { mixed: true, value: "" };

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const values = new Set();
    let count = 0;

    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.nodeValue || !t.nodeValue.trim()) continue;

      const tr = document.createRange();
      tr.selectNodeContents(t);
      const intersects =
        rng.compareBoundaryPoints(Range.END_TO_START, tr) < 0 &&
        rng.compareBoundaryPoints(Range.START_TO_END, tr) > 0;

      if (!intersects) continue;

      const host = t.parentElement;
      const cs = elementStyle(host);
      const v = cs ? (cs.getPropertyValue(propCssName) || "").trim() : "";
      values.add(v || "");

      count++;
      if (count > 80) break;
      if (values.size > 1) return { mixed: true, value: "" };
    }

    const only = values.values().next().value ?? "";
    return { mixed: false, value: String(only || "").trim() };
  }

  function getCurrentParagraph() {
    const node = getActiveElement();
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el?.closest?.("p") || null;
  }

  function readMixedParagraphStyle(propCssName) {
    const rng = getSelectionRangeSafe();
    if (!rng) return { mixed: false, value: "" };

    if (!rng.collapsed) {
      const p1 = (rng.startContainer.nodeType === 1 ? rng.startContainer : rng.startContainer.parentElement)?.closest?.("p");
      const p2 = (rng.endContainer.nodeType === 1 ? rng.endContainer : rng.endContainer.parentElement)?.closest?.("p");
      if (p1 && p2 && p1 !== p2) return { mixed: true, value: "" };
    }

    const p = getCurrentParagraph();
    if (!p) return { mixed: false, value: "" };
    const cs = elementStyle(p);
    const v = cs ? (cs.getPropertyValue(propCssName) || "").trim() : "";
    return { mixed: false, value: v };
  }

  function normalizeFontValueForSelect(fontFamilyCss) {
    if (!selRtFont) return "";
    const ff = String(fontFamilyCss || "").toLowerCase();

    for (const opt of Array.from(selRtFont.options || [])) {
      const raw = String(opt.value || "").toLowerCase();
      if (!raw) continue;
      const head = raw.split(",")[0].trim().replace(/["']/g, "");
      if (head && ff.includes(head)) return opt.value;
    }
    return "";
  }

  function pxToNumberMaybe(px) {
    const s = String(px || "").trim();
    if (!s) return "";
    const m = s.match(/^([0-9]+(?:\.[0-9]+)?)px$/);
    if (!m) return "";
    return m[1];
  }

  function syncUiFromSelection() {
    if (!editor) return;
    if (isUiBusy()) return;

    try {
      setBtnOn(btnRtBold, !!editor.queryCommandState("Bold"));
      setBtnOn(btnRtItalic, !!editor.queryCommandState("Italic"));
      setBtnOn(btnRtUnderline, !!editor.queryCommandState("Underline"));
    } catch {}

    {
      const ff = readMixedStyle("font-family");
      if (selRtFont) selRtFont.value = ff.mixed ? "" : (normalizeFontValueForSelect(ff.value) || "");
      setFontPickLabelFromSelect();
      syncFontPickOnState();
    }

    {
      const fs = readMixedStyle("font-size");
      if (inpRtSize) inpRtSize.value = fs.mixed ? "" : (pxToNumberMaybe(fs.value) || "");
    }

    {
      const ls = readMixedStyle("letter-spacing");
      const v = (ls.value === "normal") ? "0px" : ls.value;
      if (inpRtLetter) inpRtLetter.value = ls.mixed ? "" : (pxToNumberMaybe(v) || "");
    }

    {
      const lh = readMixedParagraphStyle("line-height");
      if (!inpRtLine) {}
      else if (lh.mixed) inpRtLine.value = "";
      else {
        const raw = String(lh.value || "").trim();
        if (!raw || raw === "normal") {
          inpRtLine.value = "1";
        } else if (/px$/.test(raw)) {
          const p = getCurrentParagraph();
          const cs = p ? elementStyle(p) : null;
          const fs = cs ? String(cs.getPropertyValue("font-size") || "").trim() : "";
          const lhPx = Number(raw.replace("px",""));
          const fsPx = Number(String(fs).replace("px",""));
          if (Number.isFinite(lhPx) && Number.isFinite(fsPx) && fsPx > 0) {
            inpRtLine.value = String(Math.round((lhPx / fsPx) * 100) / 100);
          } else inpRtLine.value = "";
        } else {
          const num = Number(raw);
          inpRtLine.value = Number.isFinite(num) ? String(num) : "";
        }
      }
    }

    {
      const mt = readMixedParagraphStyle("margin-top");
      if (inpRtPadTop) inpRtPadTop.value = mt.mixed ? "" : (pxToNumberMaybe(mt.value) || "");
    }

    {
      const mb = readMixedParagraphStyle("margin-bottom");
      if (inpRtPadBot) inpRtPadBot.value = mb.mixed ? "" : (pxToNumberMaybe(mb.value) || "");
    }

    {
      const ta = readMixedParagraphStyle("text-align");
      const v = (ta.mixed ? "" : ta.value);
      const a = (v === "left" || v === "right" || v === "center") ? v : "center";
      currentAlign = a;
      if (btnRtAlignCycle) {
        btnRtAlignCycle.textContent = a === "left" ? "⇤" : a === "right" ? "⇥" : "⇆";
        btnRtAlignCycle.dataset.state = a;
      }
    }
  }

  function schedulePreview(ms = 120) {
    clearTimeout(_deb);
    _deb = setTimeout(() => updatePreviewAsync(), ms);
  }

  function cmdToggle(name) {
    if (!editor) return;
    if (!isUiBusy()) editor.focus();
    editor.execCommand(name);
    ctx.markDirty?.();
    schedulePreview(80);
    syncUiFromSelection();
  }

  function applyFont(fontValue) {
    if (!editor) return;
    const v = String(fontValue || "").trim();

    // pusty = "mixed/auto" -> nic nie rób
    if (!v) return;

    if (isCollapsed()) {
      applyPendingInlineStyle({ fontFamily: v });
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
      return;
    }

    if (!isUiBusy()) editor.focus();

    editor.formatter.register("fontfamily_stack", {
      inline: "span",
      styles: { "font-family": v },
      remove_similar: true,
    });
    editor.formatter.apply("fontfamily_stack");

    ctx.markDirty?.();
    schedulePreview(120);
    syncUiFromSelection();
  }

  function applyFontSize(px) {
    if (!editor) return;
    const n = Number(px);
    if (!Number.isFinite(n)) return;
    const v = `${clamp(n, 10, 250)}px`;

    if (isCollapsed()) {
      applyPendingInlineStyle({ fontSize: v });
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
      return;
    }

    if (!isUiBusy()) editor.focus();

    editor.formatter.register("fontsize_px", {
      inline: "span",
      styles: { "font-size": v },
      remove_similar: true,
    });
    editor.formatter.apply("fontsize_px");

    ctx.markDirty?.();
    schedulePreview(120);
    syncUiFromSelection();
  }

  function applyLetterSpacing(px) {
    if (!editor) return;

    const n = Number(px);
    if (!Number.isFinite(n)) return;
    const v = `${clamp(n, 0, 20)}px`;

    if (isCollapsed()) {
      applyPendingInlineStyle({ letterSpacing: v });
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
      return;
    }

    if (!isUiBusy()) editor.focus();

    editor.formatter.register("letterspacing_px", {
      inline: "span",
      styles: { "letter-spacing": v },
      remove_similar: true,
    });
    editor.formatter.apply("letterspacing_px");

    ctx.markDirty?.();
    schedulePreview(120);
    syncUiFromSelection();
  }

  function applyParagraphStyles({ lineHeight, marginTop, marginBottom, align }) {
    const p = getCurrentParagraph();
    if (!p) return;

    if (lineHeight != null && lineHeight !== "") p.style.lineHeight = String(lineHeight);
    if (marginTop != null && marginTop !== "") p.style.marginTop = toPx(marginTop);
    if (marginBottom != null && marginBottom !== "") p.style.marginBottom = toPx(marginBottom);
    if (align) p.style.textAlign = align;

    ctx.markDirty?.();
    schedulePreview(140);
    syncUiFromSelection();
  }

  /* =========================================================
     Screenshot -> bits (Twoja logika bez zmian)
  ========================================================= */
  function canvasToBits208(canvas, threshold) {
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height);

    const w = BIG_W, h = BIG_H;
    const out = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i + 0], gg = data[i + 1], b = data[i + 2];
      const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      out[y * w + x] = L >= threshold ? 1 : 0;
    }
    return out;
  }

  function compress208x88to150x70(bits208) {
    const out = new Uint8Array(DOT_W * DOT_H);
    let oy = 0;
    for (let y = 0; y < BIG_H; y++) {
      const my = y % 9;
      if (my === 7 || my === 8) continue;

      let ox = 0;
      for (let x = 0; x < BIG_W; x++) {
        const mx = x % 7;
        if (mx === 5 || mx === 6) continue;

        out[oy * DOT_W + ox] = bits208[y * BIG_W + x] ? 1 : 0;
        ox++;
      }
      oy++;
    }
    return out;
  }

  function bitsBoundingBox(bits, w, h) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!bits[y*w+x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (maxX < 0) return null;
    return { minX, minY, maxX, maxY };
  }

  function looksClipped(box, w, h, pad = 0) {
    if (!box) return false;
    return box.minX <= pad || box.minY <= pad || box.maxX >= (w - 1 - pad) || box.maxY >= (h - 1 - pad);
  }

  let _shotHost = null;

  function ensureShotHost() {
    if (_shotHost) return _shotHost;
    _shotHost = document.createElement("div");
    _shotHost.style.position = "fixed";
    _shotHost.style.left = "-99999px";
    _shotHost.style.top = "0";
    _shotHost.style.width = "1px";
    _shotHost.style.height = "1px";
    _shotHost.style.overflow = "hidden";
    _shotHost.style.pointerEvents = "none";
    _shotHost.style.opacity = "0";
    document.body.appendChild(_shotHost);
    return _shotHost;
  }

  function buildSnapshotNode(w, h) {
    const host = ensureShotHost();
    host.innerHTML = "";

    const box = document.createElement("div");
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    const { bg, fg } = getTheme();
    box.style.background = bg;
    box.style.color = fg;
    box.style.overflow = "hidden";
    box.style.boxSizing = "border-box";

    const edCs = window.getComputedStyle(rtEditorEl);
    box.style.paddingTop = edCs.paddingTop;
    box.style.paddingRight = edCs.paddingRight;
    box.style.paddingBottom = edCs.paddingBottom;
    box.style.paddingLeft = edCs.paddingLeft;

    box.style.whiteSpace = "normal";
    box.style.overflowWrap = "anywhere";
    box.style.wordBreak = "break-word";
    box.style.maxWidth = `${w}px`;

    box.style.fontFamily = edCs.fontFamily;
    box.style.fontSize = edCs.fontSize;
    box.style.fontWeight = edCs.fontWeight;
    box.style.fontStyle = edCs.fontStyle;
    box.style.letterSpacing = edCs.letterSpacing;
    box.style.lineHeight = edCs.lineHeight;
    box.style.textAlign = edCs.textAlign;

    let html = String(editor?.getContent?.({ format: "html" }) || "").trim();
    if (html && !/<(p|div|h1|h2|h3|ul|ol|li|table|blockquote)\b/i.test(html)) {
      html = `<p>${html}</p>`;
    }
    box.innerHTML = html || "";

    const style = document.createElement("style");
    style.textContent = `
      *{ box-sizing:border-box; }
      p{ margin:0; }
      body{ margin:0; }
      span{ white-space:inherit; }
    `;
    box.prepend(style);

    host.appendChild(box);
    return box;
  }

  async function captureTopTo208x88Canvas() {
    if (!window.html2canvas) throw new Error("Brak html2canvas (script nie wczytany).");

    const w = Math.max(1, Math.floor(rtEditorEl.clientWidth));
    const h = Math.max(1, Math.floor(w * (BIG_H / BIG_W)));

    const node = buildSnapshotNode(w, h);

    const shot = await window.html2canvas(node, {
      backgroundColor: getTheme().bg,
      scale: 1,
      width: w,
      height: h,
      scrollX: 0,
      scrollY: 0,
      useCORS: true
    });

    const out = document.createElement("canvas");
    out.width = BIG_W;
    out.height = BIG_H;

    const g = out.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.fillStyle = getTheme().bg;
    g.fillRect(0, 0, BIG_W, BIG_H);
    g.drawImage(shot, 0, 0, BIG_W, BIG_H);

    return out;
  }

  function makeInkBits(bits150) {
    if (!invert) return bits150;
    const out = new Uint8Array(bits150.length);
    for (let i = 0; i < bits150.length; i++) out[i] = bits150[i] ? 0 : 1;
    return out;
  }

  async function compileToBits150() {
    const plain = String(editor?.getContent?.({ format: "text" }) || "").replace(/\u00a0/g, " ").trim();
    if (!plain) return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false };

    const threshold = clamp(Number(inpThresh?.value || 128), 40, 220);
    const c208 = await captureTopTo208x88Canvas();
    const bits208 = canvasToBits208(c208, threshold);

    const bits150 = compress208x88to150x70(bits208);

    const ink = makeInkBits(bits150);
    const box = bitsBoundingBox(ink, DOT_W, DOT_H);
    const clipped = looksClipped(box, DOT_W, DOT_H, 0);

    return { bits150, clipped };
  }

  async function updatePreviewAsync() {
    const t = ++_token;
    try {
      const res = await compileToBits150();
      if (t !== _token) return;

      cachedBits150 = res.bits150;
      ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });

      if (pixWarn) {
        if (res.clipped) {
          pixWarn.textContent = "Wygląda na ucięte — zmniejsz rozmiar albo skróć tekst.";
          show(pixWarn, true);
        } else {
          show(pixWarn, false);
        }
      }
    } catch (e) {
      if (t !== _token) return;

      cachedBits150 = new Uint8Array(DOT_W * DOT_H);
      ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });

      if (pixWarn) {
        pixWarn.textContent = "Nie mogę zrobić screena edytora (sprawdź TinyMCE/html2canvas w HTML).";
        show(pixWarn, true);
      }
      console.error(e);
    }
  }

  /* =========================================================
     TinyMCE init
  ========================================================= */
  async function ensureEditor() {
    if (editor) return editor;
    if (!window.tinymce) throw new Error("Brak TinyMCE (script nie wczytany).");

    await fillFontSelectOnce();

    const fontFormatsStr = (SYSTEM_FONTS || [])
      .filter(f => f && f.label && f.value)
      .map(f => `${String(f.label).trim()}=${String(f.value).trim()}`)
      .join(";");

    await window.tinymce.init({
      target: rtEditorEl,
      inline: true,
      menubar: false,
      toolbar: false,
      statusbar: false,
      plugins: [],
      forced_root_block: "p",
      forced_root_block_attrs: {},

      skin: false,
      content_css: false,

      content_style: `
        #rtEditor.mce-content-body{
          margin:0;
          padding:0;
          background:transparent;
          color:inherit;
          font-size:130px;
          line-height:1;
          white-space:normal;
          overflow-wrap:anywhere;
          word-break:break-word;
        }
        #rtEditor.mce-content-body p{
          margin:0;
          line-height:1;
        }
      `,

      font_family_formats: fontFormatsStr,

      setup: (ed) => {
        editor = ed;

        ed.on("init", () => {
          show(pixWarn, false);
          cachedBits150 = new Uint8Array(DOT_W * DOT_H);
          ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });
          syncUiFromSelection();
          schedulePreview(60);
        });

        ed.on("NodeChange SelectionChange KeyUp MouseUp", () => {
          if (isUiBusy()) return;
          syncUiFromSelection();
        });

        ed.on("input Undo Redo SetContent", () => {
          ctx.markDirty?.();
          schedulePreview(120);
        });
      }
    });

    return editor;
  }

  /* =========================================================
     Bind UI
  ========================================================= */
  function bindUiOnce() {
    btnRtBold?.addEventListener("click", () => cmdToggle("Bold"));
    btnRtItalic?.addEventListener("click", () => cmdToggle("Italic"));
    btnRtUnderline?.addEventListener("click", () => cmdToggle("Underline"));

    btnRtAlignCycle?.addEventListener("click", () => {
      if (!editor) return;
      currentAlign = currentAlign === "left" ? "center" : currentAlign === "center" ? "right" : "left";
      applyParagraphStyles({ align: currentAlign });
    });

    selRtFont?.addEventListener("change", () => applyFont(selRtFont.value));

    fontPickBtn?.addEventListener("click", () => toggleFontPick());

    window.addEventListener("resize", () => {
      if (fontPickOpen) placeFontPickPopover();
    });

    fontPickSearchInp?.addEventListener("input", () => applyFontFilter());

    fontPickSearchClear?.addEventListener("click", () => {
      if (fontPickSearchInp) fontPickSearchInp.value = "";
      applyFontFilter();
      fontPickSearchInp?.focus?.();
    });

    document.addEventListener("pointerdown", (e) => {
      if (!fontPickOpen) return;
      const t = e.target;
      if (t && (t === fontPickBtn || t.closest?.("#fontPickPop") || t.closest?.("#fontPick"))) return;
      closeFontPick();
    });

    document.addEventListener("keydown", (e) => {
      const inSearch = document.activeElement === fontPickSearchInp;

      if (inSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) return;
      if (!fontPickOpen) return;

      const isChar =
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey;

      if (isChar && document.activeElement !== fontPickSearchInp) {
        e.preventDefault();
        fontPickSearchInp?.focus?.();
        const start = fontPickSearchInp.selectionStart ?? fontPickSearchInp.value.length;
        const end   = fontPickSearchInp.selectionEnd   ?? fontPickSearchInp.value.length;
        const v = fontPickSearchInp.value;
        fontPickSearchInp.value = v.slice(0, start) + e.key + v.slice(end);
        fontPickSearchInp.setSelectionRange(start + 1, start + 1);
        applyFontFilter();
        return;
      }

      if (e.key === "Escape") { e.preventDefault(); closeFontPick(); return; }

      const items = Array.from(fontPickPop?.querySelectorAll?.(".fontPickItem") || []);
      if (!items.length) return;

      if (e.key === "ArrowDown") { e.preventDefault(); fontPickIndex++; focusFontPickIndex(); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); fontPickIndex--; focusFontPickIndex(); return; }

      if (e.key === "Enter") {
        e.preventDefault();
        fontPickIndex = Math.max(0, Math.min(items.length - 1, fontPickIndex));
        items[fontPickIndex].click();
      }
    });

    inpRtSize?.addEventListener("input", () => {
      const v = inpRtSize.value;
      if (v === "") return;
      applyFontSize(v);
    });

    inpRtLetter?.addEventListener("input", () => {
      const v = inpRtLetter.value;
      if (v === "") return;
      applyLetterSpacing(v);
    });

    inpRtLine?.addEventListener("input", () => {
      const v = inpRtLine.value;
      if (v === "") return;
      applyParagraphStyles({ lineHeight: clamp(Number(v), 0.6, 3.0) });
    });

    inpRtPadTop?.addEventListener("input", () => {
      const v = inpRtPadTop.value;
      if (v === "") return;
      applyParagraphStyles({ marginTop: clamp(Number(v), 0, 80) });
    });

    inpRtPadBot?.addEventListener("input", () => {
      const v = inpRtPadBot.value;
      if (v === "") return;
      applyParagraphStyles({ marginBottom: clamp(Number(v), 0, 80) });
    });

    chkInvert?.addEventListener("change", () => {
      invert = !!chkInvert.checked;
      applyInvertTheme();
      ctx.markDirty?.();
      schedulePreview(80);
    });

    inpThresh?.addEventListener("input", () => {
      ctx.markDirty?.();
      schedulePreview(80);
    });
  }

  let _uiBound = false;

  /* =========================================================
     API
  ========================================================= */
  return {
    async open() {
      show(paneTextPix, true);
      if (chkInvert) chkInvert.checked = invert;
      applyInvertTheme();

      if (!_uiBound) { bindUiOnce(); _uiBound = true; }
      await fillFontSelectOnce();

      rtEditorEl.style.fontSize = "130px";
      rtEditorEl.style.lineHeight = "1";

      await ensureEditor();

      setTimeout(() => schedulePreview(0), 0);

      installUiBusyGuards();

      editor.setContent("");
      editor.setContent("<p>\u200b</p>");
      editor.focus();
      applyPendingInlineStyle({ fontSize: "130px" });

      currentAlign = "center";
      if (btnRtAlignCycle) {
        btnRtAlignCycle.textContent = "⇆";
        btnRtAlignCycle.dataset.state = "center";
      }

      if (selRtFont) selRtFont.value = "";
      if (inpRtSize) inpRtSize.value = "";
      if (inpRtLetter) inpRtLetter.value = "";
      if (inpRtLine) inpRtLine.value = "1";
      if (inpRtPadTop) inpRtPadTop.value = String(inpRtPadTop.value || "8");
      if (inpRtPadBot) inpRtPadBot.value = String(inpRtPadBot.value || "8");

      setBtnOn(btnRtBold, false);
      setBtnOn(btnRtItalic, false);
      setBtnOn(btnRtUnderline, false);

      ctx.clearDirty?.();
      show(pixWarn, false);

      cachedBits150 = new Uint8Array(DOT_W * DOT_H);
      ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });
      schedulePreview(80);
    },

    close() {
      show(paneTextPix, false);
      closeFontPick();
    },

    async getCreatePayload() {
      await updatePreviewAsync();
      return {
        ok: true,
        type: TYPE_PIX,
        payload: {
          w: DOT_W,
          h: DOT_H,
          format: "BITPACK_MSB_FIRST_ROW_MAJOR",
          bits_b64: ctx.packBitsRowMajorMSB(cachedBits150, DOT_W, DOT_H)
        }
      };
    }
  };
}
