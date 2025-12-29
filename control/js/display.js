// /familiada/control/js/display.js

export function createDisplay({ devices, store }) {
  const ELLIPSIS = "…";

  function q(s) {
    return String(s ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  function rep(ch, n) { return ch.repeat(n); }

  const PLACE = {
    roundsText: rep(ELLIPSIS, 17),
    roundsPts: "——",
    finalText: "———————————",
    finalPts: "▒▒",
    finalSuma: "▒▒",
  };

  async function send(cmd) {
    await devices.sendDisplayCmd(cmd);
  }

  async function appGra() {
    await send("APP GAME");
  }

  async function blank() {
    await send("MODE BLANK");
  }

  async function appBlack() {
    await send("APP BLACK");
  }

  async function setTeamsLongs(arg1, arg2) {
    let a, b;
    if (arg1 && typeof arg1 === "object") {
      a = String(arg1.teamA || "Drużyna A");
      b = String(arg1.teamB || "Drużyna B");
    } else {
      a = String(arg1 || "Drużyna A");
      b = String(arg2 || "Drużyna B");
    }
    await send(`LONG1 "${q(a)}"`);
    await send(`LONG2 "${q(b)}"`);
  }

  async function stateGameReady(teamA, teamB) {
    await appGra();
    await appBlack();
    await setTeamsLongs(teamA, teamB);
    await send('TOP ""');
    await send('LEFT ""');
    await send('RIGHT ""');
    await send("INDICATOR OFF");
  }

  async function stateIntroLogo(teamA, teamB) {
    await appGra();
    await appBlack();
    await setTeamsLongs(teamA, teamB);
  }

  async function roundsBoardPlaceholders() {
    await send("MODE ROUNDS");
    const line = PLACE.roundsText;
    const pts = PLACE.roundsPts;

    await send(
      "RBATCH " +
      'SUMA 00 ' +
      `R1 "${line}" ${pts} ` +
      `R2 "${line}" ${pts} ` +
      `R3 "${line}" ${pts} ` +
      `R4 "${line}" ${pts} ` +
      `R5 "${line}" ${pts} ` +
      `R6 "${line}" ${pts} ` +
      "ANIMIN matrix down 1500"
    );
  }

  async function roundsBoardPlaceholdersNewRound() {
    await send("RBATCH ANIMOUT edge down 1000");

    const line = PLACE.roundsText;
    const pts = PLACE.roundsPts;

    await send(
      "RBATCH " +
      'SUMA 00 ' +
      `R1 "${line}" ${pts} ` +
      `R2 "${line}" ${pts} ` +
      `R3 "${line}" ${pts} ` +
      `R4 "${line}" ${pts} ` +
      `R5 "${line}" ${pts} ` +
      `R6 "${line}" ${pts} ` +
      "ANIMIN matrix down 1500 pixel"
    );
  }

  function nInt(v, d = 0) {
    const x = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(x) ? x : d;
  }

  async function roundsRevealRow(ord, text, pts) {
    const t = q(text || "");
    const p = String(nInt(pts, 0)).padStart(2, "0");
    await send(`R ${ord} TXT "${t}" PTS ${p} ANIMIN matrix right 500`);
  }

  async function roundsSetSum(sum) {
    const p = String(nInt(sum, 0)).padStart(2, "0");
    await send(`RSUMA ${p} ANIMIN matrix right 500`);
  }

  async function roundsSetX(team, count) {
    const c = Math.max(0, Math.min(3, nInt(count, 0)));
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

  async function roundsSetTotals(totals) {
    const a = String(nInt(totals?.A, 0)).padStart(3, "0");
    const b = String(nInt(totals?.B, 0)).padStart(3, "0");
    await send(`TOP ${a}`);
    await send(`LEFT ${a}`);
    await send(`RIGHT ${b}`);
  }

  async function setIndicator(mode) {
    if (!mode || mode === "OFF" || mode === null) {
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

  async function finalBoardPlaceholders() {
    await send("MODE FINAL");
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
    await send(`FSUMA A ${p} ANIMIN matrix right 500`);
  }

  async function finalSetSideTimer(team, text) {
    const t = String(text || "");
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

  return {
    stateGameReady,
    stateIntroLogo,

    roundsBoardPlaceholders,
    roundsBoardPlaceholdersNewRound,
    roundsRevealRow,
    roundsSetSum,
    roundsSetX,
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
    appBlack,
    blank,
  };
}
