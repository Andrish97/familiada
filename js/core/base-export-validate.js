// js/core/base-export-validate.js
// Walidacja tworzenia/exportu gry na danych z pamięci (np. z bazy pytań),
// oparta o RULES/TYPES z game-validate.js, ale bez odpytywania DB.

import { TYPES, RULES } from "./game-validate.js";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function getQuestionsArray(input) {
  // akceptujemy: {questions:[...]} albo bezpośrednio [...]
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.questions)) return input.questions;
  return [];
}

function getOrd(q, fallback) {
  const v = q?.ord;
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : fallback;
}

function getAnswersArray(q) {
  // wspieramy różne shape’y payload:
  // q.answers (jak w imporcie gry) albo q.payload.answers (gdy trzymasz payload w qb_questions.payload)
  const a1 = q?.answers;
  const a2 = q?.payload?.answers;
  if (Array.isArray(a1)) return a1;
  if (Array.isArray(a2)) return a2;
  return [];
}

function getAnswerPoints(a) {
  // dopuszczamy fixed_points (Twój standard) oraz points jako ewentualny alias
  if (a && typeof a === "object") {
    if ("fixed_points" in a) return n(a.fixed_points);
    if ("points" in a) return n(a.points);
  }
  return 0;
}

function clampAnswersCountOk(cnt) {
  return cnt >= RULES.AN_MIN && cnt <= RULES.AN_MAX;
}

/**
 * Walidacja wybranych pytań pod export do wybranego typu gry.
 *
 * @param {string} gameType - jeden z TYPES.*
 * @param {Array|Object} questionsInput - tablica pytań lub {questions:[...]}
 * @returns {{ok:boolean, reason:string}}
 */
export function validateExport(gameType, questionsInput) {
  const qs = getQuestionsArray(questionsInput);

  if (!gameType) return { ok: false, reason: "Nie wybrano typu gry." };
  if (![TYPES.PREPARED, TYPES.POLL_TEXT, TYPES.POLL_POINTS].includes(gameType)) {
    return { ok: false, reason: "Nieznany typ gry." };
  }

  if (qs.length < RULES.QN_MIN) {
    return { ok: false, reason: `Musi być co najmniej ${RULES.QN_MIN} pytań (masz: ${qs.length}).` };
  }

  // poll_text: tylko ilość pytań
  if (gameType === TYPES.POLL_TEXT) {
    return { ok: true, reason: "" };
  }

  // poll_points: ilość pytań + odpowiedzi 3..6 (bo na co głosować)
  if (gameType === TYPES.POLL_POINTS) {
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      const ord = getOrd(q, i + 1);
      const ans = getAnswersArray(q);
      if (!clampAnswersCountOk(ans.length)) {
        return {
          ok: false,
          reason: `Pytanie #${ord}: musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi (masz: ${ans.length}).`,
        };
      }
    }
    return { ok: true, reason: "" };
  }

  // prepared: ilość pytań + 3..6 odpowiedzi + zasady punktów (0..100, suma<=100)
  if (gameType === TYPES.PREPARED) {
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      const ord = getOrd(q, i + 1);
      const ans = getAnswersArray(q);

      if (!clampAnswersCountOk(ans.length)) {
        return {
          ok: false,
          reason: `Pytanie #${ord}: musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi (masz: ${ans.length}).`,
        };
      }

      const pts = ans.map(getAnswerPoints);

      if (pts.some((p) => p < 0)) {
        return { ok: false, reason: `Pytanie #${ord}: punkty nie mogą być ujemne.` };
      }
      if (pts.some((p) => p > 100)) {
        return { ok: false, reason: `Pytanie #${ord}: odpowiedź nie może mieć > 100 pkt.` };
      }

      const sum = pts.reduce((s, x) => s + x, 0);
      if (sum > RULES.SUM_PREPARED) {
        return {
          ok: false,
          reason: `Pytanie #${ord}: suma punktów nie może przekroczyć ${RULES.SUM_PREPARED} (jest: ${sum}).`,
        };
      }
    }

    return { ok: true, reason: "" };
  }

  // teoretycznie nieosiągalne
  return { ok: false, reason: "Błąd walidacji." };
}

/**
 * Mały helper do UI: zwraca true/false bez reason.
 */
export function canExport(gameType, questionsInput) {
  return validateExport(gameType, questionsInput).ok;
}
