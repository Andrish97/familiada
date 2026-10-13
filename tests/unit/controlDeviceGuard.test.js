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

test('telefon landscape pozostaje telefonem, a mała fizyczna szerokość jest osobnym stanem', () => {
  const api = load({ screenWidth: 390, screenHeight: 844, width: 844, height: 390, touch: true });
  assert.equal(api.getDeviceProfile().formFactor, 'phone');
  assert.equal(api.getDeviceProfile().orientation, 'landscape');
  assert.equal(api.isPhoneScreen(), true);
  assert.equal(api.deviceGuardState(700), 'rotate');
  assert.equal(api.deviceGuardState(980), 'screen');
});

test('telefon portrait nie dostaje komunikatu o obrocie przy globalnej blokadzie landscape', () => {
  const api = load({ screenWidth: 390, screenHeight: 844, touch: true });
  assert.equal(api.deviceGuardState(700), 'narrow');
  assert.equal(api.deviceGuardState(980), 'screen');
});

test('telefon landscape strony tylko dla tabletu/desktopu nie dostaje komunikatu obrotu', () => {
  const api = load({ screenWidth: 390, screenHeight: 844, width: 844, height: 390, touch: true });
  assert.equal(api.deviceGuardState(700, { formFactors: ['tablet', 'desktop'] }), 'unsupported');
  assert.equal(api.deviceGuardState(980), 'screen');
});

test('wymaganie dotyku ma pierwszeństwo dla komputera bez ekranu dotykowego', () => {
  const api = load({ screenWidth: 1920, screenHeight: 1080, width: 1280, height: 800 });
  assert.equal(api.deviceGuardState(0, { formFactors: ['phone', 'tablet'], requiresTouch: true }), 'touch');
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
  assert.equal(api.deviceGuardState(980), 'screen');
});
