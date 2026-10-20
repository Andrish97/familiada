// E21: wspólne limity treści gry i reguły znaków odpowiedzi.
// Znaki liczymy jak SQL char_length (pełne znaki Unicode, nie jednostki
// UTF-16). Dozwolone znaki odpowiedzi pochodzą z czcionki 5x7 Wyświetlacza
// (answer-charset.js, generowany); SQL ma ten sam zestaw i te same reguły:
// public.fam_answer_invalid_chars / public.fam_answer_clean.
import { ANSWER_CHARSET } from "./answer-charset.js?v=v2026-10-20T14100";

export const GAME_NAME_MAX = 80;
export const QUESTION_MAX = 100;
export const ANSWER_MAX = 17;
// Pole finału na Wyświetlaczu -- skrót dotyczy tylko prezentacji.
export const FINAL_DISPLAY_MAX = 11;

// Odpowiednik JS \s zapisany jawnie, żeby SQL miał identyczną klasę.
export const WHITESPACE_CLASS = "\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
const WS = new RegExp(`[${WHITESPACE_CLASS}]`, "u");
const WS_RUN = new RegExp(`[${WHITESPACE_CLASS}]+`, "gu");

const ALLOWED = new Set(Array.from(ANSWER_CHARSET));

export const charLength = (value) => Array.from(String(value ?? "")).length;

/** Początek napisu o długości najwyżej max pełnych znaków (bez rozcinania par UTF-16). */
export const clipChars = (value, max) => Array.from(String(value ?? "")).slice(0, max).join("");

export const nfc = (value) => String(value ?? "").normalize("NFC");

/** Czy znak (po NFC) ma glif w czcionce Wyświetlacza. Białe znaki są zawsze dozwolone. */
export const isAnswerChar = (ch) => WS.test(ch) || ALLOWED.has(ch);

/** Niedozwolone znaki odpowiedzi, bez powtórzeń, w kolejności wystąpienia. */
export function answerInvalidChars(value) {
  const out = [];
  for (const ch of Array.from(nfc(value))) {
    if (!isAnswerChar(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

/**
 * Oczyszczona odpowiedź (podliczanie ankiety tekstowej, transfer, migracja):
 * NFC, białe znaki → spacja, bez znaków spoza czcionki, pojedyncze spacje,
 * bez spacji na brzegach, najwyżej 17 znaków. Może zwrócić "".
 */
export function cleanAnswerText(value) {
  const kept = Array.from(nfc(value)).filter(isAnswerChar).join("");
  return clipChars(kept.replace(WS_RUN, " ").trim(), ANSWER_MAX).trim();
}

/** Wpis z pola odpowiedzi: NFC i limit 17 (bez usuwania znaków -- to robi walidacja). */
export const limitAnswerInput = (value) => clipChars(nfc(value), ANSWER_MAX);

export const limitQuestionInput = (value) => clipChars(nfc(value), QUESTION_MAX);
