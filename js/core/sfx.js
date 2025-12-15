// js/core/sfx.js
// Dźwięki lecą na komputerze operatora (control).
// Pliki są w /audio w root repo.

const PATH = "audio/";

const files = {
  // intro / przejścia
  show_intro: "show_intro.mp3",
  round_transition: "round_transition.mp3",
  final_theme: "final_theme.mp3",

  // buzzer
  buzzer_press: "buzzer_press.mp3",

  // odpowiedzi
  answer_correct: "answer_correct.mp3",
  answer_wrong: "answer_wrong.mp3",
  answer_repeat: "answer_repeat.mp3",

  // czas
  time_over: "time_over.mp3",

  // UI “tick” (dzwonki przy zmianach na ekranie)
  ui_tick: "ui_tick.mp3",
};

const cache = new Map();

function getAudio(name) {
  const fn = files[name];
  if (!fn) return null;

  if (!cache.has(name)) {
    const a = new Audio(PATH + fn);
    a.preload = "auto";
    cache.set(name, a);
  }
  return cache.get(name);
}

// bezpieczne odtwarzanie (autoplay policy itd.)
export function playSfx(name) {
  const a = getAudio(name);
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}
