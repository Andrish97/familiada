// Wspólne przeliczenie ankiet punktowych i tekstowych.
// Udział liczymy od wszystkich głosów, zaokrąglamy do pełnego procentu,
// a odpowiedzi poniżej 3% pozostają widoczne, ale nie dostają punktów.

export const TEXT_MAX_LEN = 17;
export const ANSWERS_MIN = 3;
export const ANSWERS_MAX = 6;
export const MIN_ANSWER_PERCENT = 3;

function allocatePoints(counts) {
  const total = counts.reduce((s, n) => s + n, 0);
  if (!total) return counts.map(() => 0);

  const rows = counts.map((count, i) => {
    const scaled = 100 * count;
    return { i, floor: Math.floor(scaled / total), rem: scaled % total };
  });
  const remainder = 100 - rows.reduce((s, r) => s + r.floor, 0);
  const points = rows.map((r) => r.floor);
  [...rows].sort((a, b) => b.rem - a.rem || a.i - b.i)
    .slice(0, remainder)
    .forEach((r) => { points[r.i] += 1; });
  return points;
}

/**
 * Wynik dla odpowiedzi punktowych. `percent` to udział zaokrąglony od sumy
 * wszystkich głosów; poniżej 3% odpowiedź jest oznaczona jako pominięta.
 */
export function pointsPollAnalysis(counts) {
  const votes = (counts || []).map((x) => Math.max(0, Math.floor(Number(x) || 0)));
  const total = votes.reduce((s, n) => s + n, 0);
  const allocated = allocatePoints(votes);
  return votes.map((count, i) => {
    const percent = total ? Math.round((100 * count) / total) : 0;
    const skipped = percent < MIN_ANSWER_PERCENT;
    return { votes: count, percent, skipped, points: skipped ? 0 : allocated[i] };
  });
}

// Zachowuje prosty interfejs używany przez istniejące widoki.
export function pointsPollPreview(counts) {
  return pointsPollAnalysis(counts).map((row) => row.points);
}

/**
 * Pełne wiersze tekstowej ankiety z informacją o progu i punktacji.
 * Identyczne teksty (trim + bez wielkości liter) są liczone razem.
 */
export function textTallyAnalysis(answers) {
  const groups = new Map();
  (answers || []).forEach((a, idx) => {
    const text = String(a?.text ?? "").trim().slice(0, TEXT_MAX_LEN);
    const count = typeof a?.count === "number" && Number.isFinite(a.count)
      ? Math.max(0, Math.floor(a.count)) : 0;
    if (!text || count <= 0) return;
    const key = text.toLowerCase();
    const group = groups.get(key);
    if (group) group.count += count;
    else groups.set(key, { idx, text, count });
  });

  const rows = [...groups.values()];
  const total = rows.reduce((s, row) => s + row.count, 0);
  const allocated = allocatePoints(rows.map((row) => row.count));
  const analyzed = rows.map((row, i) => {
    const percent = total ? Math.round((100 * row.count) / total) : 0;
    return {
      ...row,
      percent,
      points: allocated[i],
      belowThreshold: percent < MIN_ANSWER_PERCENT,
      scored: false,
    };
  });

  const candidates = analyzed
    .filter((row) => !row.belowThreshold)
    .sort((a, b) => b.points - a.points || a.idx - b.idx)
    .slice(0, ANSWERS_MAX);

  const used = new Set();
  for (const row of candidates) {
    let points = row.points;
    while (points > 0 && used.has(points)) points -= 1;
    used.add(points);
    row.points = points;
    row.scored = true;
  }

  return analyzed;
}

/**
 * Lista odpowiedzi, które zostaną zapisane jako punktowane.
 * Zachowuje interfejs używany przez walidację i zapis.
 */
export function textTallyPoints(answers) {
  return textTallyAnalysis(answers)
    .filter((row) => row.scored)
    .map(({ idx, text, points }) => ({ idx, text, points }));
}
