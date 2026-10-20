// Kontrola czcionek rozgrywki Control: pytania 200 znaków (limit bazy), odpowiedzi
// 17 znaków, wiele rozmiarów i proporcji okna. Zgłasza ucięty tekst, elementy poza
// kartą i przewijanie strony; wypisuje wynikowe rozmiary czcionek.
//   node scripts/screens/check-control-fit.cjs   (zmienne: KINDS=round,finale,finale2 VP=1280x720,... UPPER=1 QLEN=200 STEP=f_p2_map_q2)
const path = require("node:path");
const fs = require("node:fs");
const repo = path.resolve(__dirname, "../..");
const { startServer, stopServer, launch, newContext } = require(path.join(repo, "scripts/screens/lib.cjs"));
const { buildDb, IDS } = require(path.join(repo, "scripts/screens/data/demo.cjs"));
const OUT = path.join(__dirname, "out/control-fit");
const LOWER = "Wymień rzecz, którą najczęściej zabierasz ze sobą na długi rodzinny wyjazd nad morze, kiedy pakujesz się w ostatniej chwili i boisz się, że czegoś zapomnisz, a samochód jest już prawie pełny po dach!!".slice(0, Number(process.env.QLEN || 200));
const Q200 = process.env.UPPER ? LOWER.toUpperCase() : LOWER;
const A17 = ["Krem z filtrem 50", "Ręcznik plażowy", "Okulary słoneczne", "Ładowarka do tel.", "Kapelusz i czapka", "Dmuchany materac"];
const VIEWPORTS = (process.env.VP || "980x540,980x600,1024x768,1280x720,1280x1024,1366x768,1440x900,1600x900,1920x1080,2560x1080,2560x1440,1080x1350").split(",").map((v) => v.split("x").map(Number));
const KINDS = (process.env.KINDS || "round,finale,finale2").split(",");

(async () => {
  const { buildGameState } = await import(path.join(repo, "scripts/screens/data/game-state.mjs"));
  fs.mkdirSync(OUT, { recursive: true });
  const origin = await startServer();
  const browser = await launch();
  let bad = 0;
  for (const kind of KINDS) {
    let gs = JSON.stringify(buildGameState("pl", kind)).split("Podaj coś, co można zjeść na szybko").join(Q200);
    for (const fq of ["Co zabierasz na weekend?", "Jaki napój wybierasz?", "Co pomaga odpocząć?", "Co masz w plecaku?", "Jaki smak lodów?"]) gs = gs.split(JSON.stringify(fq)).join(JSON.stringify(Q200));
    ["Kanapka", "Owoc", "Jogurt", "Sałatka", "Drożdżówka", "Baton"].forEach((a, i) => { gs = gs.split(`"${a}"`).join(JSON.stringify(A17[i])); });
    ["Ubrania", "Herbata", "Spacer", "Mapa", "Wanilia"].forEach((a, i) => { gs = gs.split(`"${a}"`).join(JSON.stringify(A17[i])); });
    const row = JSON.parse(gs);
    if (process.env.STEP && /map/.test(process.env.STEP)) {
      const f = row.detail.final;
      f.questions.forEach((q, qi) => { q.answers = A17.map((text, i) => ({ id: `fa${qi}${i}`, text, fixed_points: 30 - i * 5 })); });
      const blank = () => f.questions.map(() => ({ kind: null, matchId: null, revealedAnswer: false, revealedPoints: false }));
      f.runtime.map1 = f.runtime.map1?.length ? f.runtime.map1.map((m) => ({ ...blank()[0], ...m })) : blank();
      f.runtime.map2 = blank();
      f.runtime.p2 = f.runtime.p2?.length ? f.runtime.p2 : f.questions.map(() => ({ text: "" }));
    }
    if (process.env.STEP) { row.step = process.env.STEP; if (row.detail && "step" in row.detail) row.detail.step = process.env.STEP; }
    const db = buildDb("pl", { gameState: row });
    for (const [w, h] of VIEWPORTS) {
      const context = await newContext(browser, db, "pl", { width: w, height: h, scale: 1, mobile: false });
      const page = await context.newPage();
      page.on("pageerror", (e) => console.log("  [błąd strony]", e.message.slice(0, 200)));
      await page.goto(`${origin}/control/?id=${IDS.game}&lang=pl`, { waitUntil: "domcontentloaded" });
      try { await page.waitForSelector(".c2-gameplay-card", { timeout: 15000 }); } catch { await page.screenshot({ path: path.join(OUT, `brak-${process.env.STEP || kind}-${w}x${h}.png`) }); console.log(`${kind} ${w}×${h}: brak karty rozgrywki (strażnik okna?)`); await context.close(); continue; }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const card = document.querySelector(".c2-gameplay-card");
        const cr = card.getBoundingClientRect();
        const problems = [];
        for (const el of card.querySelectorAll("*")) {
          if (!el.offsetParent || /INPUT|TEXTAREA|svg|path/i.test(el.tagName)) continue;
          const st = getComputedStyle(el);
          const clips = st.overflowX !== "visible" || st.overflowY !== "visible";
          if (clips && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) problems.push(`ucięte: ${el.className || el.tagName} „${el.textContent.trim().slice(0, 25)}”`);
          const b = el.getBoundingClientRect();
          if (b.width && (b.bottom > cr.bottom + 1 || b.right > cr.right + 1 || b.left < cr.left - 1 || b.top < cr.top - 1)) problems.push(`poza kartą: ${el.className || el.tagName}`);
        }
        for (const el of document.querySelectorAll(".c2-tile, .c2-entrytile, .c2-btn-repeat, .c2-mapinput, .c2-stepper-question, .c2-roundlayout-side, .c2-statusbar")) {
          if (el.offsetParent && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) problems.push(`przepełnione: ${el.className} „${el.textContent.trim().slice(0, 25)}”`);
        }
        const doc = document.documentElement;
        if (doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1) problems.push(`przewija stronę ${doc.scrollWidth}×${doc.scrollHeight}`);
        const fs = (sel) => { const e = document.querySelector(sel); return e ? Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10 : "-"; };
        return { base: fs(".c2-gameplay-card"), q: fs(".c2-stepper-question:not(.c2-stepper-empty)"), fq: fs(".c2-entrytile-q"), tile: fs(".c2-tile"), hint: fs(".c2-hint-main"), problems: [...new Set(problems)] };
      });
      if (r.problems.length) bad++;
      console.log(`${kind.padEnd(8)} ${String(w + "×" + h).padEnd(10)} baza ${r.base}px | pytanie ${r.q} | pyt. finału ${r.fq} | kafel ${r.tile} | podpowiedź ${r.hint} | ${r.problems.length ? "PROBLEM: " + r.problems.slice(0, 4).join("; ") : "ok"}`);
      await page.screenshot({ path: path.join(OUT, `${process.env.STEP || kind}-${w}x${h}${process.env.UPPER ? "-upper" : ""}.png`) });
      await context.close();
    }
  }
  await browser.close();
  stopServer();
  console.log(bad ? `\n${bad} przypadków z problemem` : "\nwszystko się mieści");
  if (bad) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
