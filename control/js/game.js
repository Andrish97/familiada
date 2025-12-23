// /familiada/control/js/game.js
import { loadQuestions } from "/familiada/js/core/game-validate.js";

// Prosta logika wkładek: odblokowanie zależne od presence + runtime.
// (Rozgrywkę rund/finału dopiszemy dalej – tu startujemy od setupu i startu rundy.)

export function canAdvance(step, ctx) {
  const p = ctx.presence;
  const rt = ctx.runtime;

  if (step === "TOOLS_DISPLAY") {
    return !!p?.display?.on;
  }

  if (step === "TOOLS_LINKS") {
    return !!p?.display?.on && !!p?.host?.on && !!p?.buzzer?.on;
  }

  if (step === "FINAL_SETUP") {
    // zawsze można przejść dalej, ale jak finał enabled to muszą być 5 pytań
    if (!rt.finalEnabled) return true;
    return Array.isArray(rt.finalQuestionIds) && rt.finalQuestionIds.length === 5;
  }

  if (step === "TEAM_NAMES") {
    return !!String(rt.teamA || "").trim() && !!String(rt.teamB || "").trim();
  }

  if (step === "GAME_READY") {
    return true;
  }

  if (step === "GAME_START") {
    return true;
  }

  if (step === "ROUND_START") {
    return true;
  }

  return false;
}

export async function pickFinalQuestionsUI(gameId) {
  // Minimalny „picker” na start: prompty.
  // UI listę zrobimy w kolejnym kroku (tu szybko, żeby ruszyć implementacją).
  const qs = await loadQuestions(gameId);
  const lines = qs.map((q) => `${q.ord}. ${q.text}`).join("\n");

  alert(
    "Wybór pytań finału (tymczasowo):\n" +
    "- Zaraz wybierzesz 5 numerów porządkowych.\n\n" +
    "Lista:\n" + lines
  );

  const raw = prompt("Wpisz 5 numerów (ord) po przecinku, np. 1,3,5,7,9", "");
  if (!raw) return [];

  const ords = raw
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((x) => Number.isFinite(x));

  const unique = Array.from(new Set(ords)).slice(0, 5);
  const picked = unique
    .map((ord) => qs.find((q) => q.ord === ord))
    .filter(Boolean)
    .map((q) => q.id);

  return picked;
}
