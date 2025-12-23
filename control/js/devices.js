// /familiada/control/js/display.js
import { rt } from "/familiada/js/core/realtime.js";

function escapeForQuotedCommand(raw) {
  return String(raw ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r\n", "\n");
}

export function createDisplayDriver(gameId) {
  const ch = rt(`familiada-display:${gameId}`);

  async function send(line) {
    const l = String(line ?? "").trim();
    if (!l) return;
    await ch.sendBroadcast("DISPLAY_CMD", { line: l });
  }

  // Triplet: PUNKTY -> 3 cyfry z zerami
  function fmtTripletPoints(val) {
    const x = Math.max(0, Number.parseInt(String(val ?? "0"), 10) || 0);
    return String(x).slice(0, 3).padStart(3, "0");
  }

  // Triplet: SEKUNDY -> bez zer z przodu
  function fmtTripletSeconds(val) {
    const x = Math.max(0, Number.parseInt(String(val ?? "0"), 10) || 0);
    return String(x);
  }

  // Uwaga: BLANK u Ciebie czasem “nie pykla” – zostawiamy komendę,
  // ale nie opieramy całej gry na tym, tylko robimy HIDE->MODE BLANK jako standard.
  async function bigBlank() {
    await send("MODE BLANK");
  }

  async function appGra() {
    await send("MODE GRA");
  }

  async function indicator(state) {
    await send(`INDICATOR ${state}`); // OFF | ON_A | ON_B
  }

  async function setTeams(teamA, teamB) {
    // dolne longi przez całą grę (od GAME_READY do końca)
    await send(`LONG1 "${escapeForQuotedCommand(teamA)}"`);
    await send(`LONG2 "${escapeForQuotedCommand(teamB)}"`);
  }

  async function clearTriplets() {
    // “nic” = pusty string (u Ciebie działa)
    await send(`TOP ""`);
    await send(`LEFT ""`);
    await send(`RIGHT ""`);
  }

  async function setTripletsPoints({ top, left, right }) {
    if (top != null) await send(`TOP "${fmtTripletPoints(top)}"`);
    if (left != null) await send(`LEFT "${fmtTripletPoints(left)}"`);
    if (right != null) await send(`RIGHT "${fmtTripletPoints(right)}"`);
  }

  async function setSideTimerSeconds(side /* "A"|"B" */, sec) {
    // timer tylko w finale, na bocznym tripletcie zwycięzców, bez zer z przodu
    const v = fmtTripletSeconds(sec);
    if (side === "A") await send(`LEFT "${v}"`);
    if (side === "B") await send(`RIGHT "${v}"`);
  }

  async function showLogoIntro() {
    await appGra();
    await send("MODE LOGO");
    await send("LOGO ANIMIN rain right 80");
  }

  async function hideRainLeft80() {
    await send("HIDE ANIMOUT rain left 80");
  }

  async function gameReady(teamA, teamB) {
    await appGra();
    await setTeams(teamA, teamB);
    await clearTriplets();     // żadnych zer w gotowości
    await indicator("OFF");
    // duży wyświetlacz pusty:
    await bigBlank();
  }

  async function roundStartBoard({
    answersCount = 6,
    scoreA = 0,
    scoreB = 0,
  }) {
    // logo ma NIE znikać w ROUND_READY; znika dopiero na start rundy
    await hideRainLeft80();

    // plansza rundy – bez RBATCH na razie (żeby nie walić nieznanymi tokenami),
    // tylko bezpieczne MODE ROUNDS + setery:
    await send("MODE ROUNDS");

    // placeholder tylko tam gdzie jest odpowiedź
    const DOTS = "…";           // U+2026 (z Twojego fontu)
    const TXT = DOTS.repeat(17);
    const PTS = "——";           // U+2014 x2 (z Twojego fontu)

    const n = Math.max(1, Math.min(6, Number.parseInt(String(answersCount), 10) || 6));
    for (let i = 1; i <= 6; i++) {
      if (i <= n) {
        await send(`RTXT ${i} "${TXT}"`);
        await send(`RPTS ${i} ${PTS}`);
      } else {
        // ważne: puste teksty -> brak numeru porządkowego
        // (Twoja logika numerowania działa po trim)
        await send(`RTXT ${i} ""`);
        await send(`RPTS ${i} ""`);
      }
    }

    // SUMA zawsze ma słowo “SUMA”; w ROUNDS to jest RSUMA
    // start rundy: "00"
    await send(`RSUMA 00`);

    // triplet: lewy/prawy = konto drużyn (z zerami), górny = bank 000 na start pytania
    await setTripletsPoints({ left: scoreA, right: scoreB, top: 0 });

    await indicator("OFF");
  }

  return {
    send,
    appGra,
    indicator,
    setTeams,
    clearTriplets,
    setTripletsPoints,
    setSideTimerSeconds,
    bigBlank,
    showLogoIntro,
    hideRainLeft80,
    gameReady,
    roundStartBoard,
  };
}
