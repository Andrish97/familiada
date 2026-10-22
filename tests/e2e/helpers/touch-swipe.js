// Przesunięcie palcem przez zdarzenia dotyku Chromium (CDP) — jak na telefonie,
// razem z pointer events, których słuchają karuzele (web/shared/js/core/swipe.js).
async function touchSwipe(page, locator, { dx = -160, steps = 8 } = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("touchSwipe: element niewidoczny");
  const x = box.x + box.width / 2 + (dx < 0 ? 60 : -60);
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / steps, y: y + i }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

module.exports = { touchSwipe };
