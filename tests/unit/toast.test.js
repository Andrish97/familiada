// Testy shared/js/core/toast.js — minimalna atrapa DOM (bez przeglądarki).
import { test } from "node:test";
import assert from "node:assert/strict";

function makeEl() {
  const classes = new Set();
  const attrs = {};
  return {
    id: "", className: "", children: [], textContent: "", isConnected: true, offsetWidth: 1,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
    },
    setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k],
    append(...n) { this.children.push(...n); }, addEventListener(ev, fn) { this.click = fn; },
  };
}

const body = { appended: [], appendChild(e) { this.appended.push(e); } };
globalThis.document = { createElement: makeEl, body };

const { toast, hideToast } = await import("../../web/shared/js/core/toast.js");

test("toast tworzy jeden kontener #appToast i zastępuje tekst", () => {
  toast("Pierwszy", { ms: 10_000 });
  toast("Drugi", { ms: 10_000 });
  assert.equal(body.appended.length, 1);
  const box = body.appended[0];
  assert.equal(box.id, "appToast");
  assert.equal(box.children[0].textContent, "Drugi");
  assert.equal(box.getAttribute("role"), "status");
  assert.ok(box.classList.contains("show"));
  hideToast();
});

test("błąd ma role=alert, klasę error i nie znika sam", async () => {
  toast("Błąd", { kind: "error", ms: 5 });
  const box = body.appended[0];
  assert.equal(box.getAttribute("role"), "alert");
  assert.ok(box.classList.contains("error"));
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(box.classList.contains("show"));
  box.click();
  assert.ok(!box.classList.contains("show"));
});

test("zwykły dymek znika po ms, pusty tekst jest ignorowany", async () => {
  toast("Info", { ms: 5 });
  const box = body.appended[0];
  assert.ok(!box.classList.contains("error"));
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(!box.classList.contains("show"));
  toast("   ");
  assert.ok(!box.classList.contains("show"));
});
