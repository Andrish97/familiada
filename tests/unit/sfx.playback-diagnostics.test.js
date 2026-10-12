import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSfxFromCloud, onSfxPlayback, playSfx } from "../../web/shared/js/core/sfx.js";

test("SFX playback reports only its actual start or failure without leaking rejected play promises", async () => {
  const saved = {
    Audio: globalThis.Audio, localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame, window: globalThis.window,
  };
  const events = [];
  class AudioStub {
    constructor(src) { this.src = src; this.duration = 2; this.paused = true; this.ended = false; }
    pause() { this.paused = true; }
    play() { this.paused = false; return this.src.includes("reject") ? Promise.reject(new DOMException("blocked", "NotAllowedError")) : Promise.resolve(); }
  }
  globalThis.Audio = AudioStub;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = {};
  try {
    loadSfxFromCloud(new Map([["diagnostic_ok", "/ok.mp3"], ["diagnostic_fail", "/reject.mp3"]]));
    const unsubscribe = onSfxPlayback(event => events.push(event));
    playSfx("diagnostic_ok");
    playSfx("diagnostic_fail");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(events.length, 2);
    assert.equal(events[0].key, "diagnostic_ok");
    assert.equal(events[0].failed, false);
    assert.equal(events[0].delayMs >= 0, true);
    assert.equal(events[1].key, "diagnostic_fail");
    assert.equal(events[1].failed, true);
    assert.equal(events[1].error, "NotAllowedError");
    unsubscribe();
  } finally { Object.assign(globalThis, saved); }
});
