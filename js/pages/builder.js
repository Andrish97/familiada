// js/core/game-validate.js
import { sb } from "./supabase.js";

/**
 * Typy gier:
 * - poll_text    => Typowy sondaż (tekstowy)
 * - poll_points  => Punktacja odpowiedzi (głosowanie na odpowiedź)
 * - prepared     => Preparowany (manualne punkty, suma=100)
 */
export const KINDS = {
  POLL_TEXT: "poll_text",
  POLL_POINTS: "poll_points",
  PREPARED: "prepared",
};

export const STATUS = {
  DRAFT: "draft",
  POLL_OPEN: "poll_open",
  READY: "ready", // po zamknięciu sondażu / gotowe do gry
};

export const RULES = {
  QN_MIN: 10,
  AN_MIN: 3,
  AN_MAX: 6,
  SUM_PREPARED: 100,
};

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

/* ====== checks pomocnicze ====== */

async function getQA(gameId) {
  const qs = await loadQuestions(gameId);
  const ansByQ = new Map();
  for (const q of qs) {
    ansByQ.set(q.id, await loadAnswers(q.id));
  }
  return { qs, ansByQ };
}

function clampAnswersCountOk(cnt) {
  return cnt >= RULES.AN_MIN && cnt <= RULES.AN_MAX;
}

/**
 * Dla typowego sondażu (tekstowego):
 * - Warunek zamknięcia: w każdym pytaniu >= 3 różne odpowiedzi zebrane
 * UWAGA: to zależy od tabel z głosami. Tutaj zostawiamy hook.
 * Na start możesz zwracać {ok:true} jeśli jeszcze nie masz wyników tekstowych w DB.
 */
export async function validateTextPollClosable(/*gameId*/) {
  // TODO: implementacja gdy podepniesz tabelę z odpowiedziami tekstowymi
  // Wtedy sprawdzasz: per pytanie liczba unikalnych odpowiedzi >= 3
  return { ok: true, reason: "" };
}

/**
 * Dla punktacji (poll_points):
 * - Warunek zamknięcia: w każdym pytaniu co najmniej 2 odpowiedzi mają punkty != 0
 * To też zależy od modelu głosowania. Jeśli w trakcie sondażu zapisujesz punkty do answers.fixed_points
 * (albo do osobnej tabeli i potem agregujesz), to tu sprawdzamy agregat.
 *
 * Na start: jeśli jeszcze nie masz zapisów, też zwracamy ok, żeby UI nie blokować na etapie CSS.
 */
export async function validatePointsPollClosable(/*gameId*/) {
  // TODO: implementacja gdy podepniesz model głosów punktowych
  return { ok: true, reason: "" };
}

/* ====== WALIDACJE AKCJI ====== */

/**
 * EDYCJA:
 * 1) poll_text / poll_points:
 *    - draft => ok
 *    - ready => ok, ale wymaga alertu (reset wyników + draft)
 *    - poll_open => blokada
 * 2) prepared: zawsze ok
 */
export function canEnterEdit(game) {
  if (!game) return { ok: false, reason: "Brak gry." };

  if (game.kind === KINDS.PREPARED) {
    return { ok: true, reason: "", needsResetWarning: false };
  }

  if (game.status === STATUS.POLL_OPEN) {
    return { ok: false, reason: "Sondaż jest otwarty — edycja zablokowana.", needsResetWarning: false };
  }

  if (game.status === STATUS.READY) {
    return {
      ok: true,
      reason: "",
      needsResetWarning: true, // pokaż alert: usuniemy dane sondażowe i wracamy do szkicu
    };
  }

  return { ok: true, reason: "", needsResetWarning: false };
}

/**
 * SONDAŻ:
 * - poll_text/poll_points => zawsze (czyli w sensie „wolno wejść na stronę sondażu”)
 * - prepared => nigdy
 *
 * Aktywność przycisku w builderze:
 * - DRAFT: ok (uruchom) jeśli spełnia minimalne warunki
 * - POLL_OPEN: ok (wejdź, pokaż link)
 * - READY: ok (wejdź, pokaż "otwórz ponownie")
 */
export async function validatePollEntry(gameId) {
  const game = await loadGameBasic(gameId);

  if (game.kind === KINDS.PREPARED) {
    return { ok: false, reason: "Preparowany nie ma sondażu." };
  }

  // wejście do polls.html dozwolone w każdym stanie (dla tych dwóch typów)
  return { ok: true, reason: "" };
}

/**
 * Czy wolno URUCHOMIĆ sondaż (stan draft -> poll_open)?
 *
 * poll_text:
 * - zawsze, ale aktywacja przycisku "Uruchom" dopiero gdy pytań >=10
 *
 * poll_points:
 * - pytań >=10 i każde pytanie ma 3..6 odpowiedzi
 */
export async function validatePollReadyToOpen(gameId) {
  const game = await loadGameBasic(gameId);

  if (game.kind === KINDS.PREPARED) {
    return { ok: false, reason: "Preparowany nie ma sondażu." };
  }
  if (game.status === STATUS.POLL_OPEN) {
    return { ok: false, reason: "Sondaż już jest otwarty." };
  }

  const { qs, ansByQ } = await getQA(gameId);

  if (qs.length < RULES.QN_MIN) {
    return { ok: false, reason: `Musi być co najmniej ${RULES.QN_MIN} pytań (masz: ${qs.length}).` };
  }

  if (game.kind === KINDS.POLL_POINTS) {
    for (const q of qs) {
      const ans = ansByQ.get(q.id) || [];
      if (!clampAnswersCountOk(ans.length)) {
        return {
          ok: false,
          reason: `Pytanie #${q.ord}: musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi (masz: ${ans.length}).`,
        };
      }
    }
  }

  // poll_text: tylko warunek ilości pytań
  return { ok: true, reason: "" };
}

/**
 * GRA / PLAY:
 * poll_text/poll_points:
 * - sondaż musi być ZAMKNIĘTY (status ready) => wtedy "wszystko OK"
 *
 * prepared:
 * - >=10 pytań
 * - w każdym pytaniu 3..6 odpowiedzi
 * - suma punktów w pytaniu = 100
 */
export async function validateGameReadyToPlay(gameId) {
  const game = await loadGameBasic(gameId);

  // poll_*: tylko po zamknięciu
  if (game.kind === KINDS.POLL_TEXT || game.kind === KINDS.POLL_POINTS) {
    if (game.status !== STATUS.READY) {
      return { ok: false, reason: "Gra dostępna dopiero po zamknięciu sondażu." };
    }
    return { ok: true, reason: "" };
  }

  // prepared:
  const { qs, ansByQ } = await getQA(gameId);

  if (qs.length < RULES.QN_MIN) {
    return { ok: false, reason: `Musi być co najmniej ${RULES.QN_MIN} pytań (masz: ${qs.length}).` };
  }

  for (const q of qs) {
    const ans = ansByQ.get(q.id) || [];
    if (!clampAnswersCountOk(ans.length)) {
      return {
        ok: false,
        reason: `Pytanie #${q.ord}: musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi (masz: ${ans.length}).`,
      };
    }

    const pts = ans.map(a => n(a.fixed_points));
    if (pts.some(p => p < 0)) {
      return { ok: false, reason: `Pytanie #${q.ord}: punkty nie mogą być ujemne.` };
    }
    if (pts.some(p => p > 100)) {
      return { ok: false, reason: `Pytanie #${q.ord}: odpowiedź nie może mieć > 100 pkt.` };
    }

    const sum = pts.reduce((s, x) => s + x, 0);
    if (sum !== RULES.SUM_PREPARED) {
      return { ok: false, reason: `Pytanie #${q.ord}: suma punktów musi wynosić ${RULES.SUM_PREPARED} (jest: ${sum}).` };
    }
  }

  return { ok: true, reason: "" };
}
