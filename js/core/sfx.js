// js/core/sfx.js
// Dźwięki lecą na komputerze operatora (control).
// Pliki są w /audio w root repo.

const PATH = "audio/";

const files = {
  show_intro: "show_intro.mp3",
  round_transition: "round_transition.mp3",
  final_theme: "final_theme.mp3",

  buzzer_press: "buzzer_press.mp3",

  answer_correct: "answer_correct.mp3",
  answer_wrong: "answer_wrong.mp3",
  answer_repeat: "answer_repeat.mp3",

  time_over: "time_over.mp3",

  ui_tick: "ui_tick.mp3",
};

const cache = new Map();

function loadAudio(name) {
  const fn = files[name];
  if (!fn) return null;

  if (!cache.has(name)) {
    const a = new Audio(PATH + fn);
    a.preload = "auto";
    cache.set(name, a);
  }
  return cache.get(name);
}

/* ========= SIMPLE SFX ========= */

export function playSfx(name) {
  const a = loadAudio(name);
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}

/* ========= MIXER / TIMER ========= */

export function createSfxMixer() {
  let audio = null;
  let raf = null;

  const listeners = new Set();

  function notify() {
    if (!audio) return;
    listeners.forEach((fn) => fn(audio.currentTime, audio.duration || 0));
  }

  function tick() {
    notify();
    if (audio && !audio.paused) {
      raf = requestAnimationFrame(tick);
    }
  }

  return {
    play(name) {
      this.stop();
      audio = loadAudio(name);
      if (!audio) return;

      audio.currentTime = 0;
      audio.play().catch(() => {});
      raf = requestAnimationFrame(tick);
    },

    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;

      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {}
      }
      audio = null;
    },

    onTime(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    get time() {
      return audio ? audio.currentTime : 0;
    },

    get duration() {
      return audio?.duration || 0;
    },
  };
}
