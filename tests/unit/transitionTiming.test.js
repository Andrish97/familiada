// Testy shared/transitionTiming.js — JEDEN silnik liczący rzeczywiste czasy
// dźwięku, używany zarówno przez control2/js/actionGate.js (blokada
// operatora) jak i display2/js/render.js (czas trwania animacji Displaya).
// getSfxDuration jest tu atrapą (sekundy, nie ms).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransitionTiming } from "../../shared/transitionTiming.js";

function makeTiming(durations = {}) {
  const getSfxDuration = async (key) => durations[key] ?? 0;
  return createTransitionTiming({ getSfxDuration });
}

test("dur(): realny czas trwania w ms (nie sekundy)", async () => {
  const t = makeTiming({ reveal: 0.7 });
  assert.equal(await t.dur("reveal"), 700);
});

test("dur(): brak klucza => 0, bez wywołania getSfxDuration", async () => {
  const t = makeTiming({ reveal: 0.7 });
  assert.equal(await t.dur(null), 0);
  assert.equal(await t.dur(undefined), 0);
});

test("dur(): nieznany/zerowy czas => bezpieczny fallback 2000ms, nie 0", async () => {
  const t = makeTiming({});
  assert.equal(await t.dur("show_intro"), 2000);
});

// Real bug znaleziony w CI (3 testy zawiesiły się na pełny timeout, przycisk
// trwale disabled): js/core/sfx.js's getSfxDuration() potrafi zwrócić
// Infinity dla <audio>.duration (znane zachowanie Chromium dla MP3 bez
// poprawnego nagłówka Xing/VBR) — bez sufitu propagowało się to przez
// syncedMs()/sequentialMs() aż do control2/js/actionGate.js's armLock(),
// blokując operatora NA ZAWSZE (lockedUntil = Date.now() + Infinity).
test("dur(): Infinity (znany bug Chromium z metadanymi MP3) => bezpieczny fallback, NIE Infinity", async () => {
  const t = makeTiming({ round_transition: Infinity });
  const ms = await t.dur("round_transition");
  assert.ok(Number.isFinite(ms), "dur() nigdy nie zwraca Infinity/NaN");
  assert.equal(ms, 2000);
});

test("dur(): NaN => bezpieczny fallback, nie NaN", async () => {
  const t = makeTiming({ round_transition: NaN });
  const ms = await t.dur("round_transition");
  assert.ok(Number.isFinite(ms), "dur() nigdy nie zwraca Infinity/NaN");
  assert.equal(ms, 2000);
});

test("dur(): absurdalnie długi czas (np. błędne metadane) => przycięty do sufitu 30s", async () => {
  const t = makeTiming({ round_transition: 9999 });
  assert.equal(await t.dur("round_transition"), 30_000);
});

test("syncedMs(): Infinity w jednym z dwóch kluczy nie zaraża wyniku", async () => {
  const t = makeTiming({ round_transition: Infinity, reveal: 1.2 });
  const ms = await t.syncedMs("round_transition", "reveal");
  assert.ok(Number.isFinite(ms), "syncedMs() nigdy nie zwraca Infinity");
});

test("syncedMs(): dłuższy z dwóch wygrywa", async () => {
  const t = makeTiming({ round_transition: 0.3, reveal: 1.2 });
  assert.equal(await t.syncedMs("round_transition", "reveal"), 1200);
});

test("revealSyncSplit(): 'reveal' krótszy niż drugi dźwięk -> opóźniony start", async () => {
  const t = makeTiming({ round_transition: 2.5, reveal: 1 });
  const { offsetMs, revealMs } = await t.revealSyncSplit("round_transition");
  assert.equal(offsetMs, 1500, "round_transition gra 1500ms samo, ZANIM zacznie grać reveal");
  assert.equal(revealMs, 1000, "od momentu startu 'reveal' do końca obu — dokładnie jego własny czas");
  assert.equal(offsetMs + revealMs, 2500, "suma = pełny czas synced combo, ten sam co syncedMs()");
});

test("revealSyncSplit(): 'reveal' dłuższy lub równy -> zaczyna grać natychmiast (offset=0)", async () => {
  const t = makeTiming({ round_transition: 0.4, reveal: 1.1 });
  const { offsetMs, revealMs } = await t.revealSyncSplit("round_transition");
  assert.equal(offsetMs, 0);
  assert.equal(revealMs, 1100);
});

test("revealSyncSplit(): oba równe -> offset=0, revealMs=pełny czas", async () => {
  const t = makeTiming({ round_transition: 0.8, reveal: 0.8 });
  const { offsetMs, revealMs } = await t.revealSyncSplit("round_transition");
  assert.equal(offsetMs, 0);
  assert.equal(revealMs, 800);
});
