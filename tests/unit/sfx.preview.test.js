import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioContextStub } from "./helpers/web-audio.js";
import { isAnySfxPlaying, isSfxPlaying, loadSfxFromCloud, playSfxPreview, stopSfxPreview } from "../../web/shared/js/core/sfx.js";

test("sound previews stop the previous preview without changing gameplay playback policy", async () => {
  const saved = {
    Audio: globalThis.Audio,
    AudioContext: globalThis.AudioContext,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
  };
  class AudioStub {
    static instances = [];
    currentTime = 0;
    duration = 2;
    paused = true;
    ended = false;
    listeners = new Map();
    constructor() { this.src = ""; AudioStub.instances.push(this); }
    addEventListener(type, fn) { const handlers = this.listeners.get(type) || new Set(); handlers.add(fn); this.listeners.set(type, handlers); }
    emit(type) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this }); }
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
  }
  globalThis.Audio = AudioStub;
  globalThis.AudioContext = AudioContextStub;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.window = {};
  try {
    loadSfxFromCloud(new Map([["preview_a", "/preview-a.mp3"], ["preview_b", "/preview-b.mp3"]]));
    playSfxPreview("preview_a");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(isSfxPlaying("preview_a"), true);

    playSfxPreview("preview_b");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(isSfxPlaying("preview_a"), false);
    assert.equal(isSfxPlaying("preview_b"), true);

    const failedAudio = AudioStub.instances.find(audio => audio.src === "/preview-b.mp3");
    failedAudio.error = { code: 4 };
    failedAudio.emit("error");
    assert.equal(isSfxPlaying("preview_b"), false);
    assert.equal(isAnySfxPlaying(), false);

    stopSfxPreview("preview_b");
    assert.equal(isSfxPlaying("preview_b"), false);
  } finally { Object.assign(globalThis, saved); }
});
