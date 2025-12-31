// /familiada/js/pages/control/devices.js

// Parametry:
// - game: { id, share_key_display, share_key_host, share_key_buzzer, ... }
// - ui: createUI()
// - store: createStore() – na razie tu nie jest potrzebne, ale zostawiamy w sygnaturze
// - chDisplay / chHost / chBuzzer: kanały realtime z rt(...)
// - chControl: przekazywany z app.js, ale tutaj nie jest używany (można zostawić na przyszłość)
export function createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl }) {
  // --- pomocnicze: URL-e urządzeń ---

  function makeUrl(path, key) {
    const url = new URL(path, location.origin);
    url.searchParams.set("id", game.id);
    if (key) url.searchParams.set("k", key);
    return url.toString();
  }

  // UWAGA: ścieżki muszą się zgadzać z tym, jakie masz faktycznie w repo
  const displayUrl = makeUrl("/familiada/display.html", game.share_key_display);
  const hostUrl    = makeUrl("/familiada/host.html", game.share_key_host);
  const buzzerUrl  = makeUrl("/familiada/buzzer.html", game.share_key_buzzer);

  const urls = {
    display: displayUrl,
    host: hostUrl,
    buzzer: buzzerUrl,
  };

  // --- realtime: wysyłanie komend ---

  async function sendCmd(channel, event, line) {
    if (!channel) throw new Error("Brak kanału realtime.");
    const { error } = await channel.sendBroadcast(event, { line });
    if (error) throw error;
  }

  async function sendDisplayCmd(line) {
    await sendCmd(chDisplay, "DISPLAY_CMD", line);
  }

  async function sendHostCmd(line) {
    await sendCmd(chHost, "HOST_CMD", line);
  }

  async function sendBuzzerCmd(line) {
    await sendCmd(chBuzzer, "BUZZER_CMD", line);
  }

  // --- QR (obrazki w Control + ewentualnie modal) ---

  function qrSrc(rawUrl) {
    if (!rawUrl) return "";
    // Prosty zewnętrzny generator QR (bez back-endu na GitHub Pages)
    const enc = encodeURIComponent(rawUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${enc}`;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function initLinksAndQr() {
    // wpisz linki
    ui.setValue("displayLink", displayUrl);
    ui.setValue("hostLink", hostUrl);
    ui.setValue("buzzerLink", buzzerUrl);

    // ustaw obrazki QR
    ui.setImg("qrDisplayImg", qrSrc(displayUrl));
    ui.setImg("qrHostImg", qrSrc(hostUrl));
    ui.setImg("qrBuzzerImg", qrSrc(buzzerUrl));

    // przyciski "Otwórz"
    ui.on("devices.openDisplay", () => window.open(displayUrl, "_blank"));
    ui.on("devices.openHost", () => window.open(hostUrl, "_blank"));
    ui.on("devices.openBuzzer", () => window.open(buzzerUrl, "_blank"));

    // przyciski "Kopiuj"
    ui.on("devices.copyDisplay", async () => {
      const ok = await copyToClipboard(displayUrl);
      ui.setMsg("msgDevices", ok ? "Skopiowano." : "Nie mogę skopiować.");
    });
    ui.on("devices.copyHost", async () => {
      const ok = await copyToClipboard(hostUrl);
      ui.setMsg("msgDevices2", ok ? "Skopiowano." : "Nie mogę skopiować.");
    });
    ui.on("devices.copyBuzzer", async () => {
      const ok = await copyToClipboard(buzzerUrl);
      ui.setMsg("msgDevices2", ok ? "Skopiowano." : "Nie mogę skopiować.");
    });
  }

  // --- QR na wyświetlaczu (tryb MODE QR) ---

  function escQ(raw) {
    return String(raw ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r\n", "\n");
  }

  async function sendQrToDisplay() {
    // przełączenie sceny na ekran z QR
    await sendDisplayCmd("APP QR");
    // przekazujemy oba linki (host + buzzer)
    await sendDisplayCmd(
      `QR HOST "${escQ(urls.host)}" BUZZER "${escQ(urls.buzzer)}"`
    );
  }

  // --- Dane dla okienka (jeśli kiedyś użyjesz devices.showInfo) ---

  function getDeviceInfo(kind) {
    if (!urls[kind]) return null;

    return {
      url: urls[kind],
      qr: qrSrc(urls[kind]),
      label:
        kind === "display"
          ? "Wyświetlacz"
          : kind === "host"
          ? "Prowadzący"
          : kind === "buzzer"
          ? "Przycisk"
          : "Urządzenie",
    };
  }

  return {
    initLinksAndQr,
    sendDisplayCmd,
    sendHostCmd,
    sendBuzzerCmd,
    sendQrToDisplay,
    getDeviceInfo,
  };
}
