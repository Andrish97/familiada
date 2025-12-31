// /familiada/js/pages/control/presence.js
import { sb } from "/familiada/js/core/supabase.js";

const ONLINE_MS = 15_000;
const POLL_MS = 3_000;

export function createPresence({ game, ui, store, devices }) {
  let timer = null;
  let stopFlag = false;

  function fmtAgo(ts) {
    if (!ts) return "—";
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t)) return "—";
    const diff = Date.now() - t;
    if (diff < 0) return "przed chwilą";
    const sec = Math.floor(diff / 1000);
    if (sec < 5) return "teraz";
    if (sec < 60) return `${sec}s temu`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min temu`;
    const h = Math.floor(min / 60);
    return `${h} h temu`;
  }

  async function pollOnce() {
    try {
      const { data, error } = await sb()
        .from("device_presence")
        .select("device_kind,last_seen_at")
        .eq("game_id", game.id);

      if (error) throw error;

      const now = Date.now();
      const base = {
        display: { on: false, seen: "brak" },
        host:    { on: false, seen: "brak" },
        buzzer:  { on: false, seen: "brak" },
      };

      for (const row of data || []) {
        const kind = row.device_kind;
        const ts = row.last_seen_at ? new Date(row.last_seen_at).getTime() : NaN;
        if (!["display", "host", "buzzer"].includes(kind)) continue;
        const age = Number.isFinite(ts) ? now - ts : Infinity;
        const online = age <= ONLINE_MS;
        base[kind] = {
          on: online,
          seen: fmtAgo(row.last_seen_at),
        };
      }

      store.setOnlineFlags({
        displayOnline: base.display.on,
        hostOnline: base.host.on,
        buzzerOnline: base.buzzer.on,
      });

      ui.setDeviceBadges({
        display: base.display,
        host: base.host,
        buzzer: base.buzzer,
      });

      // Po pierwszym pojawieniu się wyświetlacza – jednorazowo wyślij APP BLACK
      if (base.display.on && !store.state.flags.sentBlackAfterDisplayOnline) {
        try {
          await devices.sendDisplayCmd("APP BLACK");
          store.markSentBlackAfterDisplayOnline();
        } catch (e) {
          // nie wysadzamy całego presence, najwyżej braknie czarnego ekranu
          console.error("send APP BLACK failed", e);
        }
      }
    } catch (e) {
      console.error("presence poll error", e);
      ui.showAlert("Problem z odczytem statusu urządzeń.");
      ui.setDeviceBadgesUnavailable();
    }
  }

  async function loop() {
    while (!stopFlag) {
      await pollOnce();
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  async function start() {
    stopFlag = false;
    ui.setDeviceBadgesUnavailable();
    await pollOnce();
    if (!timer) {
      // lecimy w tle w prostym setTimeout-loopie
      timer = loop();
    }
  }

  function stop() {
    stopFlag = true;
  }

  return {
    start,
    stop,
  };
}
