import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../web/shared/js/core/device-guard.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/m, '')
  .replace(/export /g, '');
const load = ({ screenWidth, screenHeight, width = screenWidth, height = screenHeight, touch = false, userAgent = '' }) => {
  const api = new Function('window', 'navigator', `${source}; return {getDeviceProfile, deviceGuardState, isPhoneScreen};`)(
    { innerWidth: width, innerHeight: height, screen: { width: screenWidth, height: screenHeight }, matchMedia: (query) => ({ matches: query.includes('hover') ? !touch : touch }) },
    { maxTouchPoints: touch ? 1 : 0, userAgent },
  );
  return api;
};

test('tablet portrait jest tabletem; obrót wystarcza dla progu 980 px', () => {
  const api = load({ screenWidth: 820, screenHeight: 1180, touch: true });
  assert.deepEqual(api.getDeviceProfile(), {
    formFactor: 'tablet', orientation: 'portrait', viewportWidth: 820, viewportHeight: 1180,
    screenShortSide: 820, screenLongSide: 1180, screenPixelWidth: 820, screenPixelHeight: 1180,
    touch: true, hasTouch: true, isTv: false,
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

test('iPad mini jest osobnym stanem za małego ekranu dla Display i ankiety QR', () => {
  const api = load({ screenWidth: 744, screenHeight: 1133, touch: true });
  assert.equal(api.deviceGuardState(980, { formFactors: ['desktop', 'tablet'], minScreenShortSide: 800 }), 'screen');
});

test('Host i Buzzer dopuszczają telefon w poziomie, a strona TV rozpoznaje telewizor', () => {
  const phone = load({ screenWidth: 390, screenHeight: 844, width: 844, height: 390, touch: true });
  assert.equal(phone.deviceGuardState(0, { formFactors: ['phone', 'tablet'], requiresTouch: true, allowPhoneLandscape: true }), 'ok');
  const tv = load({ screenWidth: 1920, screenHeight: 1080, userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5)' });
  assert.equal(tv.getDeviceProfile().formFactor, 'tv');
});

test('tablet w pionie z podzielonym ekranem: obrót tylko gdy po nim kolumna będzie dość szeroka', () => {
  // iPad Pro 1024×1366, połowa ekranu w pionie (512 px): po obrocie ok. 683 px.
  const pro = load({ screenWidth: 1024, screenHeight: 1366, width: 512, height: 1366, touch: true });
  assert.equal(pro.deviceGuardState(640), 'rotate');
  assert.equal(pro.deviceGuardState(980), 'narrow');
  // iPad 820×1180, połowa w pionie (410 px): po obrocie ok. 590 px -- za mało na 640.
  const ipad = load({ screenWidth: 820, screenHeight: 1180, width: 410, height: 1180, touch: true });
  assert.equal(ipad.deviceGuardState(640), 'narrow');
  // iPad w poziomie, połowa ekranu (590×820): kolumna wyższa niż szersza, ale obrót by ją zwęził.
  const landscape = load({ screenWidth: 1180, screenHeight: 820, width: 590, height: 820, touch: true });
  assert.equal(landscape.deviceGuardState(640), 'narrow');
});
