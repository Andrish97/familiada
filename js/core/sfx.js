// /familiada/js/core/sfx.js
// Dźwięki lecą na komputerze operatora (control).
// Pliki są w /audio w root repo.

const PATH = "../audio/";

const files = {
  show_intro: "show_intro.mp3",
  round_transition: "round_transition.mp3",
  round_transition2: "round_transition2.mp3",
  final_theme: "final_theme.mp3",

  buzzer_press: "buzzer_press.mp3",

  answer_correct: "answer_correct.mp3",
  answer_wrong: "answer_wrong.mp3",
  answer_repeat: "answer_repeat.mp3",

  time_over: "time_over.mp3",

  // dawny ui_tick -> teraz bells; zostawiam alias ui_tick dla bezpieczeństwa
  bells: "bells.mp3",
};

export function listSfx() {
  return Object.keys(files);
}

const cache = new Map();

function loadAudio(name) {
  const fn = files[name];
  if (!fn) return null;

  if (!cache.has(name)) {
    const a = new Audio(PATH + fn);
    a.preload = "auto";
    cache.set(name, a);
  }
  return cache.get(name) || null;
}

/* ========= PROSTE ODTWARZANIE ========= */

export function playSfx(name) {
  const a = loadAudio(name);
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}

/* ========= MIKSER / ŚLEDZENIE CZASU ========= */

export function createSfxMixer() {
  let audio = null;
  let raf = null;

  const listeners = new Set();

  function notify() {
    if (!audio) return;
    const t = audio.currentTime || 0;
    const d = audio.duration || 0;
    for (const fn of listeners) fn(t, d);
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

/* ========= DOKŁADNE MIERZENIE DŁUGOŚCI AUDIO ========= */

const durationPromises = new Map();

/**
 * Zwraca Promise z dokładną długością dźwięku w sekundach (float).
 * Jeśli nie da się odczytać – zwraca 0.
 */
export function getSfxDuration(name) {
  if (durationPromises.has(name)) {
    return durationPromises.get(name);
  }

  const a = loadAudio(name);
  if (!a) {
    const p = Promise.resolve(0);
    durationPromises.set(name, p);
    return p;
  }

  const p = new Promise((resolve) => {
    // jeśli przeglądarka już wie
    if (!Number.isNaN(a.duration) && a.duration > 0) {
      resolve(a.duration);
      return;
    }

    const onMeta = () => {
      a.removeEventListener("loadedmetadata", onMeta);
      resolve(a.duration || 0);
    };

    a.addEventListener("loadedmetadata", onMeta);

    // awaryjnie po 5s zwróć cokolwiek udało się odczytać
    setTimeout(() => {
      a.removeEventListener("loadedmetadata", onMeta);
      resolve(a.duration || 0);
    }, 5000);
  });

  durationPromises.set(name, p);
  return p;
}

/* ========= AUDIO UNLOCK (gesture) ========= */

let unlocked = false;

export function unlockAudio() {
  if (unlocked) return true;

  try {
    const a = new Audio();
    a.volume = 0;
    a.src = PATH + files.bells; // minimalny dźwięk – spełnia warunek "user gesture"
    a.play().catch(() => {});
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function isAudioUnlocked() {
  return unlocked;
}
