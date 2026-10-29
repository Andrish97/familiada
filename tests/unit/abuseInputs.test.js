// Wrogie i błędne dane wejściowe, które użytkownik może podać z pliku albo
// z pola tekstowego (sondy nadużyć: tests/sql/abuse-probes.sql), oraz zgodność
// zasad sprawdzanych w przeglądarce i na serwerze (migracja 514).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parseLogoPackage, sanitizeLogoFileImport, LOGO_NAME_MAX } from "../../web/logos/js/package.js";
import { parseQaText } from "../../web/shared/js/core/text-import.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
const OWN = "https://api.familijna.app/storage/v1/object/public/user-logos/u1/logo.png";

test(".famlogo: nazwa z pliku skracana do limitu pola i bazy", () => {
  const long = "x".repeat(500);
  assert.equal(parseLogoPackage({ kind: "GLYPH", name: long }, "Logo").name.length, LOGO_NAME_MAX);
  assert.equal(parseLogoPackage({ kind: "GLYPH", name: "  " }, "y".repeat(200)).name.length, LOGO_NAME_MAX);
  // Treść nazwy zostaje tekstem -- wyświetlanie ucieka znaki (esc w list.js).
  assert.equal(parseLogoPackage({ kind: "GLYPH", name: "<img src=x onerror=alert(1)>" }, "Logo").name, "<img src=x onerror=alert(1)>");
});

// Plik z dysku: parser wspólny + czyszczenie obrazów (transfer.js parseImport).
const fromFile = (obj) => sanitizeLogoFileImport(parseLogoPackage(obj, "Logo"));

test(".famlogo z pliku: obraz tylko osadzony albo z własnego Storage", () => {
  const pix = (source) => fromFile({ kind: "PIX", payload: { bits_b64: "AA==", source } }).payload.source;
  for (const url of ["https://evil.test/track.png", "http://api.familijna.app/storage/v1/object/public/user-logos/u1/a.png",
    "https://evil.test/storage/v1/object/public/other-bucket/a.png", "javascript:alert(1)", "//evil.test/a.png", `${OWN}?x=1`]) {
    assert.equal(pix({ mode: "IMAGE", imageUrl: url }).imageUrl, undefined, url);
  }
  assert.equal(pix({ mode: "IMAGE", imageUrl: OWN }).imageUrl, OWN);
  // Obraz osadzony w pliku ma pierwszeństwo przed adresem.
  assert.equal(pix({ mode: "IMAGE", imageUrl: OWN, imageData: "data:image/png;base64,AQID" }).imageUrl, undefined);
});

test(".famlogo z pliku: rysunek bez obrazów z obcych serwerów, osadzone zostają", () => {
  const fabricData = {
    version: "5.3.0",
    backgroundImage: { type: "image", src: "https://evil.test/bg.png" },
    overlayImage: { type: "image", src: "data:image/png;base64,AA==" },
    objects: [
      { type: "path", path: [["M", 0, 0]] },
      { type: "image", src: "https://evil.test/a.png" },
      { type: "image", src: "data:image/png;base64,AA==" },
      { type: "rect", fill: { type: "pattern", source: "https://evil.test/p.png" } },
      { type: "group", objects: [{ type: "rect" }, { src: "https://evil.test/c.png" }, { src: OWN }] },
    ],
  };
  const before = structuredClone(fabricData);
  const out = fromFile({ kind: "PIX", payload: { bits_b64: "AA==", source: { mode: "DRAW", fabricData } } }).payload.source.fabricData;
  assert.equal(out.backgroundImage, undefined);
  assert.equal(out.overlayImage.src, "data:image/png;base64,AA==");
  assert.deepEqual(out.objects.map((o) => o.type), ["path", "image", "rect", "group"]);
  assert.equal(out.objects[2].fill, undefined);
  assert.deepEqual(out.objects[3].objects, [{ type: "rect" }, { src: OWN }]);
  assert.doesNotMatch(JSON.stringify(out), /evil\.test/);
  assert.deepEqual(fabricData, before, "plik wejściowy bez zmian");
});

test("parser wspólny (kopie między kontami) nie usuwa adresów obrazów -- przenosi je serwer", () => {
  const source = { mode: "DRAW", imageUrl: "https://sender.example/i.png", fabricData: { objects: [{ src: "https://sender.example/i.png" }] } };
  const out = parseLogoPackage({ kind: "PIX", payload: { bits_b64: "AA==", source } }, "Logo").payload.source;
  assert.equal(out.imageUrl, "https://sender.example/i.png");
  assert.equal(out.fabricData.objects[0].src, "https://sender.example/i.png");
});

test("import TXT: format z podręcznika 7.7", () => {
  const r = parseQaText("@Nazwa gry\n# Pierwsze pytanie\nodpowiedź pierwsza / 40\nodpowiedź druga / 30\n# Drugie pytanie\n1. odpowiedź\n2) druga\n3 - trzecia\n4: czwarta\n");
  assert.equal(r.ok, true);
  assert.equal(r.name, "Nazwa gry");
  assert.deepEqual(r.items.map((q) => q.qText), ["Pierwsze pytanie", "Drugie pytanie"]);
  assert.deepEqual(r.items[0].answers, [{ text: "odpowiedź pierwsza", points: 40 }, { text: "odpowiedź druga", points: 30 }]);
  assert.deepEqual(r.items[1].answers.map((a) => a.text), ["odpowiedź", "druga", "trzecia", "czwarta"]);
  assert.ok(r.items[1].answers.every((a) => a.points === null));
});

test("import TXT: błędy i przypadki brzegowe", () => {
  assert.deepEqual(parseQaText("odpowiedź bez pytania\n# Pytanie"), { ok: false, code: "answerBeforeQuestion", params: { line: 1 }, name: "", items: [] });
  assert.deepEqual(parseQaText("\n\n   \n@Tylko nazwa\n"), { ok: false, code: "noQuestions", params: {}, name: "Tylko nazwa", items: [] });
  assert.equal(parseQaText("").ok, false);
  assert.equal(parseQaText(null).ok, false);
  // Windows/Mac końce linii, tabulatory, wiele #.
  const r = parseQaText("#Pyt A\r\n\todp\t/ 5\r## Pyt B\r\nx");
  assert.deepEqual(r.items.map((q) => q.qText), ["Pyt A", "Pyt B"]);
  assert.deepEqual(r.items[0].answers, [{ text: "odp", points: 5 }]);
  // @ po pierwszym pytaniu to zwykła odpowiedź, nie nazwa.
  const late = parseQaText("# P\n@nie nazwa");
  assert.equal(late.name, "");
  assert.equal(late.items[0].answers[0].text, "@nie nazwa");
  // Ukośnik bez liczby zostaje w tekście; liczba po ostatnim ukośniku to punkty.
  assert.deepEqual(parseQaText("# P\ntak/nie\na/b / 7").items[0].answers, [{ text: "tak/nie", points: null }, { text: "a/b", points: 7 }]);
  // Liczba na początku odpowiedzi jest traktowana jak numer (podręcznik: „100 lat” straci liczbę);
  // sam numer bez tekstu nie tworzy odpowiedzi.
  assert.deepEqual(parseQaText("# P\n100 lat\n2020\n3.").items[0].answers, [{ text: "lat", points: null }]);
  // Punkty spoza 0–100 parser oddaje bez zmian -- edytor je przycina (parsePoints).
  assert.deepEqual(parseQaText("# P\na / -5\nb / 1000\nc / 2.5").items[0].answers.map((a) => a.points), [-5, 1000, 2.5]);
  // Sam znak # bez treści nie jest pytaniem: przed pierwszym pytaniem import
  // wskazuje tę linię i nic nie zmienia, po pytaniu staje się odpowiedzią.
  assert.deepEqual(parseQaText("#\n# Właściwe").params, { line: 1 });
  assert.deepEqual(parseQaText("# Właściwe\n#").items[0].answers, [{ text: "#", points: null }]);
});

test("import TXT: duży plik nie zawiesza parsera", () => {
  const big = Array.from({ length: 5000 }, (_, i) => `# Pytanie ${i}\n` + Array.from({ length: 10 }, (_, j) => `${j + 1}. odp${j} / ${j}`).join("\n")).join("\n");
  const t0 = Date.now();
  const r = parseQaText(big);
  assert.equal(r.items.length, 5000);
  assert.equal(r.items[0].answers.length, 10);
  assert.ok(Date.now() - t0 < 2000);
});

test("zasady nazwy użytkownika i hasła: przeglądarka = serwer (514)", async () => {
  const auth = await read("web/shared/js/core/auth.js");
  const migs = (await readdir(new URL("supabase/migrations/", root))).filter((f) => /^\d{4}-\d\d-\d\d_\d+_abuse_guards\.sql$/.test(f));
  assert.equal(migs.length, 1);
  const sql = await read(`supabase/migrations/${migs[0]}`);
  // Nazwa: 3–20 znaków z [a-zA-Z0-9_.-], bez prefiksu guest_.
  assert.match(auth, /v\.length < 3\)/);
  assert.match(auth, /v\.length > 20\)/);
  assert.match(auth, /\/\^\[a-zA-Z0-9_\.-\]\+\$\/\.test\(v\)/);
  assert.match(auth, /startsWith\("guest_"\)/);
  assert.match(sql, /new\.username !~ '\^\[a-zA-Z0-9_\.-\]\{3,20\}\$'/);
  assert.match(sql, /lower\(new\.username\) like 'guest\\_%'/);
  // Hasło: ≥ 8, mała, wielka, cyfra, znak specjalny.
  for (const re of [/v\.length < 8\)/, /\/\[a-z\]\/\.test\(v\)/, /\/\[A-Z\]\/\.test\(v\)/, /\/\[0-9\]\/\.test\(v\)/, /\/\[\^A-Za-z0-9\]\/\.test\(v\)/]) assert.match(auth, re);
  for (const re of [/char_length\(p_password\) < 8/, /p_password !~ '\[a-z\]'/, /p_password !~ '\[A-Z\]'/, /p_password !~ '\[0-9\]'/, /p_password !~ '\[\^A-Za-z0-9\]'/]) assert.match(sql, re);
});

test("limit nazwy logo: pole, import i baza mają tę samą wartość", async () => {
  const list = await read("web/logos/js/list.js");
  assert.match(list, /maxLength: 80/);
  assert.equal(LOGO_NAME_MAX, 80);
  const sql = (await readdir(new URL("supabase/migrations/", root))).find((f) => /_abuse_guards\.sql$/.test(f));
  assert.match(await read(`supabase/migrations/${sql}`), /char_length\(coalesce\(new\.name, ''\)\) > 80/);
});
