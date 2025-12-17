// js/core/game-validate.js
import { sb } from "./supabase.js";

// Zasady globalne:
export const RULES = {
  QN_MIN: 10,   // min 10 pytań
  AN_MIN: 5,    // min 5 odpowiedzi
  AN_MAX: 6,    // max 6 odpowiedzi
};

// bezpieczny parse
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function loadGameBasic(gameId) {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

export async function loadQuestions(gameId) {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadAnswers(questionId) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", questionId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Walidacja "czy wolno edytować"
 * - jeśli poll i status=poll_open -> edycja zablokowana
 */
export function canEditGame(game) {
  if (!game) return { ok: false, reason: "Brak gry." };
  if (game.kind === "poll" && game.status === "poll_open") {
    return { ok: false, reason: "Sondaż jest otwarty — edycja zablokowana." };
  }
  return { ok: true, reason: "" };
}

/**
 * Wspólna walidacja struktury:
 * - min 10 pytań
 * - dla pierwszych 10 pytań: odpowiedzi 5..6
 */
export async function validateStructure(gameId) {
  const qs = await loadQuestions(gameId);

  if (qs.length < RULES.QN_MIN) {
    return { ok: false, reason: `Gra musi mieć co najmniej ${RULES.QN_MIN} pytań. Masz: ${qs.length}.` };
  }

  // UI rozgrywki i tak jedzie na pierwszych 10 (reszta może istnieć)
  const ten = qs.slice(0, RULES.QN_MIN);

  for (const q of ten) {
    const ans = await loadAnswers(q.id);
    if (ans.length < RULES.AN_MIN || ans.length > RULES.AN_MAX) {
      return {
        ok: false,
        reason: `Pytanie #${q.ord}: musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi (masz: ${ans.length}).`,
      };
    }
  }

  return { ok: true, reason: "" };
}

/**
 * Walidacja "czy wolno odpalić grę" (Control/Play)
 *
 * Zasady:
 * - zawsze: min 10 pytań
 * - dla pierwszych 10 pytań: 5..6 odpowiedzi
 * - fixed:
 *   - każda odpowiedź ma pkt 1..100 (zero zabronione)
 *   - suma punktów w pytaniu musi być DOKŁADNIE 100
 * - poll:
 *   - nie wolno startować gdy status=poll_open
 *   - wolno startować dopiero gdy status=ready
 *   - po ready zakładamy: fixed_points już policzone (też >0 i suma=100)
 */
export async function validateGameReadyToPlay(gameId) {
  const game = await loadGameBasic(gameId);

  if (game.kind === "poll") {
    if (game.status === "poll_open") {
      return { ok: false, reason: "Nie można uruchomić gry: sondaż jest OTWARTY." };
    }
    if (game.status !== "ready") {
      return { ok: false, reason: "Nie można uruchomić gry: sondaż nie jest zakończony (status != GOTOWA)." };
    }
  }

  const s = await validateStructure(gameId);
  if (!s.ok) return s;

  const qs = await loadQuestions(gameId);
  const ten = qs.slice(0, RULES.QN_MIN);

  for (const q of ten) {
    const ans = await loadAnswers(q.id);

    // punkty w obu typach muszą być sensowne, bo później leci to na tablicę
    const pts = ans.map(a => n(a.fixed_points));

    // zero zabronione
    if (pts.some(p => p <= 0)) {
      return { ok: false, reason: `Pytanie #${q.ord}: żadna odpowiedź nie może mieć 0 pkt.` };
    }

    // sufit 100
    if (pts.some(p => p > 100)) {
      return { ok: false, reason: `Pytanie #${q.ord}: odpowiedź nie może mieć więcej niż 100 pkt.` };
    }

    const sum = pts.reduce((s, x) => s + x, 0);
    if (sum !== 100) {
      return { ok: false, reason: `Pytanie #${q.ord}: suma punktów musi być dokładnie 100 (jest: ${sum}).` };
    }
  }

  return { ok: true, reason: "" };
}

/**
 * Walidacja "czy wolno uruchomić sondaż"
 * - tylko dla game.kind=poll
 * - tylko gdy nie jest poll_open
 * - min 10 pytań
 * - dla pierwszych 10: odpowiedzi 5..6 (tekstowe)
 */
export async function validatePollReadyToOpen(gameId) {
  const game = await loadGameBasic(gameId);

  if (game.kind !== "poll") {
    return { ok: false, reason: "To nie jest gra sondażowa." };
  }
  if (game.status === "poll_open") {
    return { ok: false, reason: "Sondaż już jest otwarty." };
  }

  const s = await validateStructure(gameId);
  if (!s.ok) return s;

  return { ok: true, reason: "" };
}
