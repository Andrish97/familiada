import { createSfxMixer, playSfx } from "/familiada/js/core/sfx.js";
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
  const introMixer = createSfxMixer ? createSfxMixer() : null;

  // ===== basics =====
  async function appGra() { await devices.sendDisplayCmd("MODE GRA"); }
  async function appBlack() { await devices.sendDisplayCmd("MODE BLACK"); }

  async function setTeamsLongs(teamA, teamB) {
    // long displays are team names (as you wanted)
    await devices.sendDisplayCmd(`LONG1 "${q(teamA)}"`);
    await devices.sendDisplayCmd(`LONG2 "${q(teamB)}"`);
  }

  async function showWin(amount) {
    const txt = String(Math.max(0, Number(amount || 0))).slice(0, 5); // max 5 znaków
    await send(`WIN "${txt}" ANIMIN rain right 80`);
  }

  async function showLogo() {
    await send("MODE GRA");
    await send("LOGO SHOW ANIMIN rain right 80");
  }

  async function finalSetSideTimer(team, txt) {
    if (!team) return;
  
    // txt = "15", "9", "0", "" itp.
    await send(`FINAL TIMER ${team} ${txt}`);
  }

  // display.js

  async function finalHideAnswersKeepSum() {
    for (let i = 1; i <= 5; i++) {
      await send(`FINAL LEFT ${i} —`);
      await send(`FINAL RIGHT ${i} —`);
      await send(`FINAL A ${i} 00`);
      await send(`FINAL B ${i} 00`);
    }
    // SUMA zostaje nietknięta
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

  async function stateIntroLogo() {
    if (!devices.displayOnline()) return;

    // plansza intro (bez logo na starcie)
    await appGra();
    const { teamA, teamB } = store.state.teams;
    await setTeamsLong(teamA, teamB);
    await send("MODE INTRO");

    // jeśli z jakiegoś powodu mixer nie jest dostępny – fallback: 2x intro, logo po 14s "na czas"
    if (!introMixer) {
      playSfx("show_intro");
      setTimeout(() => { send("LOGO SHOW"); }, 14000);
      // drugi raz intro "na oko" po zakończeniu pierwszego – np. ~15s
      setTimeout(() => { playSfx("show_intro"); }, 15000);
      return;
    }

    await new Promise((resolve) => {
      let loops = 0;
      let logoShown = false;

      const off = introMixer.onTime(async (currentTime, duration) => {
        // 1) Logo na 14 sekundzie PIERWSZEGO odtworzenia
        if (!logoShown && currentTime >= 14) {
          logoShown = true;
          await send("LOGO SHOW");
        }

        // 2) Koniec pojedynczego odtworzenia
        if (duration > 0 && currentTime >= duration - 0.05) {
          loops += 1;

          if (loops < 2) {
            // odpal drugie odtworzenie
            introMixer.play("show_intro");
          } else {
            // 2 odtworzenia zagrane – koniec
            off();
            introMixer.stop();
            resolve();
          }
        }
      });

      // start pierwszego odtworzenia
      introMixer.play("show_intro");
    });
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

  return {
    PLACE,

    appGra,
    appBlack,

    stateGameReady,
    stateIntroLogo,
    hideLogo,
    showLogo,
    showWin,

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
    finalSetSideTimer,
    finalHideAnswersKeepSum,
  };
}
