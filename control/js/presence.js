import { sb } from "/familiada/js/core/supabase.js";

// ================== KOMUNIKATY (PRESENCE) ==================
const PRESENCE_MSG = {
  SINCE_NONE: "—",
  SINCE_LABEL: (seconds) => `${seconds}s temu`,
  ALERT_DROPPED: (label) =>
    `Uwaga: ${label} rozłączony. Sprawdź połączenie z internetem na urządzeniu.`,
  NO_TABLE: "Brak tabeli device_presence.",
};
// ===========================================================

const ONLINE_MS = 12_000;

function fmtSince(ts) {
  if (!ts) return PRESENCE_MSG.SINCE_NONE;
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return PRESENCE_MSG.SINCE_LABEL(s);
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
      ui.showAlert(PRESENCE_MSG.ALERT_DROPPED(label));
    }
  }

  async function tick() {
    const res = await fetchPresenceSafe();
    if (!res.ok) {
      ui.setDeviceBadgesUnavailable();
      store.setOnlineFlags({ display: false, host: false, buzzer: false });
      ui.setMsg("msgDevices", PRESENCE_MSG.NO_TABLE);
      return;
    }

    const d = pickNewest(res.rows, "display");
    const h = pickNewest(res.rows, "host");
    const b = pickNewest(res.rows, "buzzer");

    const dOn = isOnline(d);
    const hOn = isOnline(h);
    const bOn = isOnline(b);

    // poprzednie flagi (PRZED aktualizacją setOnlineFlags)
    const prevFlags = { ...(store.state.flags || {}) };

    // spadki online -> alert
    alertIfDropped(prevFlags.displayOnline, dOn, "Wyświetlacz");
    alertIfDropped(prevFlags.hostOnline, hOn, "Prowadzący");
    alertIfDropped(prevFlags.buzzerOnline, bOn, "Przycisk");

    ui.setDeviceBadges({
      display: { on: dOn, seen: fmtSince(d?.last_seen_at) },
      host: { on: hOn, seen: fmtSince(h?.last_seen_at) },
      buzzer: { on: bOn, seen: fmtSince(b?.last_seen_at) },
    });

    // *** stan zerowy po świeżym podpięciu (logika jak była) ***

    // Host: SET "" + HIDE przy przejściu offline -> online
    if (hOn && !prevFlags.hostOnline) {
      try {
        await devices.sendHostCmd('SET ""');
        await devices.sendHostCmd("HIDE");
      } catch {}
    }

    // Buzzer: OFF przy przejściu offline -> online
    if (bOn && !prevFlags.buzzerOnline) {
      try {
        await devices.sendBuzzerCmd("OFF");
      } catch {}
    }

    // Display: po pierwszym podpięciu -> APP BLACK (raz w życiu gry)
    if (dOn && !store.state.flags.sentBlackAfterDisplayOnline) {
      try {
        await devices.sendDisplayCmd("APP BLACK");
        store.markSentBlackAfterDisplayOnline();
      } catch {}
    }

    // *** flush kolejek po przejściu offline -> online ***

    if (!prevFlags.displayOnline && dOn) {
      try {
        await devices.flushQueued("display");
      } catch {}
    }

    if (!prevFlags.hostOnline && hOn) {
      try {
        await devices.flushQueued("host");
      } catch {}
    }

    if (!prevFlags.buzzerOnline && bOn) {
      try {
        await devices.flushQueued("buzzer");
      } catch {}
    }

    // Na końcu aktualizujemy flagi online
    store.setOnlineFlags({ display: dOn, host: hOn, buzzer: bOn });
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
