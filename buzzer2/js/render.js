// buzzer2/js/render.js
// Stan przycisku wyprowadzony CAŁKOWICIE z game_state — brak własnego
// device_state (dzisiejsze teamA/teamB/state były osobno persystowane;
// tu kolory zespołów i tak są już w detail.display.colors, więc nic więcej
// nie trzeba trzymać per-urządzenie).

const $ = (id) => document.getElementById(id);

export const STATE = { OFF: "OFF", ON: "ON", PUSHED_A: "PUSHED_A", PUSHED_B: "PUSHED_B" };

export function deriveButtonState(row) {
  if (row.step !== "r_duel") return STATE.OFF;
  if (row.detail.settings?.physicalBuzzer) return STATE.OFF;
  const pressed = row.detail.rounds?.duel?.lastPressed;
  if (!pressed) return STATE.ON;
  return pressed === "A" ? STATE.PUSHED_A : STATE.PUSHED_B;
}

export function createButtonRenderer() {
  const offScreen = $("offScreen");
  const arena = $("arena");
  const btnA = $("btnA");
  const btnB = $("btnB");

  function applyColors(colors) {
    if (!colors) return;
    const root = document.documentElement;
    if (colors.A) root.style.setProperty("--team-a", colors.A);
    if (colors.B) root.style.setProperty("--team-b", colors.B);
  }

  function show(state) {
    const isOff = state === STATE.OFF;
    if (offScreen) offScreen.hidden = !isOff;
    if (arena) arena.hidden = isOff;

    btnA?.classList.remove("lit", "dim");
    btnB?.classList.remove("lit", "dim");
    if (btnA) btnA.disabled = true;
    if (btnB) btnB.disabled = true;
    if (isOff) return;

    if (state === STATE.ON) {
      if (btnA) btnA.disabled = false;
      if (btnB) btnB.disabled = false;
      btnA?.classList.add("dim");
      btnB?.classList.add("dim");
      return;
    }
    if (state === STATE.PUSHED_A) { btnA?.classList.add("lit"); btnB?.classList.add("dim"); return; }
    if (state === STATE.PUSHED_B) { btnB?.classList.add("lit"); btnA?.classList.add("dim"); }
  }

  function render(row) {
    applyColors(row.detail?.display?.colors);
    show(deriveButtonState(row));
  }

  return { render };
}
