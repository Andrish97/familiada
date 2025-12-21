// /familiada/js/core/sfx.js
// Dźwięki lecą na komputerze operatora (control).
// Pliki są w /audio w root repo.

const PATH = "/audio/";

export const files = {
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

  // UI “tick”
  ui_tick: "ui_tick.mp3",
};

// trzymamy bazowe audio jako "template" (nie gra bezpośrednio)
const baseCache = new Map();

// aktywne, grające instancje (do miksowania)
const active = new Map(); // id -> HTMLAudioElement
let nextId = 1;

function getBase(name) {
  const fn = files[name];
  if (!fn) return null;

  if (!baseCache.has(name)) {
    const a = new Audio(PATH + fn);
    a.preload = "auto";
    baseCache.set(name, a);
  }
  return baseCache.get(name);
}

// Na iOS / autoplay policy: musisz “odblokować” audio gestem usera.
// Wywołaj raz na klik operatora (np. przy wejściu w Control).
let unlocked = false;
export async function unlockAudio() {
  if (unlocked) return true;
  try {
    const a = new Audio();
    a.volume = 0;
    a.src = PATH + (files.ui_tick || "");
    await a.play().catch(() => {});
    a.pause();
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

// startTime: w sekundach od początku dźwięku
// volume: 0..1
// loop: true/false (dla theme itp.)
// return: handle { id, audio, name, stop(), setVolume(), getTime() }
export function playSfx(name, opts = {}) {
  const base = getBase(name);
  if (!base) return null;

  const {
    volume = 1,
    loop = false,
    startTime = 0,
    // jeśli chcesz "single" = tylko jedna instancja na name:
    single = false,
  } = opts;

  // single: stop stare instancje o tej samej nazwie
  if (single) {
    for (const [id, a] of active) {
      if (a.__sfxName === name) {
        try { a.pause(); } catch {}
        active.delete(id);
      }
    }
  }

  // klon do miksowania
  const a = base.cloneNode(true);
  a.preload = "auto";
  a.loop = !!loop;
  a.volume = Math.max(0, Math.min(1, Number(volume)));

  // metadane dla debug
  a.__sfxName = name;

  // ustaw startTime dopiero jak metadata ready (czasem duration = NaN wcześniej)
  const seekTo = () => {
    const t = Math.max(0, Number(startTime) || 0);
    try { a.currentTime = t; } catch {}
  };

  if (a.readyState >= 1) seekTo();
  else a.addEventListener("loadedmetadata", seekTo, { once: true });

  const id = String(nextId++);
  active.set(id, a);

  // sprzątanie po zakończeniu
  const cleanup = () => { active.delete(id); };
  a.addEventListener("ended", cleanup, { once: true });
  a.addEventListener("pause", () => {
    // jeśli ktoś zatrzymał i nie loopuje, usuń
    if (!a.loop) cleanup();
  });

  // start
  try {
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}

  return makeHandle(id, a, name);
}

function makeHandle(id, audio, name) {
  return {
    id,
    name,
    audio,
    stop() {
      try { audio.pause(); } catch {}
      try { audio.currentTime = 0; } catch {}
      active.delete(id);
    },
    setVolume(v) {
      audio.volume = Math.max(0, Math.min(1, Number(v)));
    },
    setTime(sec) {
      try { audio.currentTime = Math.max(0, Number(sec) || 0); } catch {}
    },
    getTime() {
      return Number(audio.currentTime) || 0;
    },
    isPlaying() {
      return !audio.paused;
    },
  };
}

// zatrzymaj wszystko
export function stopAllSfx() {
  for (const [id, a] of active) {
    try { a.pause(); } catch {}
    active.delete(id);
  }
}

// przydatne do UI testera
export function listSfx() {
  return Object.keys(files);
}
