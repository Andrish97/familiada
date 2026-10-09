// js/core/game-validate.js
import { sb } from "./supabase.js?v=v2026-10-09T00020";
import { t, withLangParam } from "../../translation/translation.js?v=v2026-10-09T00020";
import { showBlockingOverlay } from "./resource-lock.js?v=v2026-10-09T00020";

/**
 * Typy gier:
 * - poll_text    => Ankieta tekstowa
 * - poll_points  => Punktacja
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
// polls, subscriptions i control. Tu tylko tłumaczymy kod błędu na tekst.
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

/**
 * Zapisany stan z kolumny games.rules_state (migracja 275) -- ten sam kształt
 * co validateGame(), bez poll_close (zależy od głosów, tylko na żądanie).
 * null, gdy kolumny jeszcze nie ma / pusta -- wtedy wołający pyta validateGame().
 */
export function rulesFromState(state) {
  if (!state || typeof state !== "object") return null;
  const out = { rules: state.rules || null };
  for (const k of ACTIONS) {
    if (k === "poll_close") continue;
    out[k] = actionResult(state[k]);
  }
  return out;
}

/**
 * Warstwa 2 (migracja 274): baza sama odrzuca zapis łamiący reguły --
 * 'game_content_locked:<powód>' (treść gry przy otwartej ankiecie / kopii ze
 * Społeczności) albo 'poll_close_blocked:<kod>' (zamknięcie ankiety bez
 * spełnionych warunków). Zwraca przetłumaczony komunikat albo "" dla innych
 * błędów.
 */
export function gameRuleErrorMessage(err) {
  const m = String(err?.message || "");
  if (m.includes("game_content_locked:poll_open")) return t("gameValidate.pollOpenNoEdit");
  if (m.includes("game_content_locked:market")) return t("gameValidate.marketNoEdit");
  const close = m.match(/poll_close_blocked:(\w+):(\d*)/);
  if (close) return t(`gameValidate.${close[1]}`, { ord: close[2] || "?" });
  return "";
}

/**
 * Blokada stanu strony gry (docs/blokady-zasobow.md, „Blokady stanu i akcji”):
 * strona, której stan gry nie pozwala na pracę, blokuje się w całości tym
 * samym pełnoekranowym komunikatem co zajęty zasób — także przy wejściu
 * ręcznie wpisanym adresem. Wywoływać PO wzięciu blokady zasobu.
 * @param {string} gameId
 * @param {"edit"|"play"|"poll_entry"} action
 * @returns {Promise<object|null>} wynik akcji (ok) albo null (strona zablokowana)
 */
export async function guardGameState(gameId, action, { backHref = "/games/" } = {}) {
  let res = null;
  try {
    res = (await validateGame(gameId))[action];
  } catch (e) {
    console.error("[game-validate] guardGameState:", e);
    res = { ok: false, reason: t("gameValidate.noGame") };
  }
  if (res?.ok) return res;
  showBlockingOverlay({
    title: t("gameValidate.stateBlockedTitle"),
    message: res?.reason || t("gameValidate.noGame"),
    backHref: withLangParam(backHref),
  });
  return null;
}

