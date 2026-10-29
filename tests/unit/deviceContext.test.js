import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBrowserContexts, getDevicePresenceMeta } from "../../web/shared/js/core/device-context.js";

test("device context only classifies a shared browser profile and tolerates unavailable storage", () => {
  const previousStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.document = { visibilityState: "visible", hasFocus: () => false };
  try {
    const first = getDevicePresenceMeta("game-a", { audio_unlocked: true });
    const sameGame = getDevicePresenceMeta("game-a");
    const otherGame = getDevicePresenceMeta("game-b");
    assert.equal(first.browser_context_id, sameGame.browser_context_id);
    assert.notEqual(first.browser_context_id, otherGame.browser_context_id);
    assert.equal(first.page_visibility, "visible");
    assert.equal(first.page_focused, false);
    assert.equal(first.audio_unlocked, true);
    assert.equal(compareBrowserContexts(first.browser_context_id, sameGame.browser_context_id), "same_profile");
    assert.equal(compareBrowserContexts(first.browser_context_id, otherGame.browser_context_id), "different_profile");
    assert.equal(compareBrowserContexts(first.browser_context_id, null), "unknown");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
