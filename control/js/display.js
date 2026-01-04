export function createDisplay({ devices, store }) {
  const ELLIPSIS = "…"; // ważne: znak z fontu

  function q(s) {
    return String(s ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  function rep(ch, n) { return ch.repeat(n); }

  const PLACE = {
    roundsText: rep(ELLIPSIS, 17),
    roundsPts: "——",   // em dash x2
    finalText: "———————————",
    finalPts: "▒▒",
    finalSuma: "▒▒",
  };

  async function send(cmd) {
    await devices.sendDisplayCmd(cmd);
  }

  // === tryb app / podstawy ===

  async function appGra() {
    await send("APP GAME");
  }

  async function blank() {
    await send("BLANK");
  }

  async function setTeamsLongs(teamA, teamB) {
    const a = String(teamA || "Drużyna A");
    const b = String(teamB || "Drużyna B");

    // Nowy protokół: dwie osobne komendy LONG1 / LONG2
    await send(`LONG1 "${q(a)}"`);
    await send(`LONG2 "${q(b)}"`);
  }

  // === Stany wysokiego poziomu ===

  // "Gra gotowa": wyczyść wszystko, przygotuj app GAME, blank, puste triplety, zgaś INDICATOR
  async function stateGameReady(teamA, teamB) {
    await appGra();
    await blank();
    await setTeamsLongs(teamA, teamB);

    await send('TOP ""');
    await send('LEFT ""');
    await send('RIGHT ""');

    await send("INDICATOR OFF");
  }

  // Intro: przygotowanie ekranu pod intro
  // Uwaga: NIE pokazuje logo – to robi logika w gameRounds (po 14s pierwszego intra).
  async function stateIntroLogo(teamA, teamB) {
    await appGra();
    await setTeamsLongs(teamA, teamB);
    // Ekran przygotowany pod intro — logo pokażemy osobno (po 14s pierwszego intra).
  }

  // === ROUNDS – plansza/odpowiedzi/X/suma ===
  
  async function roundsBoardPlaceholders(count) {
    const line = PLACE.roundsText;
    const pts = PLACE.roundsPts;
  
    const rows = Math.max(1, Math.min(6, Number(count) || 6));
  
    let cmd = "RBATCH " +
      "SUMA 00 ";
  
    for (let i = 1; i <= rows; i++) {
      cmd += `R${i} "${line}" ${pts} `;
    }
  
    cmd += "ANIMIN matrix down 1500";
  
    await send(cmd);
  }
  
  async function roundsBoardPlaceholdersNewRound(count) {
    const line = PLACE.roundsText;
    const pts = PLACE.roundsPts;
    const rows = Math.max(1, Math.min(6, Number(count) || 6));
  
    // chowanie poprzedniej planszy rund
    await send("RBATCH ANIMOUT edge down 1000");
  
    let cmd = "RBATCH " +
      "SUMA 00 ";
  
    for (let i = 1; i <= rows; i++) {
      cmd += `R${i} "${line}" ${pts} `;
    }
  
    cmd += "ANIMIN matrix down 1500";
  
    await send(cmd);
  }

  async function roundsRevealRow(ord, text, pts) {
    const t = q(text || "");
    const p = String(nInt(pts, 0)).padStart(2, "0");

    await send(
      `R ${ord} TXT "${t}" PTS ${p} ANIMIN matrix right 500`
    );
  }

  async function roundsSetSum(sum) {
    const p = String(nInt(sum, 0)).padStart(2, "0");
    await send(`RSUMA ${p} ANIMIN matrix right 500`);
  }

  async function roundsSetX(team, count) {
    const c = Math.max(0, Math.min(3, nInt(count, 0)));
    // RX 2A ON / RX 2B ON itd. – ustawiamy wszystkie X wg count
    // Najpierw wszystko OFF
    await send("RX 1A OFF");
    await send("RX 2A OFF");
    await send("RX 3A OFF");
    await send("RX 1B OFF");
    await send("RX 2B OFF");
    await send("RX 3B OFF");

    for (let i = 1; i <= c; i++) {
      await send(`RX ${i}${team} ON`);
    }
  }

  // Krótki X dla pojedynku (nie rusza liczników rundy)
  async function roundsFlashDuelX(team) {
    const side = team === "A" ? "A" : "B";

    try {
      // “pojedynekowy” X – np. drugi w kolumnie
      await send(`RX 2${side} ON`);

      setTimeout(() => {
        // szybkie zgaszenie – nie czekamy na await
        try {
          send(`RX 2${side} OFF`);
        } catch (e) {
          console.warn("[display] duel X OFF failed", e);
        }
      }, 1000); // ~0.6s – “mignięcie”, nie stały X
    } catch (e) {
      console.warn("[display] duel X failed", e);
    }
  }

  async function roundsSetTotals(totals) {
    const a = String(nInt(totals?.A, 0)).padStart(3, "0");
    const b = String(nInt(totals?.B, 0)).padStart(3, "0");
    await send(`TOP ${a}`);
    await send(`LEFT ${a}`);
    await send(`RIGHT ${b}`);
  }

  // INDICATOR: OFF / ON_A / ON_B
  async function setIndicator(mode) {
    if (!mode || mode === "OFF") {
      await send("INDICATOR OFF");
    } else if (mode === "A") {
      await send("INDICATOR ON_A");
    } else if (mode === "B") {
      await send("INDICATOR ON_B");
    }
  }

  async function setTotalsTriplets(totals) {
    const a = String(nInt(totals?.A, 0)).padStart(3, "0");
    const b = String(nInt(totals?.B, 0)).padStart(3, "0");
    await send(`LEFT ${a}`);
    await send(`RIGHT ${b}`);
  }

  async function setBankTriplet(bank) {
    const p = String(nInt(bank, 0)).padStart(3, "0");
    await send(`TOP ${p}`);
  }

  // === FINAŁ – plansza, odpowiedzi, suma, timer ===

  async function finalBoardPlaceholders() {
    const t = PLACE.finalText;
    const p = PLACE.finalPts;
    const s = PLACE.finalSuma;

    await send(
      "FBATCH " +
      `SUMA A ${s} ` +
      `F1 "${t}" ${p} ${p} "${t}" ` +
      `F2 "${t}" ${p} ${p} "${t}" ` +
      `F3 "${t}" ${p} ${p} "${t}" ` +
      `F4 "${t}" ${p} ${p} "${t}" ` +
      `F5 "${t}" ${p} ${p} "${t}" ` +
      "ANIMIN matrix down 1500"
    );
  }

  async function finalHideAnswersKeepSum() {
    // Zasłaniamy odpowiedzi, suma zostaje
    await send(
      "FHALF A " +
      `"${PLACE.finalText}" ${PLACE.finalPts} ` +
      `"${PLACE.finalText}" ${PLACE.finalPts} ` +
      `"${PLACE.finalText}" ${PLACE.finalPts} ` +
      `"${PLACE.finalText}" ${PLACE.finalPts} ` +
      `"${PLACE.finalText}" ${PLACE.finalPts} ` +
      "ANIMIN matrix down 1000"
    );
  }

  async function finalSetLeft(n, text) {
    const txt = q(String(text || ""));
    await send(`F ${n} L "${txt}" A 00 ANIMIN matrix right 500`);
  }

  async function finalSetRight(n, text) {
    const txt = q(String(text || ""));
    await send(`F ${n} R "${txt}" B 00 ANIMIN matrix right 500`);
  }

  async function finalSetA(n, pts) {
    const p = String(nInt(pts, 0)).padStart(2, "0");
    await send(`F ${n} L "" A ${p} ANIMIN matrix right 500`);
  }

  async function finalSetB(n, pts) {
    const p = String(nInt(pts, 0)).padStart(2, "0");
    await send(`F ${n} R "" B ${p} ANIMIN matrix right 500`);
  }

  async function finalSetSuma(sum) {
    const p = String(nInt(sum, 0)).padStart(3, "0");
    // domyślnie pokazujemy sumę pod stroną A (tak jak w przykładzie)
    await send(`FSUMA A ${p} ANIMIN matrix right 500`);
  }

  async function finalSetSideTimer(team, text) {
    const t = String(text || "");
    // Timer na bocznym tripletcie – wykorzystujemy TOP/LEFT/RIGHT,
    // ale tylko po stronie zwycięskiej drużyny (ty ustalasz w Control).
    const sum = store.state.rounds?.totals || { A: 0, B: 0 };
    const a = String(nInt(sum.A, 0)).padStart(3, "0");
    const b = String(nInt(sum.B, 0)).padStart(3, "0");

    if (team === "A") {
      await send(`LEFT ${t}`);
      await send(`RIGHT ${b}`);
    } else if (team === "B") {
      await send(`LEFT ${a}`);
      await send(`RIGHT ${t}`);
    } else {
      await send(`LEFT ${a}`);
      await send(`RIGHT ${b}`);
    }
  }

  // === Logo / Win ===

  async function showLogo() {
    await send('LOGO SHOW ANIMIN edge up 1000');
  }

  async function hideLogo() {
    await send('LOGO HIDE ANIMOUT edge down 1000');
  }

  async function showWin(amount) {
    const num = nInt(amount, 0);
    const txt = String(num).padStart(5, "0");
    await send(`WIN ${txt} ANIMIN rain right 80`);
  }

  function nInt(v, d = 0) {
    const x = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(x) ? x : d;
  }

  return {
    stateGameReady,
    stateIntroLogo,

    roundsBoardPlaceholders,
    roundsBoardPlaceholdersNewRound,
    roundsRevealRow,
    roundsSetSum,
    roundsSetX,
    roundsFlashDuelX,
    roundsSetTotals,

    setIndicator,
    setTotalsTriplets,
    setBankTriplet,

    finalBoardPlaceholders,
    finalSetSuma,
    finalSetLeft,
    finalSetRight,
    finalSetA,
    finalSetB,
    finalSetSideTimer,
    finalHideAnswersKeepSum,

    showLogo,
    hideLogo,
    showWin,
    appGra,
    blank,
  };
}
