import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../web/shared/js/core/device-guard.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/m, '')
  .replace(/export /g, '');
const load = ({ screenWidth, screenHeight, width = screenWidth, height = screenHeight, touch = false }) => {
  const api = new Function('window', 'navigator', `${source}; return {getDeviceProfile, deviceGuardState, isPhoneScreen};`)(
    { innerWidth: width, innerHeight: height, screen: { width: screenWidth, height: screenHeight }, matchMedia: () => ({ matches: touch }) },
    { maxTouchPoints: touch ? 1 : 0 },
  );
  return api;
};

test('tablet portrait jest tabletem; obrót wystarcza dla progu 980 px', () => {
  const api = load({ screenWidth: 820, screenHeight: 1180, touch: true });
  assert.deepEqual(api.getDeviceProfile(), {
    formFactor: 'tablet', orientation: 'portrait', viewportWidth: 820, viewportHeight: 1180,
    screenShortSide: 820, screenLongSide: 1180, touch: true,
  });
  assert.equal(api.isPhoneScreen(), false);
  assert.equal(api.deviceGuardState(980), 'rotate');
  assert.equal(api.deviceGuardState(700), 'ok');
});

test('telefon landscape pozostaje telefonem, ale może spełnić próg szerokości edytora', () => {
  const api = load({ screenWidth: 390, screenHeight: 844, width: 844, height: 390, touch: true });
  assert.equal(api.getDeviceProfile().formFactor, 'phone');
  assert.equal(api.getDeviceProfile().orientation, 'landscape');
  assert.equal(api.isPhoneScreen(), true);
  assert.equal(api.deviceGuardState(700), 'ok');
  assert.equal(api.deviceGuardState(980), 'narrow');
});

test('telefon portrait dostaje obrót tylko wtedy, gdy landscape spełni próg strony', () => {
  const api = load({ screenWidth: 390, screenHeight: 844, touch: true });
  assert.equal(api.deviceGuardState(700), 'rotate');
  assert.equal(api.deviceGuardState(980), 'narrow');
});

test('desktop z wąskim viewportem nie jest klasyfikowany jako telefon', () => {
  const api = load({ screenWidth: 1920, screenHeight: 1080, width: 800, height: 650 });
  assert.equal(api.getDeviceProfile().formFactor, 'desktop');
  assert.equal(api.deviceGuardState(980), 'narrow');
  assert.equal(api.deviceGuardState(700), 'ok');
});

test('desktop o niskim oknie ale szerokim viewportcie nie dostaje blokady telefonu', () => {
  const api = load({ screenWidth: 1280, screenHeight: 650, touch: false });
  assert.equal(api.getDeviceProfile().formFactor, 'desktop');
  assert.equal(api.deviceGuardState(980), 'ok');
});

test('dotykowy tablet bez wystarczająco szerokiego dłuższego boku dostaje stan narrow', () => {
  const api = load({ screenWidth: 700, screenHeight: 900, touch: true });
  assert.equal(api.getDeviceProfile().formFactor, 'tablet');
  assert.equal(api.deviceGuardState(980), 'narrow');
});
