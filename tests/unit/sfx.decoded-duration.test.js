import { test } from "node:test";
import assert from "node:assert/strict";
import { getSfxDurationAccurate, setSfxVariant } from "../../web/shared/js/core/sfx.js";

test("new gameplay measures decoded audio instead of provisional MP3 metadata, caches by source", async () => {
  const saved = { Audio: globalThis.Audio, OfflineAudioContext: globalThis.OfflineAudioContext, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  let decodes = 0;
  globalThis.Audio = class { constructor(src) { this.src = src; this.duration = 4.5; } pause() {} };
  globalThis.localStorage = { setItem() {}, getItem() { return null; } };
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1), json: async () => ({ categories: [{ key: "answer_correct", folder: "answer_correct" }] }) });
  globalThis.OfflineAudioContext = class { async decodeAudioData() { decodes++; return { duration: 1.824 }; } };
  try {
    const { loadSfxManifest } = await import("../../web/shared/js/core/sfx.js");
    await loadSfxManifest();
    setSfxVariant("answer_correct", "first.mp3");
    assert.equal(await getSfxDurationAccurate("answer_correct"), 1.824);
    assert.equal(await getSfxDurationAccurate("answer_correct"), 1.824);
    assert.equal(decodes, 1);
    setSfxVariant("answer_correct", "second.mp3");
    assert.equal(await getSfxDurationAccurate("answer_correct"), 1.824);
    assert.equal(decodes, 2);
  } finally { Object.assign(globalThis, saved); }
});
