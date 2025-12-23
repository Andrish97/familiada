// control/js/display.js
export function createDisplay({ devices, store }) {
  function q(s) {
    return String(s ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  async function gameReady(teamA, teamB) {
    // Bez LOGO/HIDE (u Ciebie “nieznana komenda”)
    await devices.sendDisplayCmd("MODE GRA");
    await devices.sendDisplayCmd(`LONG1 "${q(teamA)}"`);
    await devices.sendDisplayCmd(`LONG2 "${q(teamB)}"`);
  }

  return { gameReady };
}
