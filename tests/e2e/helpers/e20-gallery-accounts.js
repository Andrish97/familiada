const path = require("node:path");
const os = require("node:os");
const { testAccountUsername } = require("./login");

const PREP_DIR = process.env.RUNNER_TEMP || os.tmpdir();

function galleryAccountNumbers(raw = process.env.E20_GALLERY_ACCOUNTS) {
  const values = String(raw || "1,2,3").split(",").map((value) => value.trim()).filter(Boolean);
  const numbers = values.map((value) => {
    if (!/^\d+$/.test(value)) throw new Error(`Nieprawidłowy numer konta galerii E20: ${value}`);
    const number = Number(value);
    testAccountUsername(number); // Waliduje konto i odrzuca konta wykluczone/rezerwowane.
    return number;
  });
  if (!numbers.length) throw new Error("Galeria E20 wymaga co najmniej jednego istniejącego konta testowego.");
  if (new Set(numbers).size !== numbers.length) throw new Error("Konta galerii E20 muszą być unikalne.");
  return numbers;
}

function galleryAccountPaths(accountNumber) {
  const account = `test${accountNumber}`;
  return {
    username: testAccountUsername(accountNumber),
    authState: path.join(PREP_DIR, `familiada-e20-gallery-${account}-auth.json`),
    fixtures: path.join(PREP_DIR, `familiada-e20-gallery-${account}-fixtures.json`),
  };
}

module.exports = { galleryAccountNumbers, galleryAccountPaths, PREP_DIR };
