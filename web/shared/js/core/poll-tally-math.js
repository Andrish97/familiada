// Podliczanie ankiet po stronie przeglądarki — TYLKO podgląd na ekranie.
// Zapisu punktów dokonuje baza (migracja 315); te funkcje są wiernym portem
// jej algorytmów, żeby liczby widoczne przed „Zatwierdź” zgadzały się z wynikiem:
//   pointsPollPreview  <-  _poll_points_normalize   (ankieta punktowa)
//   textTallyPoints    <-  _poll_text_tally_points  (ankieta tekstowa)
// Czysty moduł bez zależności od DOM i bazy (testy jednostkowe: pollTallyMath.test.js).

export const TEXT_MAX_LEN = 17;
export const ANSWERS_MIN = 3;
export const ANSWERS_MAX = 6;

/**
 * Ankieta punktowa: liczby głosów odpowiedzi pytania (w kolejności odpowiedzi
 * z gry) -> punkty o sumie 100. Zero głosów liczy się jak 1, każda odpowiedź ma
 * min. 1 punkt, reszta metodą największych reszt (remis reszt: niższy numer
 * odpowiedzi). Gdy po podniesieniu do minimum suma przekracza 100, nadwyżkę
 * zabierają największe odpowiedzi (>1 pkt).
 * @param {number[]} counts
 * @returns {number[]} punkty, ta sama kolejność
 */
export function pointsPollPreview(counts) {
  const c = (counts || []).map((x) => {
    const n = Math.floor(Number(x) || 0);
    return n <= 0 ? 1 : n;
  });
  const total = c.reduce((s, x) => s + x, 0);
  if (!total) return c.map(() => 0);

  const rows = c.map((cnt, i) => {
    const fl = Math.floor((100 * cnt) / total);
    return { i, fl, rem: (100 * cnt) % total, p0: Math.max(1, fl) };
  });
  const diff = 100 - rows.reduce((s, r) => s + r.p0, 0);
  const out = rows.map((r) => r.p0);

  if (diff > 0) {
    // największe reszty (frac = rem / total, wspólny mianownik), remis -> niższy numer
    [...rows].sort((a, b) => b.rem - a.rem || a.i - b.i).slice(0, diff).forEach((r) => { out[r.i] += 1; });
  } else if (diff < 0) {
    // zabieranie: największe p0, potem najmniejsza reszta, potem WYŻSZY numer
    [...rows]
      .filter((r) => r.p0 > 1)
      .sort((a, b) => b.p0 - a.p0 || a.rem - b.rem || b.i - a.i)
      .slice(0, -diff)
      .forEach((r) => { out[r.i] -= 1; });
  }
  return out;
}

/**
 * Ankieta tekstowa: odpowiedzi pytania [{text, count}] (po scaleniu przez
 * właściciela) -> wybrane odpowiedzi z punktami. Reguły jak w bazie:
 *  - tekst przycięty (trim) do 17 znaków; puste i count <= 0 odpadają;
 *  - duplikaty (bez względu na wielkość liter, po przycięciu) sumowane,
 *    tekst i pozycja pierwszego wystąpienia;
 *  - punkty metodą największych reszt do sumy 100 (remis reszt: wcześniejsza pozycja);
 *  - zostają odpowiedzi z >= 3 pkt, najwyżej 6, od największych;
 *  - remisy punktów rozbijane w dół (p--), by żadne dwie odpowiedzi nie miały
 *    tych samych punktów (suma może być wtedy mniejsza od 100).
 * @param {{text:string,count:number}[]} answers
 * @returns {{idx:number,text:string,points:number}[]} idx = pozycja pierwszego
 *   wystąpienia w wejściu (0-based), kolejność wyjścia: od największych punktów
 */
export function textTallyPoints(answers) {
  const groups = new Map();
  (answers || []).forEach((a, idx) => {
    const text = String(a?.text ?? "").trim().slice(0, TEXT_MAX_LEN);
    const cnt = typeof a?.count === "number" && Number.isFinite(a.count) ? Math.max(0, Math.floor(a.count)) : 0;
    if (!text || cnt <= 0) return;
    const key = text.toLowerCase();
    const g = groups.get(key);
    if (g) g.cnt += cnt;
    else groups.set(key, { idx, text, cnt });
  });

  const list = [...groups.values()];
  const total = list.reduce((s, g) => s + g.cnt, 0);
  if (!total) return [];

  const f = list.map((g) => ({ ...g, fl: Math.floor((100 * g.cnt) / total), rem: (100 * g.cnt) % total }));
  const diff = 100 - f.reduce((s, g) => s + g.fl, 0);
  [...f]
    .sort((a, b) => b.rem - a.rem || a.idx - b.idx)
    .forEach((g, k) => { g.fidx = k + 1; });
  f.forEach((g) => { g.pts = g.fl + (g.fidx <= diff ? 1 : 0); });

  const picked = f
    .filter((g) => g.pts >= ANSWERS_MIN)
    .sort((a, b) => b.pts - a.pts || a.fidx - b.fidx)
    .slice(0, ANSWERS_MAX);

  const used = new Set();
  return picked.map((g) => {
    let p = g.pts;
    while (p > 0 && used.has(p)) p--;
    used.add(p);
    return { idx: g.idx, text: g.text, points: p };
  });
}
