// js/core/text-import.js

/**
 * Format:
 *  @Nazwa gry (opcjonalnie, tylko przed pierwszym pytaniem)
 *  #Pytanie...
 *  1 Odpowiedź /punkty (punkty opcjonalne)
 *
 * Zwraca:
 *  { ok, error, name, items }
 *  gdzie items = [{ qText, answers:[{text, points|null}] }]
 */
export function parseQaText(raw) {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  const items = [];
  let cur = null;
  let name = "";

  const pushCur = () => {
    if (cur && cur.qText.trim()) items.push(cur);
    cur = null;
  };

  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];

    // taby -> spacje, trim boków
    line = line.replace(/\t+/g, " ").trim();
    if (!line) continue;

    // nazwa gry: tylko przed pierwszym pytaniem
    if (!items.length && !cur) {
      const mName = line.match(/^@\s*(.+)$/);
      if (mName) {
        name = String(mName[1] ?? "").trim();
        continue;
      }
    }

    // pytanie (#)
    const mQ = line.match(/^#+\s*(.+)$/);
    if (mQ) {
      pushCur();
      cur = { qText: (mQ[1] || "").trim(), answers: [] };
      continue;
    }

    // odpowiedź
    if (!cur) {
      return {
        ok: false,
        error: `Błąd układu: odpowiedź przed pierwszym pytaniem (linia ${li + 1}).`,
        name,
        items: [],
      };
    }

    // rozbij "tekst / punkty"
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
        left = line; // jeśli po / nie ma liczby -> traktuj całe jako tekst
        pts = null;
      }
    }

    // usuń prefix typu "1.", "2)", "3 -" itd.
    left = left.replace(/^\s*\d+\s*[\.\)\-:]*\s*/g, "").trim();

    const aText = left.trim();
    if (!aText) continue;

    cur.answers.push({ text: aText, points: pts });
  }

  pushCur();

  if (!items.length) {
    return { ok: false, error: "Brak pytań. Pamiętaj o liniach zaczynających się od #.", name, items: [] };
  }

  return { ok: true, error: "", name, items };
}

/** Pomocnicze: wycina do max znaków (np. odpowiedź 17) */
export function clip(s, n) {
  const t = String(s ?? "");
  return t.length <= n ? t : t.slice(0, n);
}
