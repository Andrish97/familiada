// /familiada/control/js/presence.js

export function createPresence({ game, ui, store, devices }) {
  let stopFn = null;

  function updateBadges(state) {
    if (!state) {
      store.setPresenceUnavailable();
      ui.setDeviceBadgesUnavailable();
      return;
    }

    const { display, host, buzzer } = state;
    store.setOnlineFlags({
      display: display.on,
      host: host.on,
      buzzer: buzzer.on,
    });

    ui.setDeviceBadges({
      display,
      host,
      buzzer,
    });

    if (display.on && !store.state.flags.sentBlackAfterDisplayOnline) {
      devices.sendDisplayCmd("APP BLACK").catch(() => {});
      store.markSentBlackAfterDisplayOnline();
    }
  }

  async function start() {
    updateBadges(null);
    if (typeof devices.onPresenceUpdate === "function") {
      stopFn = devices.onPresenceUpdate((st) => {
        try {
          updateBadges(st);
        } catch {}
      });
    }
  }

  function stop() {
    if (stopFn) stopFn();
  }

  return {
    start,
    stop,
  };
}
