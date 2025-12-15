// js/core/sfx.js
// Dźwięki lecą na komputerze operatora (control).
// Wrzuć pliki mp3 do: assets/sfx/

const PATH = "assets/sfx/";

const files = {
  round_start: "round_start.mp3",
  round_end: "round_end.mp3",
  buzzer: "buzzer.mp3",
  correct: "correct.mp3",
  wrong: "wrong.mp3",
  reveal: "reveal.mp3",
  time_up: "time_up.mp3",
  final: "final.mp3",
  repeat: "repeat.mp3",
};

const cache = new Map();

function audio(name) {
  const fn = files[name];
  if (!fn) return null;

  if (!cache.has(name)) {
    const a = new Audio(PATH + fn);
    a.preload = "auto";
    cache.set(name, a);
  }
  return cache.get(name);
}

// próbuje zagrać bez wywalania błędów (autoplay policy itp.)
export function playSfx(name) {
  const a = audio(name);
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}
