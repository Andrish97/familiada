// /familiada/js/pages/control/presence.js
import { sb } from "/familiada/js/core/supabase.js";

export function createPresence({ game, ui, store, devices }) {
  // jak długo urządzenie jest uznawane za "online" (ms)
  const ONLINE_MS = 15000;
  const POLL_MS = 5000;

  let timer = null;

  function formatSeen(iso) {
    if (!iso) return "brak";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "brak";
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    } catch {
      return "brak";
    }
  }

  async function pollOnce() {
    if (!game?.id) return;

    try {
      const { data, error } = await sb()
        .from("device_presence")
        .select("*")
        .eq("game_id", game.id);

      if (error) throw error;

      const now = Date.now();

      let displayOn = false;
      let hostOn = false;
      let buzzerOn = false;

      let seenDisplay = null;
      let seenHost = null;
      let seenBuzzer = null;

      for (const row of data || []) {
        // próbujemy odczytać "rodzaj" z device_id
        const rawId = String(row.device_id ?? "").toLowerCase();
        const lastSeenIso = row.last_seen_at || row.last_seen || row.seen_at || null;
        const t = lastSeenIso ? Date.parse(lastSeenIso) : NaN;
        const isOnline = Number.isFinite(t) && now - t < ONLINE_MS;

        if (rawId.includes("display")) {
          displayOn = displayOn || isOnline;
          seenDisplay = seenDisplay || lastSeenIso;
        } else if (rawId.includes("host")) {
          hostOn = hostOn || isOnline;
          seenHost = seenHost || lastSeenIso;
        } else if (rawId.includes("buzzer") || rawId.includes("button")) {
          buzzerOn = buzzerOn || isOnline;
          seenBuzzer = seenBuzzer || lastSeenIso;
        }
      }

      // zapis do store (bez kombinowania z metodami – prosto i skutecznie)
      const flags = store.state.flags || (store.state.flags = {});
      flags.displayOnline = displayOn;
      flags.hostOnline = hostOn;
      flags.buzzerOnline = buzzerOn;

      // odświeżamy badge w UI
      ui.setDeviceBadges({
        display: { on: displayOn, seen: formatSeen(seenDisplay) },
        host: { on: hostOn, seen: formatSeen(seenHost) },
        buzzer: { on: buzzerOn, seen: formatSeen(seenBuzzer) },
      });

      // przy okazji – przyciski zależne od online (żeby działało nawet
      // jeśli render() z app.js nie odpali od razu)
      ui.setEnabled("btnDevicesNext", displayOn);
      ui.setEnabled("btnQrToggle", displayOn);
      ui.setEnabled(
        "btnDevicesToAudio",
        displayOn && hostOn && buzzerOn
      );
    } catch (e) {
      console.warn("presence poll error", e);
      ui.setDeviceBadgesUnavailable();
    }
  }

  async function start() {
    // pierwszy strzał od razu
    await pollOnce();
    // potem co kilka sekund
    timer = setInterval(pollOnce, POLL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
  };
}
