// /familiada/js/pages/control/devices.js

export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl }) {
  const origin = window.location.origin.replace(/\/$/, "");
  const base = `${origin}/familiada`;

  const displayLink = `${base}/display.html?k=${encodeURIComponent(
    game.share_key_display
  )}`;
  const hostLink = `${base}/host.html?k=${encodeURIComponent(
    game.share_key_host
  )}`;
  const buzzerLink = `${base}/buzzer.html?k=${encodeURIComponent(
    game.share_key_buzzer
  )}`;

  function qrUrl(url) {
    return `${base}/api/qr?text=${encodeURIComponent(url)}`;
  }

  function initLinksAndQr() {
    const byId = (id) => document.getElementById(id);

    const displayInp = byId("displayLink");
    const hostInp = byId("hostLink");
    const buzzerInp = byId("buzzerLink");

    const imgDisplay = byId("qrDisplayImg");
    const imgHost = byId("qrHostImg");
    const imgBuzzer = byId("qrBuzzerImg");

    if (displayInp) displayInp.value = displayLink;
    if (hostInp) hostInp.value = hostLink;
    if (buzzerInp) buzzerInp.value = buzzerLink;

    if (imgDisplay) imgDisplay.src = qrUrl(displayLink);
    if (imgHost) imgHost.src = qrUrl(hostLink);
    if (imgBuzzer) imgBuzzer.src = qrUrl(buzzerLink);
  }

  // ===== realtime helpery =====

  async function sendDisplayCmd(cmd) {
    const text = String(cmd ?? "");
    console.log("[display] cmd:", text);
    await chDisplay.sendBroadcast("CMD", text);
  }

  async function sendHostCmd(cmd) {
    const text = String(cmd ?? "");
    console.log("[host] cmd:", text);
    await chHost.sendBroadcast("CMD", text);
  }

  async function sendBuzzerCmd(cmd) {
    const text = String(cmd ?? "");
    console.log("[buzzer] cmd:", text);
    await chBuzzer.sendBroadcast("CMD", text);
  }

  // Wyświetlenie QR na dużym ekranie:
  // przyjmuję protokół:
  //   MODE QR "<linkHost>" "<linkBuzzer>"
  // Jeśli w Twoim display.js jest inna komenda – zmieniasz tylko tu.
  async function sendQrToDisplay() {
    const cmd = `MODE QR "${hostLink}" "${buzzerLink}"`;
    await sendDisplayCmd(cmd);
  }

  // Aktywacja przycisku do pojedynku:
  // protokół do buzzer’a możesz dopasować do swojego buzzer.html
  async function enableBuzzerForDuel() {
    // przykład bardzo prosty:
    await sendBuzzerCmd("MODE DUEL");
    // informacja dla hosta (np. tekst na ekranie prowadzącego)
    await sendHostCmd("DUEL START");
  }

  return {
    initLinksAndQr,
    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,
    enableBuzzerForDuel,
  };
}
