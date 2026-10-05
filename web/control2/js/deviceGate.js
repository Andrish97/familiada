// Presence is independent of game state; reconnect resumes the same game.
export function missingDevices(state, flags) {
  if (!state.locks?.gameStarted || state.locks?.gameEnded) return [];
  return [
    ["display", true],
    ["host", !state.settings?.noHostTablet],
    ["buzzer", !state.settings?.physicalBuzzer],
  ].filter(([kind, required]) => required && !flags[kind]).map(([kind]) => kind);
}
