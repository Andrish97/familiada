// js/core/game-validate.js
import { sb } from "./supabase.js";

// Twoje zasady (dla gry i dla sondaża):
export const RULES = {
  QN: 10, // min (i w praktyce wymagane) 10 pytań
  AN: 5,  // wymagane 5 odpowiedzi
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
 * Walidacja "czy wolno w ogóle edytować"
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
 * Walidacja "czy wolno odpalić grę" (Control/Play)
 *
 * Zasady:
 * - zawsze: min 10 pytań
 * - zawsze: każde pytanie ma DOKŁADNIE 5 odpowiedzi
 * - fixed (lokalna):
 *   - każda odpowiedź ma pkt 1..100 (zero zabronione)
 *   - suma punktów w pytaniu musi być DOKŁADNIE 100
 * - poll (sondażowa):
 *   - nie wolno startować gdy status=poll_open
 *   - wolno startować dopiero gdy status=ready
 *   - po ready zakładamy, że answers.fixed_points już policzone (też nie mogą zawierać 0 i suma=100)
 */
export async function validateGameReadyToPlay(gameId) {
  const game = await loadGameBasic(gameId);

  // blokada: nie odpalamy gry, gdy sondaż jest otwarty
  if (game.kind === "poll") {
    if (game.status === "poll_open") {
      return { ok: false, reason: "Nie można uruchomić gry: sondaż jest OTWARTY." };
    }
    if (game.status !== "ready") {
      return { ok: false, reason: "Nie można uruchomić gry: sondaż nie jest zakończony (status != READY)." };
    }
  }

  const qs = await loadQuestions(gameId);
  if (qs.length < RULES.QN) {
    return { ok: false, reason: `Gra musi mieć co najmniej ${RULES.QN} pytań. Masz: ${qs.length}.` };
  }

  // sprawdzamy pierwsze 10 pytań (bo reguła “min 10” — a UI i tak będzie na 10)
  const ten = qs.slice(0, RULES.QN);

  for (const q of ten) {
    const ans = await loadAnswers(q.id);

    if (ans.length !== RULES.AN) {
      return { ok: false, reason: `Pytanie #${q.ord}: musi mieć dokładnie ${RULES.AN} odpowiedzi (masz: ${ans.length}).` };
    }

    // dla obu typów wymagamy sensownych punktów (bo później w grze to leci na tablicę)
    const pts = ans.map(a => n(a.fixed_points));

    // zero zabronione
    if (pts.some(p => p <= 0)) {
      return { ok: false, reason: `Pytanie #${q.ord}: żadna odpowiedź nie może mieć 0 pkt.` };
    }

    // sufit 100 na odpowiedź
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
 * - tylko gdy nie jest poll_open (czyli draft/ready -> możemy otworzyć)
 * - min 10 pytań i każde ma 5 odpowiedzi (tekstowe)
 */
export async function validatePollReadyToOpen(gameId) {
  const game = await loadGameBasic(gameId);

  if (game.kind !== "poll") {
    return { ok: false, reason: "To nie jest gra sondażowa." };
  }
  if (game.status === "poll_open") {
    return { ok: false, reason: "Sondaż już jest otwarty." };
  }

  const qs = await loadQuestions(gameId);
  if (qs.length < RULES.QN) {
    return { ok: false, reason: `Sondaż wymaga min ${RULES.QN} pytań. Masz: ${qs.length}.` };
  }

  const ten = qs.slice(0, RULES.QN);

  for (const q of ten) {
    const ans = await loadAnswers(q.id);
    if (ans.length !== RULES.AN) {
      return { ok: false, reason: `Pytanie #${q.ord}: musi mieć dokładnie ${RULES.AN} odpowiedzi.` };
    }
    // tu nie wymagamy punktów (bo punkty policzą się po zamknięciu)
  }

  return { ok: true, reason: "" };
}
