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
    finalText: rep("—", 11), // placeholder dla tekstu w finale na tablicy (po stronie gracza)
    finalPts: "▒▒",
  };

  // ===== basics =====
  async function appGra() { await devices.sendDisplayCmd("MODE GRA"); }
  async function appBlack() { await devices.sendDisplayCmd("MODE BLACK"); }

  async function setTeamsLongs(teamA, teamB) {
    // long displays are team names (as you wanted)
    await devices.sendDisplayCmd(`LONG1 "${q(teamA)}"`);
    await devices.sendDisplayCmd(`LONG2 "${q(teamB)}"`);
  }

  // ===== states =====
  async function stateGameReady(teamA, teamB) {
    await appGra();
    await devices.sendDisplayCmd("MODE BLANK"); // scene blank
    await setTeamsLongs(teamA, teamB);

    // no zeros in counters
    await devices.sendDisplayCmd(`TOP ""`);
    await devices.sendDisplayCmd(`LEFT ""`);
    await devices.sendDisplayCmd(`RIGHT ""`);

    await devices.sendDisplayCmd("INDICATOR OFF");
  }

  async function stateIntroLogo(teamA, teamB) {
    await appGra();
    await setTeamsLongs(teamA, teamB);
    // logo show with your requested anim
    await devices.sendDisplayCmd('LOGO SHOW ANIMIN rain right 80');
  }

  async function hideLogo() {
    // correct command per guide
    await devices.sendDisplayCmd('LOGO HIDE ANIMOUT rain left 80');
  }

  async function roundsBoardPlaceholders(ansCount) {
    const n = Math.max(1, Math.min(6, Number(ansCount || 6)));

    // RBATCH: send only up to n; do NOT send empty rows (your rule)
    const parts = [`RBATCH SUMA 00`];
    for (let i = 1; i <= n; i++) {
      parts.push(`R${i} "${PLACE.roundsText}" ${PLACE.roundsPts}`);
    }
    parts.push(`ANIMIN edge top 20`);
    await devices.sendDisplayCmd(parts.join(" "));

    // triplets start 000
    await devices.sendDisplayCmd(`TOP 000`);
    await devices.sendDisplayCmd(`LEFT 000`);
    await devices.sendDisplayCmd(`RIGHT 000`);
  }

  async function roundsRevealRow(ord, text, pts) {
    // number appears automatically if text not empty (your display logic)
    await devices.sendDisplayCmd(`RTXT ${ord} "${q(text)}"`);
    await devices.sendDisplayCmd(`RPTS ${ord} ${String(pts)}`);
  }

  async function roundsSetSuma(val) {
    // BIG suma without leading zeros, except start already 00
    await devices.sendDisplayCmd(`RSUMA ${String(val)}`);
  }

  async function setIndicator(team) {
    if (team === "A") return devices.sendDisplayCmd("INDICATOR ON_A");
    if (team === "B") return devices.sendDisplayCmd("INDICATOR ON_B");
    return devices.sendDisplayCmd("INDICATOR OFF");
  }

  async function setTotalsTriplets({ A, B }) {
    const a = String(Math.max(0, Number(A||0))).padStart(3, "0").slice(-3);
    const b = String(Math.max(0, Number(B||0))).padStart(3, "0").slice(-3);
    await devices.sendDisplayCmd(`LEFT ${a}`);
    await devices.sendDisplayCmd(`RIGHT ${b}`);
  }

  async function setBankTriplet(val) {
    const x = String(Math.max(0, Number(val||0))).padStart(3, "0").slice(-3);
    await devices.sendDisplayCmd(`TOP ${x}`);
  }

  // FINAL board
  async function finalBoardPlaceholders() {
    await appGra();
    await devices.sendDisplayCmd("MODE FINAL");
    // FBATCH with 5 rows placeholders
    // show SUMA label always (it’s in scene)
    const parts = [`FBATCH SUMA 00`];
    for (let i = 1; i <= 5; i++) {
      parts.push(`F${i} "${PLACE.finalText}" "" "" "${PLACE.finalText}"`);
    }
    parts.push(`ANIMIN edge top 20`);
    await devices.sendDisplayCmd(parts.join(" "));
    // top triplet empty at start (your rule)
    await devices.sendDisplayCmd(`TOP ""`);
  }

  async function finalSetSuma(val) {
    await devices.sendDisplayCmd(`FSUMA ${String(val)}`);
  }

  async function finalSetLeft(i, text) {
    await devices.sendDisplayCmd(`FL ${i} "${q(text)}"`);
  }
  async function finalSetRight(i, text) {
    await devices.sendDisplayCmd(`FR ${i} "${q(text)}"`);
  }
  async function finalSetA(i, pts) {
    await devices.sendDisplayCmd(`FA ${i} ${String(pts)}`);
  }
  async function finalSetB(i, pts) {
    await devices.sendDisplayCmd(`FB ${i} ${String(pts)}`);
  }

  async function finalTimerOnSide(team, sec) {
    // seconds without leading zeros (distinguish from points)
    const s = String(Math.max(0, Number(sec||0)));
    if (team === "A") await devices.sendDisplayCmd(`LEFT ${s}`);
    if (team === "B") await devices.sendDisplayCmd(`RIGHT ${s}`);
  }

  return {
    PLACE,

    appGra,
    appBlack,

    stateGameReady,
    stateIntroLogo,
    hideLogo,

    roundsBoardPlaceholders,
    roundsRevealRow,
    roundsSetSuma,
    setIndicator,
    setTotalsTriplets,
    setBankTriplet,

    finalBoardPlaceholders,
    finalSetSuma,
    finalSetLeft,
    finalSetRight,
    finalSetA,
    finalSetB,
    finalTimerOnSide,
  };
}
