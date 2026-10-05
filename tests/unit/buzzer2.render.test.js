// Test dla buzzer2/js/render.js's deriveButtonState() — zgłoszony realny
// bug (nagranie): "naciskają, zaświeca ten który pierwszy nacisnął [...]
// operator to widzi i zatwierdza". Funkcja czytała WYŁĄCZNIE
// duel.firstTeam (ustawiane dopiero przez ACCEPT_BUZZ, po potwierdzeniu
// operatora) — surowe duel.lastPressed (zapisywane przez
// game_state_buzzer_press, zanim operator cokolwiek kliknie) było
// ignorowane, więc przycisk nie świecił się od razu po naciśnięciu.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveButtonState, STATE } from "../../web/buzzer2/js/render.js";

function row({ topCard = "rounds", physicalBuzzer = false, duel }) {
  return {
    top_card: topCard,
    detail: {
      settings: { physicalBuzzer },
      rounds: { duel },
    },
  };
}

test("deriveButtonState: OFF poza rundami/w finale", () => {
  assert.equal(deriveButtonState(row({ topCard: "final", duel: { enabled: true } })), STATE.OFF);
  assert.equal(deriveButtonState(row({ topCard: "devices", duel: { enabled: true } })), STATE.OFF);
});

test("deriveButtonState: OFF w trybie physicalBuzzer", () => {
  assert.equal(deriveButtonState(row({ physicalBuzzer: true, duel: { enabled: true } })), STATE.OFF);
});

test("deriveButtonState: OFF gdy pojedynek jeszcze nigdy się nie zaczął", () => {
  assert.equal(deriveButtonState(row({ duel: { enabled: false } })), STATE.OFF);
});

test("deriveButtonState: ON gdy pojedynek aktywny, nikt nie nacisnął", () => {
  assert.equal(deriveButtonState(row({ duel: { enabled: true, lastPressed: null, firstTeam: null } })), STATE.ON);
});

// To jest właśnie naprawiony bug: surowe naciśnięcie (lastPressed), BEZ
// potwierdzenia operatora (firstTeam wciąż null) — przycisk MUSI się już
// świecić.
test("deriveButtonState: PUSHED_x od razu po naciśnięciu, przed zatwierdzeniem operatora", () => {
  assert.equal(
    deriveButtonState(row({ duel: { enabled: true, lastPressed: "A", firstTeam: null } })),
    STATE.PUSHED_A
  );
  assert.equal(
    deriveButtonState(row({ duel: { enabled: true, lastPressed: "B", firstTeam: null } })),
    STATE.PUSHED_B
  );
});

test("deriveButtonState: zostaje PUSHED_x po zatwierdzeniu operatora (firstTeam ustawione)", () => {
  assert.equal(
    deriveButtonState(row({ duel: { enabled: true, lastPressed: "A", firstTeam: "A" } })),
    STATE.PUSHED_A
  );
});

test("deriveButtonState: wraca do ON po \"Ponów naciśnięcie\" (lastPressed wyczyszczone, firstTeam wciąż null)", () => {
  assert.equal(
    deriveButtonState(row({ duel: { enabled: true, lastPressed: null, firstTeam: null } })),
    STATE.ON
  );
});
