import test from "node:test";
import assert from "node:assert/strict";
import { clipDisplayText } from "../../web/shared/js/gameplay/displayText.js";

for (const capacity of [11, 17]) {
  test(`board capacity ${capacity}: full text, word boundary, punctuation and cut word`, () => {
    const full = "A".repeat(capacity);
    assert.equal(clipDisplayText(full, capacity), full);
    assert.equal(clipDisplayText(full + " drugi", capacity), full);
    assert.equal(clipDisplayText(full + ", drugi", capacity), full);
    assert.equal(clipDisplayText(full + "—drugi", capacity), full);
    assert.equal(clipDisplayText(full + "B", capacity), "A".repeat(capacity - 3) + ".");
    assert.equal(clipDisplayText("A".repeat(capacity - 1) + " B", capacity), "A".repeat(capacity - 1) + " ");
  });
}

test("Polish and Ukrainian letters are preserved and decomposed accents occupy one slot", () => {
  assert.equal(clipDisplayText("zażółć gęślą", 17), "zażółć gęślą");
  assert.equal(clipDisplayText("телефон із зарядкою", 11), "телефон із ");
  assert.equal(clipDisplayText("n\u0301".repeat(11), 11), "ń".repeat(11));
});

test("a cut word loses one or two trailing vowels in Polish, English and Ukrainian", () => {
  for (const ending of ["a", "ąę", "OU", "ІЇ"]) {
    const consonants = "B".repeat(10 - [...ending].length);
    assert.equal(clipDisplayText(consonants + ending + "zzzz", 11), consonants + ".");
  }
  assert.equal(clipDisplayText("BBBBBBBBBBzz", 11), "BBBBBBBBBB.");
});

test("splitDisplayText: litery widoczne na Wyświetlaczu i te, które odpadną", async () => {
  const { splitDisplayText } = await import("../../web/shared/js/gameplay/displayText.js");
  assert.deepEqual(splitDisplayText("Sombrero", 11), { kept: "Sombrero", cut: "", shown: "Sombrero", clipped: false });
  // cięcie w słowie: 10 znaków, bez końcowej samogłoski, kropka
  assert.deepEqual(splitDisplayText("W Marcepanie", 11), { kept: "W Marcepan", cut: "ie", shown: "W Marcepan.", clipped: true });
  // 12. znak to spacja: pełne 11 znaków bez kropki
  assert.deepEqual(splitDisplayText("brak dez. u part.", 11), { kept: "brak dez. u", cut: " part.", shown: "brak dez. u", clipped: true });
  const s = splitDisplayText("W Murzasichlu", 11);
  assert.equal(s.kept + s.cut, "W Murzasichlu");
  assert.equal(s.shown, s.kept + ".");
});

test("displayTextSegments: znaki spoza fontu osobno, reszta jak na Wyświetlaczu", async () => {
  const { displayTextSegments } = await import("../../web/shared/js/gameplay/displayText.js");
  const ok = (ch) => ch !== "😀" && ch !== "€";
  assert.deepEqual(displayTextSegments("Kawa 😀 z mlekiem", 11, ok), [
    { kind: "kept", text: "Kawa " }, { kind: "bad", text: "😀" }, { kind: "bad", text: " " },
    { kind: "kept", text: "z ml" }, { kind: "cut", text: "ekiem" },
  ]);
  assert.deepEqual(displayTextSegments("Sombrero", 11, ok), [{ kind: "kept", text: "Sombrero" }]);
  assert.deepEqual(displayTextSegments("10€", 11, ok), [{ kind: "kept", text: "10" }, { kind: "bad", text: "€" }]);
});
