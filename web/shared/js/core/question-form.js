// js/core/question-form.js
// Wspólne dla obu miejsc, w których edytuje się pytanie z odpowiedziami:
// edytor gry (js/pages/editor.js, autozapis każdego pola) i modal pytania w
// bazie pytań (base-explorer/js/question-modal.js, jeden "Zapisz").
// Wcześniej każde miało własne limity i własną obsługę pola punktów -- w
// edytorze dało się wpisać 250 pkt i "-5", w modalu to samo pole ucinało do
// 0–100; modal zapisywał puste odpowiedzi i zdublowane numery, edytor nie.
//
// Liczby to te same co w bazie (CHECK-i tabel questions/answers, reguły w
// game_validate) -- tu tylko do pilnowania pól i podpowiedzi w UI; o tym,
// czy grę wolno otworzyć / grać, decyduje baza (js/core/game-validate.js).

import { RULES, TYPES } from "./game-validate.js?v=v2026-10-08T17272";
import { t } from "../../translation/translation.js?v=v2026-10-08T17272";
import { icon } from "./icons.js?v=v2026-10-08T17272";

export const LIMITS = {
  Q_TEXT: 200,   // questions_text_len
  A_TEXT: 17,    // answers_text_len
  AN_MIN: RULES.AN_MIN,
  AN_MAX: RULES.AN_MAX, // answers_ord_range
  PTS_MAX: 100,
  SUM_MAX: RULES.SUM_PREPARED,
};

/* ================= Tekst ================= */

// W trakcie pisania: tylko twardy limit, bez trim -- inaczej spacja na końcu
// znika przy każdej pauzie i słowa się sklejają.
export const clipQuestionText = (s) => String(s ?? "").slice(0, LIMITS.Q_TEXT);
export const clipAnswerText = (s) => String(s ?? "").slice(0, LIMITS.A_TEXT);

// Do zapisu.
export const normQuestionText = (s) => String(s ?? "").trim().slice(0, LIMITS.Q_TEXT);
export const normAnswerText = (s) => String(s ?? "").trim().slice(0, LIMITS.A_TEXT);

/**
 * Twardy limit znaków w polu (także przy wklejaniu -- maxlength nie działa
 * przy programowym .value). onInput dostaje już przyciętą wartość.
 */
export function wireTextLimit(el, max, onInput) {
  if (!el) return;
  el.maxLength = max;
  el.addEventListener("input", () => {
    if (el.value.length > max) el.value = el.value.slice(0, max);
    onInput?.(el.value);
  });
}

/* ================= Punkty ================= */

/**
 * Wartość pola punktów: liczba całkowita 0–100 albo null (puste).
 * "12.7" -> 12, "-5" -> 0, "250" -> 100, "abc" -> null.
 */
export function parsePoints(raw) {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.min(LIMITS.PTS_MAX, Math.max(0, Math.floor(n)));
}

/**
 * Pole punktów: tylko cyfry, najwyżej 100 (pojedyncza odpowiedź nigdy nie
 * może mieć więcej, niż wynosi cała pula). type="text" + inputmode="numeric"
 * zamiast type="number": number przepuszcza "e", "-", "1.5", a przy
 * niepoprawnej treści .value jest "", więc nie da się jej poprawić.
 * onInput dostaje liczbę albo null (puste pole).
 */
export function wirePointsInput(el, onInput) {
  if (!el) return;
  el.type = "text";
  el.inputMode = "numeric";
  el.autocomplete = "off";
  el.maxLength = 3;
  el.addEventListener("input", () => {
    // wklejone "-50" to 0 (jak w parsePoints/imporcie), a nie "50" --
    // samo wycięcie znaków niebędących cyframi odwracałoby znak
    const negative = /^\s*-/.test(el.value);
    const digits = negative ? "0" : el.value.replace(/\D/g, "").slice(0, 3);
    const val = digits === "" ? null : Math.min(LIMITS.PTS_MAX, Number(digits));
    const shown = val === null ? "" : String(val);
    if (el.value !== shown) el.value = shown;
    onInput?.(val);
  });
}

export function sumPoints(answers) {
  let s = 0;
  for (const a of answers || []) {
    const n = Number(a?.fixed_points);
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

/** Pasek "SUMA x/100" -- czerwony (klasa "over") powyżej puli. */
export function renderSumPill(el, sum) {
  if (!el) return;
  el.classList.toggle("over", sum > LIMITS.SUM_MAX);
  el.innerHTML = "";
  const label = document.createElement("span");
  label.textContent = t("questionForm.sumLabel");
  const val = document.createElement("b");
  val.textContent = `${sum}/${LIMITS.SUM_MAX}`;
  el.append(label, val);
}

/* ================= Wiersze listy odpowiedzi (css/question-form.css) ================= */

/**
 * Wiersz odpowiedzi: [tekst] [punkty] [kosz]. Samo DOM -- limity podpina
 * wołający (wireTextLimit / wirePointsInput), bo edytor zapisuje każde pole
 * od razu, a modal dopiero po "Zapisz".
 */
export function buildAnswerRow({ text = "", points = null, placeholder = "", pointsPlaceholder = "", showPoints = true } = {}) {
  const row = document.createElement("div");
  row.className = "qf-row";

  const iText = document.createElement("input");
  iText.className = "qf-text";
  iText.type = "text";
  iText.autocomplete = "off";
  iText.value = text;
  iText.placeholder = placeholder;
  row.appendChild(iText);

  let iPts = null;
  if (showPoints) {
    iPts = document.createElement("input");
    iPts.className = "qf-pts";
    iPts.value = points === null || points === undefined ? "" : String(points);
    iPts.placeholder = pointsPlaceholder;
    row.appendChild(iPts);
  }

  const bDel = document.createElement("button");
  bDel.type = "button";
  bDel.className = "qf-del";
  bDel.innerHTML = icon("trash");
  bDel.title = t("questionForm.deleteAnswer");
  bDel.setAttribute("aria-label", bDel.title);
  row.appendChild(bDel);

  return { row, iText, iPts, bDel };
}

/** Kafelek dodawania odpowiedzi z ikoną i licznikiem; przy limicie wyłączony. */
export function buildAddAnswerTile(count) {
  const canAdd = count < LIMITS.AN_MAX;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "qf-row qf-add";
  btn.disabled = !canAdd;
  const plus = document.createElement("span");
  plus.className = "qf-addPlus";
  plus.setAttribute("aria-hidden", "true");
  plus.innerHTML = icon("plus");
  const lbl = document.createElement("span");
  lbl.className = "qf-addLbl";
  lbl.textContent = canAdd ? t("questionForm.addAnswer").replace(/^[+＋]\s*/, "") : t("questionForm.answerLimit");
  const cnt = document.createElement("span");
  cnt.className = "qf-addCnt";
  cnt.textContent = `${count}/${LIMITS.AN_MAX}`;
  btn.append(plus, lbl, cnt);
  return btn;
}

/* ================= Walidacja pytania ================= */

/**
 * Problemy pytania dla danego typu gry (albo "base" -- pytanie w bazie
 * pytań, gdzie liczba odpowiedzi jest dowolna 0–6, a punkty opcjonalne).
 * Zwraca listę { code, params }; tekst: questionMessage(problem).
 *
 *   textEmpty, answerEmpty {ord}, answersMin {min,count}, answersMax {max},
 *   sumOver {sum,max}
 */
export function questionProblems(q, type) {
  const out = [];
  const answers = Array.isArray(q?.answers) ? q.answers : [];

  if (!normQuestionText(q?.text)) out.push({ code: "textEmpty", params: {} });
  if (type === TYPES.POLL_TEXT) return out;

  answers.forEach((a, i) => {
    if (!normAnswerText(a?.text)) out.push({ code: "answerEmpty", params: { ord: i + 1 } });
  });

  if (answers.length > LIMITS.AN_MAX) {
    out.push({ code: "answersMax", params: { max: LIMITS.AN_MAX } });
  }
  if (type !== "base" && answers.length < LIMITS.AN_MIN) {
    out.push({ code: "answersMin", params: { min: LIMITS.AN_MIN, count: answers.length } });
  }
  if (type !== TYPES.POLL_POINTS) {
    const sum = sumPoints(answers);
    if (sum > LIMITS.SUM_MAX) out.push({ code: "sumOver", params: { sum, max: LIMITS.SUM_MAX } });
  }
  return out;
}

export function questionMessage(problem) {
  return problem ? t(`questionForm.errors.${problem.code}`, problem.params || {}) : "";
}
