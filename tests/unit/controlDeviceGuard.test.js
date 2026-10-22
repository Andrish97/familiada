import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../web/shared/js/core/device-guard.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/m, '')
  .replace(/export /g, '');
const load = ({ screenWidth, screenHeight, width = screenWidth, height = screenHeight, touch = false, userAgent = '' }) => {
  const api = new Function('window', 'navigator', `${source}; return {getDeviceProfile, deviceGuardState, isPhoneScreen, MIN_WORK_HEIGHT};`)(
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
  // Telefon: za mały ekran = „Niedostępne na telefonie” (decyzja 2026-10-20).
  assert.equal(api.deviceGuardState(980), 'unsupported');
});

test('telefon portrait nie dostaje komunikatu o obrocie przy globalnej blokadzie landscape', () => {
  const api = load({ screenWidth: 390, screenHeight: 844, touch: true });
  // Ani obrót (landscape zablokowany), ani poszerzenie okna -- niedostępne na telefonie.
  assert.equal(api.deviceGuardState(700), 'unsupported');
  assert.equal(api.deviceGuardState(980), 'unsupported');
});

test('telefon landscape strony tylko dla tabletu/desktopu nie dostaje komunikatu obrotu', () => {
  const api = load({ screenWidth: 390, screenHeight: 844, width: 844, height: 390, touch: true });
  assert.equal(api.deviceGuardState(700, { formFactors: ['tablet', 'desktop'] }), 'unsupported');
  assert.equal(api.deviceGuardState(980), 'unsupported');
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

test('podzielony ekran tabletu blokuje tylko strony z progiem szerokości', () => {
  // iPad 820×1180 w poziomie, połowa ekranu (ok. 590 px szerokości).
  const side = load({ screenWidth: 1180, screenHeight: 820, width: 590, height: 820, touch: true });
  assert.equal(side.deviceGuardState(0), 'ok');
  assert.equal(side.deviceGuardState(640), 'narrow');
  // Podział góra/dół w pionie: pełna szerokość, niska wysokość.
  const top = load({ screenWidth: 820, screenHeight: 1180, width: 820, height: 560, touch: true });
  assert.equal(top.deviceGuardState(0), 'ok');
  assert.equal(top.deviceGuardState(700), 'narrow');
});

test('próg wysokości: tablet w poziomie z niskim viewportem dostaje prośbę o obrót', () => {
  // Tablet 1280×800, paski przeglądarki/powiększenie: viewport 1200×560 (decyzja 2026-10-22).
  const api = load({ screenWidth: 1280, screenHeight: 800, width: 1200, height: 560, touch: true });
  assert.equal(api.getDeviceProfile().formFactor, 'tablet');
  assert.equal(api.MIN_WORK_HEIGHT, 580);
  assert.equal(api.deviceGuardState(0), 'ok', 'strona bez progu wysokości działa');
  assert.equal(api.deviceGuardState(0, { minHeight: 580 }), 'rotate', 'w pionie strona się mieści');
  assert.equal(api.deviceGuardState(700, { minHeight: 580 }), 'rotate', 'krótszy bok 800 ≥ 700');
  // Próg 980 px nie zmieści się w pionie (krótszy bok 800) -- obrót nie pomoże.
  assert.equal(api.deviceGuardState(980, { minHeight: 580 }), 'small');
  // Wystarczająco wysoki widok nie jest blokowany.
  const tall = load({ screenWidth: 1280, screenHeight: 800, width: 1280, height: 700, touch: true });
  assert.equal(tall.deviceGuardState(0, { minHeight: 580 }), 'ok');
});

test('próg wysokości: niskie okno komputera to „Za małe okno”, nigdy obrót', () => {
  const low = load({ screenWidth: 1920, screenHeight: 1080, width: 1400, height: 550 });
  assert.equal(low.deviceGuardState(0, { minHeight: 580 }), 'small');
  assert.equal(low.deviceGuardState(0), 'ok');
  const ok = load({ screenWidth: 1920, screenHeight: 1080, width: 1400, height: 900 });
  assert.equal(ok.deviceGuardState(0, { minHeight: 580 }), 'ok');
  // Szerokość ma pierwszeństwo: za wąskie i za niskie okno to nadal „Za wąskie okno”.
  const both = load({ screenWidth: 1920, screenHeight: 1080, width: 900, height: 500 });
  assert.equal(both.deviceGuardState(980, { minHeight: 580 }), 'narrow');
  // Telewizor nie dostaje sugestii obrotu.
  const tv = load({ screenWidth: 1920, screenHeight: 1080, width: 1920, height: 500, userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5)' });
  assert.equal(tv.deviceGuardState(0, { minHeight: 580 }), 'small');
});

test('próg wysokości obowiązuje tylko w poziomie; telefon zachowuje dotychczasowe reguły', () => {
  // Pion (np. iPhone SE 375×553): układ jednokolumnowy przewija się -- bez blokady.
  const se = load({ screenWidth: 375, screenHeight: 667, width: 375, height: 553, touch: true });
  assert.equal(se.deviceGuardState(0, { minHeight: 580 }), 'ok');
  // Niskie okno komputera w pionie też nie jest blokowane wysokością.
  const portraitWin = load({ screenWidth: 1920, screenHeight: 1080, width: 500, height: 560 });
  assert.equal(portraitWin.deviceGuardState(0, { minHeight: 580 }), 'ok');
  // Telefon w poziomie: obrót jak dotąd.
  const phone = load({ screenWidth: 390, screenHeight: 844, width: 844, height: 390, touch: true });
  assert.equal(phone.deviceGuardState(0, { minHeight: 580 }), 'rotate');
  // Strona dopuszczająca telefon w poziomie: obrót pomoże (w pionie bez progu wysokości).
  assert.equal(phone.deviceGuardState(0, { allowPhoneLandscape: true, minHeight: 580 }), 'rotate');
  // Strona wymagająca poziomu na telefonie: obrót nie pomoże -- niedostępne na telefonie.
  assert.equal(phone.deviceGuardState(0, { allowPhoneLandscape: true, requirePhoneLandscape: true, minHeight: 580 }), 'unsupported');
});
