// E21: jedno źródło reguł gry po stronie JS (familijna-server/docs/reguly-gier-transfer-plan.md §3).
// Liczby i kody są te same co w public.game_rules_compute (migracja 404) --
// baza jest autorytatywna dla zapisu i przejść stanu, a ten moduł liczy
// podgląd dla treści jeszcze niezapisanej. Wynik tłumaczy game-validate.js.

/**
 * Typy gier:
 * - poll_text    => Ankieta tekstowa
 * - poll_points  => Punktacja
 * - prepared     => Preparowana (punkty ręczne: ≥4 na odpowiedź, suma ≤100)
 * - market       => kopia z Gier Społeczności (osobny typ w bazie, bez edycji)
 */
export const TYPES = {
  POLL_TEXT: "poll_text",
  POLL_POINTS: "poll_points",
  PREPARED: "prepared",
  MARKET: "market",
};

export const STATUS = {
  DRAFT: "draft",
  POLL_OPEN: "poll_open",
  POLL_STOPPED: "poll_stopped", // głosowanie zatrzymane, jeszcze niepodliczone (migracja 315)
  READY: "ready", // po podliczeniu ankiety / gotowe do gry
};

// Te same liczby co game_rules_compute (baza, migracja 404). Baza decyduje
// o dozwoleniu akcji i zapisu; tu podgląd (evaluateReadiness) i podpowiedzi.
export const RULES = {
  QN_MIN: 10,
  AN_MIN: 3,
  AN_MAX: 6,
  PTS_MIN: 4,
  SUM_PREPARED: 100,
};

/**
 * Gotowość treści względem typu -- ten sam algorytm i te same kody co
 * readiness w game_rules_compute (migracja 404), dla treści jeszcze
 * niezapisanej (np. zaznaczenie w Base Explorerze). Wynik informacyjny:
 * niczego nie blokuje przy tworzeniu szkicu.
 * prepared/market -- grywalność; poll_points -- uruchomienie ankiety
 * (≥10 pytań, 3–6 odpowiedzi); poll_text -- ≥10 pytań.
 * @param {string} type
 * @param {Array<{answers?: Array<{fixed_points?: number}>}>} questions
 * @returns {{ ok: boolean, issues: Array<{code: string, params: object}> }}
 */
export function evaluateReadiness(type, questions) {
  const qs = Array.isArray(questions) ? questions : [];
  const scored = type === TYPES.PREPARED || type === TYPES.MARKET;
  const issues = [];
  if (qs.length < RULES.QN_MIN) issues.push({ code: "minQuestions", params: { min: RULES.QN_MIN, n: qs.length } });
  if (type !== TYPES.POLL_TEXT) {
    qs.forEach((q, i) => {
      const ord = i + 1;
      const ans = Array.isArray(q?.answers) ? q.answers : [];
      const pts = ans.map((a) => Math.trunc(Number(a?.fixed_points) || 0));
      let issue = null;
      if (ans.length < RULES.AN_MIN || ans.length > RULES.AN_MAX) {
        issue = { code: "answersRange", params: { ord, min: RULES.AN_MIN, max: RULES.AN_MAX, n: ans.length } };
      } else if (scored) {
        const sum = pts.reduce((s, p) => s + p, 0);
        if (pts.some((p) => p < 0)) issue = { code: "negativePoints", params: { ord } };
        else if (pts.some((p) => p > 100)) issue = { code: "answerOver100", params: { ord } };
        else if (pts.some((p) => p < RULES.PTS_MIN)) issue = { code: "answerMinPoints", params: { ord, min: RULES.PTS_MIN } };
        else if (sum > RULES.SUM_PREPARED) issue = { code: "sumTooBig", params: { ord, max: RULES.SUM_PREPARED, sum } };
      }
      if (issue) issues.push(issue);
    });
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Lista warunków gotowości do podpowiedzi w edytorze -- te same reguły co
 * evaluateReadiness, ale każdy warunek osobno, z numerami pytań, które go
 * nie spełniają (jedno pytanie może łamać kilka warunków naraz).
 * prepared/market: pytania, odpowiedzi, próg punktów, suma; poll_points:
 * pytania, odpowiedzi; poll_text: pytania.
 * @returns {Array<{ key: "questions"|"answers"|"minPoints"|"sum", ok: boolean, ords: number[], params: object }>}
 */
export function readinessChecklist(type, questions) {
  const qs = Array.isArray(questions) ? questions : [];
  const scored = type === TYPES.PREPARED || type === TYPES.MARKET;
  const items = [{ key: "questions", ok: qs.length >= RULES.QN_MIN, ords: [], params: { min: RULES.QN_MIN, n: qs.length } }];
  if (type === TYPES.POLL_TEXT) return items;
  const bad = { answers: [], minPoints: [], sum: [] };
  qs.forEach((q, i) => {
    const ans = Array.isArray(q?.answers) ? q.answers : [];
    const pts = ans.map((a) => Math.trunc(Number(a?.fixed_points) || 0));
    if (ans.length < RULES.AN_MIN || ans.length > RULES.AN_MAX) bad.answers.push(i + 1);
    if (scored && pts.some((p) => p < RULES.PTS_MIN || p > 100)) bad.minPoints.push(i + 1);
    if (scored && pts.reduce((s, p) => s + p, 0) > RULES.SUM_PREPARED) bad.sum.push(i + 1);
  });
  items.push({ key: "answers", ok: !bad.answers.length, ords: bad.answers, params: { min: RULES.AN_MIN, max: RULES.AN_MAX } });
  if (scored) {
    items.push({ key: "minPoints", ok: !bad.minPoints.length, ords: bad.minPoints, params: { min: RULES.PTS_MIN } });
    items.push({ key: "sum", ok: !bad.sum.length, ords: bad.sum, params: { max: RULES.SUM_PREPARED } });
  }
  return items;
}
