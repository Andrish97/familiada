// Kontrola klawiatury ekranowej (decyzja użytkownika 2026-10-29: klawiatura
// zasłania stronę, widok nie skacze, aktywne pole staje tuż nad klawiaturą).
// Każda scena zrzutów (strony i otwarte okna), każde widoczne pole tekstowe,
// telefon, tablet i duży tablet: pole ustawione na dole widoku, fokus, atrapa
// VirtualKeyboard API (Chrome na Androidzie) zgłasza klawiaturę. Błąd, gdy pole
// zostaje pod klawiaturą lub nad paskiem, gdy coś je zasłania, gdy widok
// ruszył się, choć pole było widoczne, albo przesunął się dalej niż trzeba.
//   node scripts/screens/check-keyboard.cjs
//   zmienne: DEVICES=phone,tablet,tablet-landscape,tablet-large,tablet-large-landscape SCENES=account,... JOBS=4 VERBOSE=1
const { startServer, stopServer, launch, newContext } = require("./lib.cjs");
const scenes = require("./scenes.cjs");
const { buildDb } = require("./data/demo.cjs");

const DEVICES = {
  phone: { width: 390, height: 844, scale: 1, mobile: true, kb: 340 },
  tablet: { width: 820, height: 1180, scale: 1, mobile: true, kb: 420 },
  "phone-landscape": { width: 844, height: 390, scale: 1, mobile: true, kb: 200 },
  "tablet-landscape": { width: 1180, height: 820, scale: 1, mobile: true, kb: 380 },
  // Duży tablet (Control, Wyświetlacz, ankieta QR wymagają ≥ 980 px / krótszego boku 800).
  "tablet-large": { width: 1024, height: 1366, scale: 1, mobile: true, kb: 440 },
  "tablet-large-landscape": { width: 1366, height: 1024, scale: 1, mobile: true, kb: 400 },
};
const GAP = 12; // FIELD_GAP w device-attrs.js
const TOL = 3;
const devices = (process.env.DEVICES || "phone,tablet,tablet-landscape,tablet-large,tablet-large-landscape").split(",");
const only = process.env.SCENES ? new Set(process.env.SCENES.split(",")) : null;
const JOBS = Number(process.env.JOBS || 4);

const fakeKeyboard = () => {
  const vk = new EventTarget();
  vk.overlaysContent = false;
  vk.boundingRect = { x: 0, y: 0, width: 0, height: 0 };
  Object.defineProperty(navigator, "virtualKeyboard", { value: vk, configurable: true });
  window.__kbSet = (h) => {
    vk.boundingRect = { x: 0, y: innerHeight - h, width: innerWidth, height: h };
    vk.dispatchEvent(new Event("geometrychange"));
  };
};

// Pola w aktywnym oknie (gdy jest), inaczej na stronie; tylko widoczne i edytowalne.
const listFields = () => {
  // Otwarte okno = naprawdę widoczne (nie tylko bez atrybutu hidden).
  const shown = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0"; };
  const open = [...document.querySelectorAll(".overlay, .sheet-active, [role=dialog]")].filter(shown);
  const scope = open[open.length - 1] || document;
  const sel = "input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=color]):not([type=file]):not([type=button]):not([type=submit]), textarea, [contenteditable=true]";
  return [...scope.querySelectorAll(sel)].filter((el) => {
    if (el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.opacity !== "0";
  }).map((el, i) => {
    el.dataset.kbcheck = String(i);
    return { i, label: el.id || el.name || el.getAttribute("placeholder") || el.className.split(" ")[0] || el.tagName };
  });
};

// Pole na dole widoku (najgorszy przypadek: tuż nad miejscem klawiatury),
// fokus bez przewijania, klawiatura, pomiar.
const probe = async (page, i, kb) => page.evaluate(async ({ i, kb, GAP, TOL }) => {
  const el = document.querySelector(`[data-kbcheck="${i}"]`);
  if (!el) return { skip: "zniknęło" };
  const H = innerHeight;
  // Najniżej, jak użytkownik może je zobaczyć bez klawiatury.
  el.scrollIntoView({ block: "end", behavior: "instant" });
  await new Promise((r) => setTimeout(r, 120));
  const topbarBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
  const before = el.getBoundingClientRect();
  if (before.bottom > H + 1 || before.top < topbarBottom - 1) return { skip: "poza widokiem bez klawiatury" };
  // Pole niewidoczne pod nakładką (np. inne okno nad nim) -- tego nie sprawdzamy.
  const hitBefore = document.elementFromPoint(before.left + Math.min(10, before.width / 2), before.top + before.height / 2);
  if (hitBefore && hitBefore !== el && !el.contains(hitBefore) && !hitBefore.contains(el) && !el.labels?.[0]?.contains(hitBefore)) return { skip: "zasłonięte bez klawiatury" };
  const needed = Math.max(0, Math.min(before.bottom - (H - kb - GAP), before.top - topbarBottom - GAP));
  let moves = 0;
  const onScroll = () => { moves++; };
  addEventListener("scroll", onScroll, true);
  el.focus({ preventScroll: true });
  await new Promise((r) => setTimeout(r, 60));
  // Dwie zmiany w trakcie otwierania (połowa, potem całość): drugie
  // ustawienie nie może dołożyć ruchu ponad potrzebę.
  window.__kbSet(Math.round(kb / 2));
  await new Promise((r) => setTimeout(r, 80));
  window.__kbSet(kb);
  await new Promise((r) => setTimeout(r, 1300));
  removeEventListener("scroll", onScroll, true);
  const after = el.getBoundingClientRect();
  const moved = before.top - after.top;
  const problems = [];
  if (after.bottom > H - kb + TOL) problems.push(`pod klawiaturą o ${Math.round(after.bottom - (H - kb))} px`);
  const tb = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
  if (after.top < tb - TOL && after.bottom > tb) problems.push(`pod paskiem o ${Math.round(tb - after.top)} px`);
  if (needed === 0 && Math.abs(moved) > TOL) problems.push(`ruszyło się o ${Math.round(moved)} px, choć było widoczne`);
  if (needed > 0 && moved > needed + TOL) problems.push(`przesunięte za daleko: ${Math.round(moved)} zamiast ${Math.round(needed)} px`);
  if (needed > 0 && moved < needed - TOL && !problems.length) problems.push(`przesunięte za mało: ${Math.round(moved)} zamiast ${Math.round(needed)} px`);
  if (document.activeElement !== el) problems.push("pole straciło fokus");
  const cx = after.left + Math.min(10, after.width / 2), cy = after.top + after.height / 2;
  if (!problems.length && cy > 0 && cy < H - kb) {
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !el.labels?.[0]?.contains(hit)) problems.push(`zasłonięte przez ${hit.className || hit.tagName}`);
  }
  return { needed: Math.round(needed), moved: Math.round(moved), problems };
}, { i, kb, GAP, TOL });

// Zamknięcie klawiatury i powrót.
// Po zamknięciu nic nie zostaje podniesione (translate, nawet 0, psuje okna
// position:fixed otwierane z wnętrza treści).
const closeKeyboard = (page) => page.evaluate(async () => {
  window.__kbSet(0);
  document.activeElement?.blur?.();
  await new Promise((r) => setTimeout(r, 600));
  return document.querySelector(".keyboard-lift, [data-keyboard-room]") ? "po zamknięciu klawiatury treść zostaje podniesiona" : null;
});

async function checkScene(browser, origin, scene, deviceName, buildGameState) {
  const device = DEVICES[deviceName];
  const db = buildDb("pl", scene.gameState ? { gameState: buildGameState("pl", scene.gameState) } : {});
  if (scene.guest) { db.user = null; db.localStorage = {}; }
  if (typeof scene.db === "function") scene.db(db, "pl");
  const context = await newContext(browser, db, "pl", device);
  await context.addInitScript(fakeKeyboard);
  if (scene.initScript) await context.addInitScript(scene.initScript);
  const page = await context.newPage();
  const out = [];
  if (process.env.VERBOSE) page.on("pageerror", (e) => console.log(`  ! ${scene.id} ${deviceName}: ${e.message.slice(0, 160)}`));
  try {
    const [pathOnly, hash = ""] = scene.path.split("#");
    await page.goto(`${origin}${pathOnly}${pathOnly.includes("?") ? "&" : "?"}lang=pl${hash ? `#${hash}` : ""}`, { waitUntil: "domcontentloaded" });
    // Warunek gotowości lub krok sceny bywa pod jedno urządzenie (np. spis
    // treści schowany na dotyku) -- wtedy i tak sprawdzamy pola strony.
    try {
      if (typeof scene.ready === "string") await page.waitForSelector(scene.ready, { state: "visible", timeout: 15000 });
      else if (scene.ready) await page.waitForFunction(scene.ready, null, { timeout: 15000 });
    } catch (e) { out.push({ skip: `gotowość sceny: ${e.message.split("\n")[0].slice(0, 80)} (pola strony i tak sprawdzone)` }); }
    await page.waitForFunction(() => !document.documentElement.classList.contains("page-loading"), null, { timeout: 8000 }).catch(() => {});
    if (await page.evaluate(() => (document.documentElement.dataset.deviceGuard || "ok") !== "ok")) return [{ skip: "strona zablokowana na tym urządzeniu" }];
    try {
      for (const step of scene.steps || []) await step(page, { lang: "pl", device: deviceName, page });
    } catch (e) { out.push({ skip: `krok sceny: ${e.message.split("\n")[0].slice(0, 80)} (pola bieżącego widoku i tak sprawdzone)` }); }
    await page.waitForTimeout(400);
    const fields = await page.evaluate(listFields);
    for (const f of fields) {
      const r = await probe(page, f.i, device.kb);
      // SHOTS=katalog: zrzut przy błędzie (klawiatura jeszcze otwarta).
      if (process.env.SHOTS && r.problems?.length) {
        await page.screenshot({ path: require("node:path").join(process.env.SHOTS, `${scene.id}-${deviceName}-${String(f.label).replace(/[^\w-]+/g, "_")}.png`) });
      }
      if (!r.skip) {
        const left = await closeKeyboard(page);
        if (left) r.problems.push(left);
      }
      out.push({ field: f.label, ...r });
    }
  } catch (e) {
    out.push({ skip: `scena: ${e.message.split("\n")[0].slice(0, 120)}` });
  } finally {
    await context.close();
  }
  return out;
}

(async () => {
  const { buildGameState } = await import("./data/game-state.mjs");
  const origin = await startServer();
  const browser = await launch();
  // Bez podglądów urządzeń (bez pól). Sceny w ramce (Prowadzący) -- sama
  // strona, bez ramki; sceny o stałym rozmiarze (np. Control) -- w rozmiarach
  // urządzeń, bo Control działa na dużym tablecie.
  const seen = new Set();
  const list = [...scenes].filter((s) => !s.previewRow && (!only || only.has(s.id))).filter((s) => {
    const key = `${s.path}|${(s.steps || []).map(String).join("|")}|${s.guest ? 1 : 0}|${JSON.stringify(s.gameState || null)}|${s.db ? String(s.db) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const jobs = list.flatMap((scene) => devices.map((d) => ({ scene, d })));
  const failures = [];
  let checked = 0;
  let next = 0;
  const reported = new Set();
  await Promise.all(Array.from({ length: JOBS }, async () => {
    while (next < jobs.length) {
      const { scene, d } = jobs[next++];
      const res = await checkScene(browser, origin, scene, d, buildGameState);
      for (const r of res) {
        if (r.skip) { if (process.env.VERBOSE) console.log(`  – ${scene.id} ${d} ${r.field || ""}: ${r.skip}`); continue; }
        checked++;
        if (process.env.VERBOSE) console.log(`  · ${scene.id} ${d} ${r.field}: potrzeba ${r.needed}, ruch ${r.moved}${r.problems.length ? " ✗" : ""}`);
        if (!r.problems.length) continue;
        const key = `${scene.path.split("?")[0]}|${d}|${r.field}|${r.problems.join(";")}`;
        if (reported.has(key)) continue;
        reported.add(key);
        failures.push(`${scene.id} [${d}] ${r.field}: ${r.problems.join("; ")}`);
        console.log(`✗ ${scene.id} [${d}] ${r.field}: ${r.problems.join("; ")}`);
      }
    }
  }));
  await browser.close();
  stopServer();
  console.log(`\nSceny: ${list.length} × ${devices.length} urządzeń, sprawdzone pola: ${checked}, błędy: ${failures.length}`);
  process.exit(failures.length ? 1 : 0);
})();
