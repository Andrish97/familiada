// Testy web/shared/js/core/qr-code.js — lokalnego generatora kodów QR
// (Control: okno kodu urządzenia, Wyświetlacz: ekran QR). Macierz modułów
// musi być identyczna z biblioteką qrcode@1.5.3 (scripts/agent-tools/qrcode.esm.js)
// przy tej samej wersji i masce; wersja dobierana automatycznie tak samo.
import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "../../scripts/agent-tools/qrcode.esm.js";
import { qrMatrix, qrSvg, qrDataUrl } from "../../web/shared/js/core/qr-code.js";

const texts = [
  "a",
  "https://familijna.app/control/host/?id=00000000-0000-4000-8000-000000000103&key=ABCDEF123456",
  "https://familijna.app/connect/?code=482193&lang=pl",
  "zażółć gęślą jaźń — " + "x".repeat(300),
  "y".repeat(1200),
];

test("qrMatrix: te same moduły co biblioteka qrcode (L/M/Q/H, różne wersje)", () => {
  for (const ecl of ["L", "M", "Q", "H"]) {
    for (const text of texts) {
      const ref = QRCode.create([{ data: text, mode: "byte" }], { errorCorrectionLevel: ecl });
      assert.equal(qrMatrix(text, { ecl }).size, ref.modules.size, `wersja ${ecl} ${text.length}`);
      const mine = qrMatrix(text, { ecl, version: ref.version, mask: ref.maskPattern });
      const s = ref.modules.size;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        assert.equal(mine.modules[y][x], !!ref.modules.data[y * s + x], `${ecl} v${ref.version} (${x},${y})`);
      }
    }
  }
});

test("qrSvg/qrDataUrl: kwadratowe SVG z marginesem, gotowe do <img src>", () => {
  const { size } = qrMatrix(texts[1]);
  const svg = qrSvg(texts[1], { margin: 2 });
  assert.match(svg, new RegExp(`viewBox="0 0 ${size + 4} ${size + 4}"`));
  assert.ok(qrDataUrl(texts[1]).startsWith("data:image/svg+xml;charset=utf-8,"));
});
