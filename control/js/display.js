// control/js/display.js
export function createDisplay({ devices, store }) {
  function q(s) {
    return String(s ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  async function gameReady(teamA, teamB) {
    await devices.sendDisplayCmd("MODE GRA");     // APP=GRA
    await devices.sendDisplayCmd("MODE BLANK");  // scene=BLANK
    await devices.sendDisplayCmd(`LONG1 "${q(teamA)}"`);
    await devices.sendDisplayCmd(`LONG2 "${q(teamB)}"`);
  }

  return { gameReady };
}
