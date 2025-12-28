import { sb } from "/familiada/js/core/supabase.js";

const ONLINE_MS = 12_000;

function fmtSince(ts) {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${s}s temu`;
}

export function createPresence({ game, ui, store, devices }) {
  let timer = null;

  async function fetchPresenceSafe() {
    const { data, error } = await sb()
      .from("device_presence")
      .select("device_type,device_id,last_seen_at")
      .eq("game_id", game.id);

    if (error) return { ok: false, rows: [], error };
    return { ok: true, rows: data || [], error: null };
  }

  function pickNewest(rows, t) {
    return (
      rows
        .filter((r) => String(r.device_type || "").toLowerCase() === t)
        .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null
    );
  }

  function isOnline(row) {
    if (!row?.last_seen_at) return false;
    return Date.now() - new Date(row.last_seen_at).getTime() < ONLINE_MS;
  }

  function alertIfDropped(prevOn, nowOn, label) {
    if (prevOn === true && nowOn === false) {
      ui.showAlert(`Uwaga: ${label} rozłączony. Sprawdź połączenie z internetem na urządzeniu.`);
    }
  }

  async function tick() {
    const res = await fetchPresenceSafe();
    if (!res.ok) {
      ui.setDeviceBadgesUnavailable();
      store.setOnlineFlags({ display: false, host: false, buzzer: false });
      ui.setMsg("msgDevices", "Brak tabeli device_presence.");
      return;
    }

    const d = pickNewest(res.rows, "display");
    const h = pickNewest(res.rows, "host");
    const b = pickNewest(res.rows, "buzzer");

    const dOn = isOnline(d);
    const hOn = isOnline(h);
    const bOn = isOnline(b);

    alertIfDropped(store.state.flags.displayOnline, dOn, "Wyświetlacz");
    alertIfDropped(store.state.flags.hostOnline, hOn, "Prowadzący");
    alertIfDropped(store.state.flags.buzzerOnline, bOn, "Przycisk");

    ui.setDeviceBadges({
      display: { on: dOn, seen: fmtSince(d?.last_seen_at) },
      host: { on: hOn, seen: fmtSince(h?.last_seen_at) },
      buzzer: { on: bOn, seen: fmtSince(b?.last_seen_at) },
    });

    store.setOnlineFlags({ display: dOn, host: hOn, buzzer: bOn });

    // after projector connected -> send BLACK once
    if (dOn && !store.state.flags.sentBlackAfterDisplayOnline) {
      (async () => {
        try {
          await devices.sendDisplayCmd("APP GAME");
          await devices.sendDisplayCmd("MODE BLANK");
          await devices.sendHostCmd('SET ""');
          await devices.sendHostCmd("HIDE");
          await devices.sendBuzzerCmd("OFF");
        } catch (_) {
          // to tylko init – w razie błędu po prostu pomijamy
        } finally {
          store.markSentBlackAfterDisplayOnline();
        }
      })();
    }
  }

  async function start() {
    await tick();
    timer = setInterval(tick, 1500);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  
    return { start, stop };
}
