import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = path.join(repo, "web");
const output = path.join(repo, "tests/recordings/host-buzzer-preview");
const logoOptionsOutput = path.join(output, "host-logo-smoothing-options");
const demoMigration = await fs.readFile(path.join(repo, "supabase/migrations/2026-07-14_218_fix_demo_image_correct_bits.sql"), "utf8");
const demoLogoMatch = demoMigration.match(/v_payload jsonb := \$p\$(.*?)\$p\$::jsonb;/s);
if (!demoLogoMatch) throw new Error("Nie znaleziono poprawionego payloadu demo logo w migracji 218");
const demoLogoPayload = JSON.parse(demoLogoMatch[1]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json"],
  [".svg", "image/svg+xml"], [".woff2", "font/woff2"], [".png", "image/png"],
]);

const server = http.createServer(async (request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath;
  const file = path.resolve(webRoot, `.${relativePath}`);
  if (!file.startsWith(`${webRoot}${path.sep}`)) { response.writeHead(403).end(); return; }
  try {
    const body = await fs.readFile(file);
    response.writeHead(200, { "content-type": contentTypes.get(path.extname(file)) || "application/octet-stream" });
    response.end(body);
  } catch { response.writeHead(404).end("Not found"); }
});

await fs.mkdir(output, { recursive: true });
await fs.mkdir(logoOptionsOutput, { recursive: true });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

async function openPage(route, viewport, name) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", error => console.error(`[${name}] ${error.message}`));
  await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor();
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  return { context, page };
}

async function setSafeInsets(page, values) {
  await page.evaluate((insets) => {
    for (const [edge, value] of Object.entries(insets)) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`);
    window.dispatchEvent(new Event("resize"));
  }, values);
  await page.waitForTimeout(60);
}

async function addRows(page, id, lines) {
  await page.locator(`#${id}`).evaluate((el, content) => {
    el.replaceChildren(...content.map(({ text, color }) => {
    const row = document.createElement("div");
    row.className = "hostTextLine";
      const cell = document.createElement("span");
      cell.className = "hostTextCellContent";
      if (color) { const span = document.createElement("span"); span.className = color; span.textContent = text; cell.append(span); }
      else cell.textContent = text;
      row.append(cell);
      return row;
    }));
  }, lines);
  await page.evaluate(() => document.fonts.ready);
}

async function assertFullscreenClear(page, textId, name) {
  const layout = await page.evaluate((id) => {
    const text = document.getElementById(id).getBoundingClientRect();
    const button = document.getElementById("btnFS").getBoundingClientRect();
    return { text: { top: text.top, right: text.right, bottom: text.bottom, left: text.left }, button: { top: button.top, right: button.right, bottom: button.bottom, left: button.left } };
  }, textId);
  const overlaps = layout.text.left < layout.button.right && layout.text.right > layout.button.left
    && layout.text.top < layout.button.bottom && layout.text.bottom > layout.button.top;
  if (overlaps) throw new Error(`${name}: treść ${textId} nachodzi na przycisk pełnego ekranu`);
}

async function assertTextRowsFollowGrid(page, textId, name) {
  const result = await page.evaluate((id) => {
    const container = document.getElementById(id);
    const rows = [...container.querySelectorAll(":scope > .hostTextLine")];
    return {
      line: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--line")),
      firstGap: rows[1]?.getBoundingClientRect().top - rows[0]?.getBoundingClientRect().top,
    };
  }, textId);
  if (Math.abs(result.firstGap - result.line) > 0.75) {
    throw new Error(`${name}: odstęp tekstu ${result.firstGap.toFixed(2)}px nie zgadza się z linią ${result.line.toFixed(2)}px`);
  }
}

async function applyModernTheme(page) {
  await page.evaluate(async () => {
    const { createHostThemeApplier } = await import("/control/host/js/hostThemeManager.js?v=v2026-10-08T19512");
    const applier = await createHostThemeApplier();
    await applier.apply({ detail: { display: { theme: "modern", colors: { A: "#b52b5d", B: "#285fae", DOT: "#f0dc35" } } } });
    window.__hostThemeApplier = applier;
  });
  const applied = await page.evaluate(() => ({
    theme: document.documentElement.dataset.hostTheme,
    background: getComputedStyle(document.querySelector(".paper")).backgroundColor,
    coverA: getComputedStyle(document.documentElement).getPropertyValue("--cover-grad-a").trim(),
  }));
  if (applied.theme !== "modern" || applied.background !== "rgb(10, 10, 12)" || applied.coverA !== "#b52b5d") {
    throw new Error(`Host nie zastosował motywu/kolorów: ${JSON.stringify(applied)}`);
  }
  await page.evaluate(async () => {
    await window.__hostThemeApplier.apply({ detail: { display: { theme: "modern", colors: { A: "#1255aa", B: "#cc4422" } } } });
  });
  const changedColor = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--cover-grad-a").trim());
  if (changedColor !== "#1255aa") throw new Error(`Kolor Hosta nie odświeżył się w tym samym motywie: ${changedColor}`);
  await page.evaluate(async () => {
    await window.__hostThemeApplier.apply({ detail: { display: { theme: "classic", colors: { A: "#c4002f", B: "#2a62ff" } } } });
  });
  const classicBackground = await page.evaluate(() => getComputedStyle(document.querySelector(".paper")).backgroundColor);
  if (classicBackground !== "rgb(255, 253, 245)") throw new Error(`Host nie przełączył się na motyw Classic: ${classicBackground}`);
  await page.evaluate(async () => {
    await window.__hostThemeApplier.apply({ detail: { display: { theme: "modern", colors: { A: "#b52b5d", B: "#285fae" } } } });
  });
}

async function setHostLogoCase(page, mode, demoPayload = null, smooth = true) {
  await page.evaluate(async ({ caseName, pixelPayload, smoothEdges }) => {
    const logoEl = document.getElementById("cover2Logo");
    const caption = document.getElementById("cover2Swipe");
    const dot = caseName === "default" ? "#d7ff3d" : "#169bff";
    caption.textContent = "Kolor DOT: " + dot;
    caption.style.color = dot;
    if (caseName !== "custom-pixel") {
      const source = await (await fetch("/assets/img/logo.svg")).text();
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
      const svg = document.importNode(parsed.documentElement, true);
      svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%");
      const paths = [...svg.querySelectorAll("path")];
      const bright = paths.find(path => path.getAttribute("aria-label") === "FAMILIADA");
      const dim = paths.find(path => path !== bright);
      const rgb = [1, 3, 5].map(index => parseInt(dot.slice(index, index + 2), 16) / 255);
      const max = Math.max(...rgb), min = Math.min(...rgb), lightness = (max + min) / 2;
      const delta = max - min;
      const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
      let hue = 0;
      if (delta) {
        if (max === rgb[0]) hue = ((rgb[1] - rgb[2]) / delta) % 6;
        else if (max === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2;
        else hue = (rgb[0] - rgb[1]) / delta + 4;
        hue = (hue * 60 + 360) % 360;
      }
      const colorAt = offset => {
        const l = Math.max(0.04, Math.min(0.96, lightness + offset / 100));
        const c = (1 - Math.abs(2 * l - 1)) * saturation;
        const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
        const m = l - c / 2;
        const values = hue < 60 ? [c,x,0] : hue < 120 ? [x,c,0] : hue < 180 ? [0,c,x] : hue < 240 ? [0,x,c] : hue < 300 ? [x,0,c] : [c,0,x];
        return `#${values.map(v => Math.round((v + m) * 255).toString(16).padStart(2,"0")).join("")}`;
      };
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.id = "previewDotGradient"; grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "1"); grad.setAttribute("y2", "0");
      [["0%", colorAt(22)], ["50%", dot], ["100%", colorAt(-22)]].forEach(([offset, color]) => {
        const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop.setAttribute("offset", offset); stop.setAttribute("stop-color", color); grad.append(stop);
      });
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs"); defs.append(grad); svg.prepend(defs);
      const brightColor = bright.getAttribute("fill");
      const dimColor = dim.getAttribute("fill");
      const ratios = [0, 1, 2].map(index => parseInt(dimColor.slice(1 + index * 2, 3 + index * 2), 16) / parseInt(brightColor.slice(1 + index * 2, 3 + index * 2), 16)).filter(Number.isFinite);
      const factor = ratios.reduce((sum, n) => sum + n, 0) / ratios.length;
      const dimDot = `#${rgb.map(value => Math.round(value * 255 * factor).toString(16).padStart(2,"0")).join("")}`;
      dim.setAttribute("fill", dimDot);
      bright.setAttribute("fill", "url(#previewDotGradient)");
      logoEl.replaceChildren(svg);
      return;
    }

    // Exact corrected demo IMAGE logo payload from migration 218. The SQL
    // migration remains the source of truth for the visual fixture.
    const packed = Uint8Array.from(atob(pixelPayload.bits_b64), char => char.charCodeAt(0));
    const bits = new Uint8Array(150 * 70);
    const bytesPerRow = Math.ceil(150 / 8);
    for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) {
      bits[y * 150 + x] = (packed[y * bytesPerRow + (x >> 3)] >> (7 - (x & 7))) & 1;
    }
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = logoEl.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    let minX = 150, minY = 70, maxX = -1, maxY = -1;
    for (let y = 0; y < 70; y++) for (let x = 0; x < 150; x++) {
      if (bits[y * 150 + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    const mask = document.createElement("canvas"); mask.width = maxX - minX + 1; mask.height = maxY - minY + 1;
    const mctx = mask.getContext("2d"); mctx.fillStyle = dot;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (bits[y * 150 + x]) mctx.fillRect(x - minX, y - minY, 1, 1);
    const ctx = canvas.getContext("2d");
    const scale = Math.min(canvas.width / mask.width, canvas.height / mask.height);
    const width = mask.width * scale, height = mask.height * scale;
    const ox = (canvas.width - width) / 2, oy = (canvas.height - height) / 2;
    if (smoothEdges === "vector-aa") {
      ctx.fillStyle = dot; ctx.beginPath();
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        if (bits[y * 150 + x]) ctx.rect(ox + (x - minX) * scale, oy + (y - minY) * scale, scale, scale);
      }
      ctx.fill();
    } else {
      ctx.imageSmoothingEnabled = smoothEdges !== "crisp";
      if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = "high";
      const blur = /^blur-(.+)$/.exec(smoothEdges);
      if (blur) ctx.filter = `blur(${blur[1]}px)`;
      ctx.drawImage(mask, ox, oy, width, height);
      ctx.filter = "none";
    }
    canvas.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
    logoEl.replaceChildren(canvas);
  }, { caseName: mode, pixelPayload: demoPayload, smoothEdges: smooth });
  await page.waitForTimeout(40);
}

try {
  {
    const { context, page } = await openPage("/control/host/", { width: 393, height: 852 }, "host-classic-portrait");
    await setSafeInsets(page, { top: 44, right: 0, bottom: 34, left: 0 });
    await addRows(page, "paperText1", [
      { text: "RUNDA 2 — ROZGRYWKA" },
      { text: "Podaj coś, co zabiera się na wakacje" },
      { text: "Odpowiedź drużyny A" },
    ]);
    await addRows(page, "paperText2", [
      { text: "ODPOWIEDZI" },
      { text: "1) Paszport (34)", color: "hostGreen" },
      { text: "2) Ubrania (22)" },
      { text: "3) Kostium kąpielowy (18)" },
      { text: "4) Telefon i ładowarka (14)" },
      { text: "5) Krem z filtrem (12)" },
    ]);
    await assertFullscreenClear(page, "paperText1", "Host Classic pionowo");
    await assertTextRowsFollowGrid(page, "paperText1", "Host Classic pionowo");
    await page.locator("#cover2").evaluate(el => { el.classList.remove("coverOn"); el.classList.add("coverOff"); });
    await page.screenshot({ path: path.join(output, "host-classic-portrait.png") });
    await page.locator("#cover2").evaluate(el => { el.classList.remove("coverOff"); el.classList.add("coverOn"); });
    await page.locator("#cover2Swipe").evaluate(el => { el.textContent = "Przesuń w dół, aby odsłonić"; });
    await page.locator("#p2Hint").evaluate(el => { el.textContent = "Przesuń w górę, aby zasłonić"; });
    await page.locator("#cover2Logo").evaluate(el => {
      const image = document.createElement("img"); image.src = "/assets/img/logo.svg"; image.alt = "";
      image.style.cssText = "width:min(86%,620px);max-height:100%;object-fit:contain"; el.replaceChildren(image);
    });
    await page.screenshot({ path: path.join(output, "host-classic-cover-safe-area.png") });
    for (const [mode, file] of [
      ["default", "host-logo-default-dot-gradient.png"],
      ["custom-dot", "host-logo-default-custom-dot.png"],
    ]) {
      await setHostLogoCase(page, mode);
      await page.screenshot({ path: path.join(output, file) });
    }
    const logoAlgorithms = [
      ["00-crisp-no-smoothing", "crisp"],
      ["01-vector-edge-antialias", "vector-aa"],
      ["02-image-interpolation", "bilinear"],
      ["03-soft-blur-0.5px", "blur-0.5"],
      ["04-soft-blur-1px", "blur-1"],
      ["05-soft-blur-1.5px", "blur-1.5"],
    ];
    const logoAlgorithmCards = [];
    for (const [label, algorithm] of logoAlgorithms) {
      await setHostLogoCase(page, "custom-pixel", demoLogoPayload, algorithm);
      const file = `${label}.png`;
      await page.screenshot({ path: path.join(logoOptionsOutput, file) });
      logoAlgorithmCards.push([label, file]);
    }
    const logoCards = logoAlgorithmCards.map(([label, file]) => `<figure><figcaption>${label}</figcaption><a href="${file}"><img src="${file}" alt="${label}"></a></figure>`).join("\n");
    await fs.writeFile(path.join(logoOptionsOutput, "index.html"), `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wygładzanie logo · warianty</title><style>body{margin:0;padding:20px;background:#10131b;color:#fff;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}figure{margin:0;padding:10px;border:1px solid #364052;border-radius:12px;background:#1a2030}figcaption{margin:0 0 8px;font-weight:700}img{display:block;width:100%;height:auto;border-radius:6px}</style><h1>Warianty wygładzania logo</h1><p>To samo logo demo z migracji 218, DOT #169bff i ten sam ekran Hosta. Wybierz numer wariantu.</p><main>${logoCards}</main></html>`);
    await page.locator("#cover2").evaluate(el => { el.classList.remove("coverOn"); el.classList.add("coverOff"); });
    await page.locator("#hostA2HS").evaluate(el => el.setAttribute("aria-hidden", "false"));
    await page.evaluate(() => document.documentElement.classList.add("showA2HS"));
    await page.screenshot({ path: path.join(output, "host-ios-fullscreen-hint.png") });
    await context.close();
  }

  {
    const { context, page } = await openPage("/control/host/", { width: 852, height: 393 }, "host-modern-landscape");
    await setSafeInsets(page, { top: 0, right: 44, bottom: 0, left: 44 });
    await applyModernTheme(page);
    await addRows(page, "paperText1", [
      { text: "RUNDA 2 — ROZGRYWKA" },
      { text: "Podaj coś, co można zabrać na wakacje?" },
      { text: "Drużyna A: 180 pkt" },
    ]);
    await addRows(page, "paperText2", [
      { text: "ODPOWIEDZI" },
      { text: "1) Paszport (34)", color: "hostGreen" },
      { text: "2) Ubrania (22)" },
      { text: "3) Kostium kąpielowy (18)" },
      { text: "4) Telefon i ładowarka (14)" },
      { text: "5) Krem z filtrem (12)" },
    ]);
    await assertFullscreenClear(page, "paperText2", "Host Modern poziomo");
    await page.locator("#cover2").evaluate(el => { el.classList.remove("coverOn"); el.classList.add("coverOff"); });
    await page.screenshot({ path: path.join(output, "host-modern-landscape.png") });
    await context.close();
  }

  {
    const { context, page } = await openPage("/control/host/", { width: 393, height: 852 }, "host-modern-portrait");
    await setSafeInsets(page, { top: 44, right: 0, bottom: 34, left: 0 });
    await applyModernTheme(page);
    await addRows(page, "paperText1", [
      { text: "RUNDA 2 — ROZGRYWKA" },
      { text: "Podaj coś, co można zabrać na wakacje?" },
      { text: "Drużyna A: 180 pkt" },
    ]);
    await addRows(page, "paperText2", [
      { text: "ODPOWIEDZI" },
      { text: "1) Paszport (34)", color: "hostGreen" },
      { text: "2) Ubrania (22)" },
      { text: "3) Kostium kąpielowy (18)" },
      { text: "4) Telefon i ładowarka (14)" },
      { text: "5) Krem z filtrem (12)" },
    ]);
    await assertFullscreenClear(page, "paperText1", "Host Modern pionowo");
    await page.locator("#cover2").evaluate(el => { el.classList.remove("coverOn"); el.classList.add("coverOff"); });
    await page.screenshot({ path: path.join(output, "host-modern-portrait.png") });
    await context.close();
  }

  {
    const { context, page } = await openPage("/control/buzzer/", { width: 852, height: 393 }, "buzzer-landscape");
    await setSafeInsets(page, { top: 0, right: 44, bottom: 0, left: 44 });
    await page.evaluate(() => {
      document.getElementById("arena").hidden = false;
      document.getElementById("btnA").classList.add("dim");
      document.getElementById("btnB").classList.add("lit");
    });
    await page.screenshot({ path: path.join(output, "buzzer-landscape.png") });
    await context.close();
  }

  {
    const { context, page } = await openPage("/control/buzzer/", { width: 393, height: 852 }, "buzzer-portrait");
    await setSafeInsets(page, { top: 44, right: 0, bottom: 34, left: 0 });
    await page.evaluate(() => { document.getElementById("arena").hidden = false; });
    await page.screenshot({ path: path.join(output, "buzzer-portrait.png") });
    await page.evaluate(() => document.documentElement.classList.add("showA2HS"));
    await page.screenshot({ path: path.join(output, "buzzer-ios-fullscreen-hint.png") });
    await context.close();
  }

  const previews = [
    ["Host · Classic · pion", "host-classic-portrait.png"],
    ["Host · Classic · zasłona i safe area", "host-classic-cover-safe-area.png"],
    ["Logo · domyślny DOT i gradient logo", "host-logo-default-dot-gradient.png"],
    ["Logo · zmieniony DOT i gradient logo", "host-logo-default-custom-dot.png"],
    ["Logo demo · warianty wygładzania do wyboru", "host-logo-smoothing-options/index.html", "host-logo-smoothing-options/00-crisp-no-smoothing.png"],
    ["Host · instrukcja pełnego ekranu iOS", "host-ios-fullscreen-hint.png"],
    ["Host · Modern · poziom", "host-modern-landscape.png"],
    ["Host · Modern · pion", "host-modern-portrait.png"],
    ["Buzzer · poziom · przycisk B wciśnięty", "buzzer-landscape.png"],
    ["Buzzer · pion", "buzzer-portrait.png"],
    ["Buzzer · instrukcja pełnego ekranu iOS", "buzzer-ios-fullscreen-hint.png"],
  ];
  const cards = previews.map(([title, file, image = file]) => `<figure><figcaption>${title}</figcaption><a href="${file}"><img src="${image}" alt="${title}"></a></figure>`).join("\n");
  await fs.writeFile(path.join(output, "index.html"), `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Podgląd Hosta i Buzera</title><style>body{margin:0;padding:24px;background:#10131b;color:#fff;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}figure{margin:0;padding:12px;border:1px solid #364052;border-radius:12px;background:#1a2030}figcaption{margin:0 0 10px;font-weight:700}img{display:block;width:100%;height:auto;border-radius:6px}p{color:#aab4c5}</style><h1>Podgląd Hosta i Buzera</h1><p>Symulowane wartości safe area w Chromium — sprawdź zachowanie na rzeczywistym iPhonie przed wdrożeniem.</p><main>${cards}</main></html>`);
  console.log(`Zapisano podglądy w ${path.relative(repo, output)}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
