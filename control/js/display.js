// control/js/display.js
export function createDisplay({ devices, store }) {
  function q(s) {
    return String(s ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  async function gameReady(teamA, teamB) {
    // minimal: ustaw GRA + czysty ekran + nazwy drużyn
    await devices.sendDisplayCmd("MODE GRA");

    // BLANK u Ciebie czasem nie działa — więc na “pusty big” użyjemy bezpiecznie:
    // MODE LOGO + HIDE? Nie. Lepiej: MODE ROUNDS i wyczyścić rows? Ale to nie “pusto”.
    // Na ten moment zostawiamy: MODE GRA + HIDE i dopiero potem BLACK jeśli chcesz czarny.
    // Ty mówiłeś: w gra_gotowa ma być “tylko nazwy” — więc wyślemy LOGO HIDE, a big będzie pusty.
    await devices.sendDisplayCmd("HIDE ANIMOUT rain left 1");

    await devices.sendDisplayCmd(`LONG1 "${q(teamA)}"`);
    await devices.sendDisplayCmd(`LONG2 "${q(teamB)}"`);

    // triplet: na start nic nie wymuszamy tutaj (żeby nie psuć Twoich zasad)
  }

  async function showLogo() {
    await devices.sendDisplayCmd("MODE GRA");
    await devices.sendDisplayCmd("LOGO ANIMIN rain right 80");
  }

  async function hide() {
    await devices.sendDisplayCmd("HIDE ANIMOUT rain left 80");
  }

  return { gameReady, showLogo, hide };
}
