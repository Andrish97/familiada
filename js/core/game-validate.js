// js/core/game-validate.js
import { sb } from "./supabase.js?v=v2026-09-26T16124";
import { t } from "../../translation/translation.js?v=v2026-09-26T16124";

/**
 * Typy gier:
 * - poll_text    => Typowa ankieta
 * - poll_points  => Punktacja odpowiedzi (ankieta na odpowiedź)
 * - prepared     => Preparowana (manualne punkty, suma=100)
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
  READY: "ready", // po zamknięciu ankiety / gotowe do gry
};

// Te same liczby co w game_validate (baza) -- tu tylko do podpowiedzi w UI
// (licznik odpowiedzi w edytorze itp.); o dozwoleniu akcji decyduje baza.
export const RULES = {
  QN_MIN: 10,
  AN_MIN: 3,
  AN_MAX: 6,
  SUM_PREPARED: 100,
};

export async function loadGameBasic(gameId) {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

export async function loadQuestions(gameId) {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text")
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

/* ====== walidacja: tylko w bazie ====== */

// Reguły (czy wolno edytować / grać / otworzyć lub zamknąć ankietę) liczy
// RPC game_validate (migracja 273) -- jedno źródło prawdy dla games, editor,
// polls, polls-hub i control. Tu tylko tłumaczymy kod błędu na tekst.
// Każda akcja: { ok, reason } (+ needsReset dla edit).
const ACTIONS = ["edit", "play", "poll_entry", "poll_open", "poll_close", "export"];

function actionResult(raw) {
  const ok = !!raw?.ok;
  return {
    ok,
    reason: ok ? "" : t(`gameValidate.${raw?.code || "unknownType"}`, raw?.params || {}),
    code: raw?.code || "",
    needsReset: !!raw?.needs_reset,
  };
}

/**
 * Stan gry i wszystkich akcji jednym zapytaniem.
 * Zwraca { game: {id,type,status,rev}, rules, edit, play, poll_entry,
 * poll_open, poll_close, export }. Gra niedostępna -> każda akcja z
 * reason gameValidate.noGame.
 */
export async function validateGame(gameId) {
  const { data, error } = await sb().rpc("game_validate", { p_game_id: gameId });
  if (error) throw error;

  const out = { game: data?.game || null, rules: data?.rules || null };
  for (const k of ACTIONS) {
    out[k] = data?.ok ? actionResult(data[k]) : actionResult({ ok: false, code: "noGame" });
  }
  return out;
}
