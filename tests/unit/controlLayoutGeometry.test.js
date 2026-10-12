import { test } from 'node:test';
import assert from 'node:assert/strict';

const modulePromise = import('../../web/control/js/layoutGeometry.js');

test('Control: dodatkowy próg trybu testowego nie blokuje zwykłego panelu', async () => {
  const { controlLayoutGeometry } = await modulePromise;
  const viewport = { width: 1100, height: 768 };
  assert.equal(controlLayoutGeometry(viewport).fits, true);
  assert.equal(controlLayoutGeometry({ ...viewport, testMode: true }).fits, false);
});

test('Control: za niskie okno wymaga guarda w obu układach', async () => {
  const { controlLayoutGeometry } = await modulePromise;
  for (const testMode of [false, true]) {
    assert.equal(controlLayoutGeometry({ width: 1920, height: 500, testMode }).fits, false);
  }
});

test('Control: trzy równe urządzenia 4:3 i lekkie skalowanie czytelnego panelu', async () => {
  const { controlLayoutGeometry, MIN_CONTROL_SCALE, DEVICE_VIEWPORT } = await modulePromise;
  for (const [width, height] of [[1280,720], [1366,768], [1400,900], [1920,1080]]) {
    const layout = controlLayoutGeometry({ width, height, testMode: true });
    assert.equal(layout.fits, true);
    assert.ok(layout.scale >= MIN_CONTROL_SCALE && layout.scale <= 1);
    assert.ok(Math.abs(layout.deviceHeight * 3 - layout.availableHeight) < 1e-8);
    assert.ok(Math.abs(layout.sidebarWidth / layout.deviceHeight - 4 / 3) < 1e-8);
    assert.ok(Math.abs(DEVICE_VIEWPORT.height * layout.deviceScale - layout.deviceHeight) < 1e-8);
    assert.ok(Math.abs(layout.virtualWidth * layout.scale - layout.panelWidth) < 1e-8);
    assert.ok(Math.abs(layout.virtualHeight * layout.scale - layout.availableHeight) < 1e-8);
  }
});

test('Control: brak miejsca nie daje ujemnych wymiarów lub nieskończoności', async () => {
  const { controlLayoutGeometry } = await modulePromise;
  const layout = controlLayoutGeometry({ width: 0, height: 0, testMode: true });
  assert.equal(layout.fits, false);
  for (const value of Object.values(layout)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0);
  }
});
