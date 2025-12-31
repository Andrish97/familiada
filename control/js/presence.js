// /familiada/control/js/presence.js

export function createPresence({ game, ui, store, devices }) {
  function setAllOffline() {
    ui.setDeviceBadgesUnavailable();

    store.state.flags.displayOnline = false;
    store.state.flags.hostOnline = false;
    store.state.flags.buzzerOnline = false;
  }

  async function start() {
    // Na start: wszystko "brak" / offline
    setAllOffline();

    // TODO: jeśli chcesz prawdziwy presence z Supabase,
    // trzeba tu podpiąć się do realnego kanału (sb().channel(...).on(...).subscribe()).
    // Na razie nic NIE SUBSKRYBUJEMY, żeby nie wywalać błędów.
  }

  return {
    start,
  };
}
