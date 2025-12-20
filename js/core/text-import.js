// js/core/text-import.js

/**
 * Parsuje tekst:
 *  - nazwa gry: linia zaczynająca się od @ (np. "@Moja Gra") — działa tylko PRZED pierwszym pytaniem
 *  - pytanie: linia z # (ignoruje spacje/taby przed #, między # a tekstem)
 *  - odpowiedź: opcjonalnie numer + separatory (.,), potem tekst, opcjonalnie /punkty
 *  - ignoruje spacje przed/po / oraz w okolicy numeru
 *
 * Zwraca { ok, error, items, name } gdzie:
 *  items = [{ qText, answers:[{text, points|null}] }]
 *  name = string | null
 */
export function parseQaText(raw) {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  const items = [];
  let cur = null;

  let name = null;
  let seenFirstQuestion = false;

  const pushCur = () => {
    if (cur && cur.qText.trim()) items.push(cur);
    cur = null;
  };

  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];

    line = line.replace(/\t+/g, " ").trim();
    if (!line) continue;

    // @Nazwa Gry (tylko przed pierwszym pytaniem)
    if (!seenFirstQuestion) {
      const mName = line.match(/^@\s*(.+)$/);
      if (mName) {
        const nm = String(mName[1] || "").trim();
        if (nm) name = nm;
        continue;
      }
    }

    // pytanie (#)
    const mQ = line.match(/^#+\s*(.+)$/);
    if (mQ) {
      seenFirstQuestion = true;
      pushCur();
      cur = { qText: (mQ[1] || "").trim(), answers: [] };
      continue;
    }

    // odpowiedź
    if (!cur) {
      return {
        ok: false,
        error: `Błąd układu: odpowiedź przed pierwszym pytaniem (linia ${li + 1}).`,
        items: [],
        name,
      };
    }

    // rozbij na "tekst / punkty"
    let left = line;
    let pts = null;

    const slashIdx = line.lastIndexOf("/");
    if (slashIdx >= 0) {
      const leftPart = line.slice(0, slashIdx).trim();
      const rightPart = line.slice(slashIdx + 1).trim();

      if (rightPart !== "" && /^-?\d+(\.\d+)?$/.test(rightPart)) {
        pts = Number(rightPart);
        left = leftPart;
      } else {
        left = line;
        pts = null;
      }
    }

    // usuń prefix typu: "1.", "2)", "3 -" itd.
    left = left.replace(/^\s*\d+\s*[\.\)\-:]*\s*/g, "").trim();

    const aText = left.trim();
    if (!aText) continue;

    cur.answers.push({ text: aText, points: pts });
  }

  pushCur();

  if (!items.length) {
    return {
      ok: false,
      error: "Brak pytań. Pamiętaj o liniach zaczynających się od #.",
      items: [],
      name,
    };
  }

  return { ok: true, error: "", items, name };
}

/**
 * Pomocnicze: wycina do max znaków (np. odpowiedź 17)
 */
export function clip(s, n) {
  const t = String(s ?? "");
  return t.length <= n ? t : t.slice(0, n);
}
