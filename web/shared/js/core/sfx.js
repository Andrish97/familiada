// js/core/sfx.js
// Rozszerzony moduł dźwięku: manifest, warianty, głośności, własne pliki (IndexedDB).

const MANIFEST_PATH = "/shared/data/sounds.json?v=v2026-10-18T20260";
const AUDIO_BASE    = "/assets/audio/";
const IDB_NAME      = "familiada-sfx";
const IDB_STORE     = "custom-files";

/* ========= KONTEKST GRY ========= */

let _currentGameId = null;

export function setCurrentGameId(gameId) {
  _currentGameId = gameId ?? null;
}

export function getCurrentGameId() {
  return _currentGameId;
}

/* ========= MANIFEST ========= */

let manifest = null;

export async function loadSfxManifest() {
  if (manifest) return manifest;
  const res = await fetch(MANIFEST_PATH);
  const json = await res.json();
  manifest = json.categories || [];
  return manifest;
}

export function getSfxCategories() {
  return manifest || [];
}

export function listSfx() {
  return getSfxCategories().map(c => c.key);
}

function getCategoryMeta(key) {
  return (manifest || []).find(c => c.key === key) || null;
}

/* ========= CACHE AUDIO ========= */

const cache = new Map();     // key → Audio
let globalMuted = false;
let previewSfxKey = null;

// Wyciszenie nie zmienia zegara audio, głośności ani zaplanowanych dźwięków.
export function setSfxMuted(muted) {
  globalMuted = !!muted;
  if (typeof window !== "undefined") window.__sfxMuted = globalMuted;
  if (masterGain) masterGain.gain.setValueAtTime(globalMuted ? 0 : 1, audioContext.currentTime);
}
const playbackObservers = new Set();

export function onSfxPlayback(observer) {
  if (typeof observer !== "function") return () => {};
  playbackObservers.add(observer);
  return () => playbackObservers.delete(observer);
}

function reportPlayback(event) {
  for (const observer of playbackObservers) {
    try { observer(event); } catch {}
  }
}

let audioContext = null;
let masterGain = null;
const audioNodes = new WeakMap();

function getAudioContext() {
  if (!audioContext) {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    audioContext = new Context();
    masterGain = audioContext.createGain();
    masterGain.gain.value = globalMuted ? 0 : 1;
    masterGain.connect(audioContext.destination);
  }
  return audioContext;
}

export function createSfxAudio(url) {
  const context = getAudioContext();
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.src = url;
  const source = context.createMediaElementSource(audio);
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(masterGain);
  audioNodes.set(audio, { source, gain, volume: 1, generation: 0 });
  return audio;
}

export function setSfxAudioVolume(audio, volume) {
  const nodes = audioNodes.get(audio);
  if (!nodes) return;
  nodes.volume = Math.max(0, Math.min(1, volume));
  if (!audio.paused && !audio.ended) scheduleFade(audio);
}

export function stopSfxAudio(audio, { dispose = false } = {}) {
  if (!audio) return;
  const nodes = audioNodes.get(audio);
  if (nodes) {
    nodes.generation++;
    nodes.gain.gain.cancelScheduledValues(audioContext.currentTime);
    nodes.gain.gain.setValueAtTime(0, audioContext.currentTime);
  }
  try { audio.pause(); audio.currentTime = 0; } catch {}
  if (dispose && nodes) {
    nodes.source.disconnect();
    nodes.gain.disconnect();
    audioNodes.delete(audio);
  }
}

function _cancelFade(key) {
  const nodes = audioNodes.get(cache.get(key));
  if (!nodes) return;
  nodes.generation++;
  nodes.gain.gain.cancelScheduledValues(audioContext.currentTime);
  nodes.gain.gain.setValueAtTime(0, audioContext.currentTime);
}

export function buildSfxUrl(folder, file) {
  const currentVersion = MANIFEST_PATH.split("?")[1];
  return `${AUDIO_BASE}${folder}/${file.split("?")[0]}?${currentVersion}`;
}

function loadIntoCache(key, url) {
  _cancelFade(key);
  const old = cache.get(key);
  if (old) {
    stopSfxAudio(old, { dispose: true });
    if (old.src.startsWith("blob:")) URL.revokeObjectURL(old.src);
  }
  durationPromises.delete(key);
  const a = createSfxAudio(url);
  cache.set(key, a);
  return a;
}

/* ========= WARIANTY ========= */

export function getSfxVariant(key) {
  return localStorage.getItem(`sfx_variant_${key}`) || "classic.mp3";
}

export function setSfxVariant(key, file) {
  const meta = getCategoryMeta(key);
  if (!meta) return;
  localStorage.setItem(`sfx_variant_${key}`, file);
  loadIntoCache(key, buildSfxUrl(meta.folder, file));
  _applySfxVolume(key);
}

export function resetSfxVariants() {
  for (const cat of getSfxCategories()) {
    localStorage.removeItem(`sfx_variant_${cat.key}`);
    loadIntoCache(cat.key, buildSfxUrl(cat.folder, "classic.mp3"));
    _applySfxVolume(cat.key);
  }
}

/* ========= GŁOŚNOŚCI ========= */

export function getSfxVolume(key) {
  const v = localStorage.getItem(`sfx_vol_${key}`);
  return v !== null ? parseFloat(v) : 1.0;
}

export function getSfxVolumes() {
  const map = new Map();
  for (const cat of getSfxCategories()) {
    map.set(cat.key, getSfxVolume(cat.key));
  }
  return map;
}

export function setSfxVolume(key, v) {
  const clamped = Math.max(0, Math.min(1, v));
  localStorage.setItem(`sfx_vol_${key}`, String(clamped));
  const a = cache.get(key);
  if (a) setSfxAudioVolume(a, _getEffectiveVolume(key));
}

function _applySfxVolume(key) {
  const a = cache.get(key);
  if (a) setSfxAudioVolume(a, _getEffectiveVolume(key));
}

// Głośności sesyjne (nadpisują localStorage na czas sesji, nie zapisują)
const _sessionVolumes = new Map();

// Ustawia głośność na żywo bez zapisu do localStorage (użycie w podsumowaniu)
export function setSessionSfxVolume(key, v) {
  const clamped = Math.max(0, Math.min(1, v));
  _sessionVolumes.set(key, clamped);
  // Zmiana poziomu nie restartuje odtwarzania ani procentowego fade.
  const a = cache.get(key);
  if (a) setSfxAudioVolume(a, clamped);
}

function _getEffectiveVolume(key) {
  return _sessionVolumes.has(key) ? _sessionVolumes.get(key) : getSfxVolume(key);
}

export function applySfxVolumes() {
  for (const cat of getSfxCategories()) {
    _applySfxVolume(cat.key);
  }
}

export function resetSfxVolumes() {
  for (const cat of getSfxCategories()) {
    localStorage.removeItem(`sfx_vol_${cat.key}`);
    const a = cache.get(cat.key);
    if (a) setSfxAudioVolume(a, _getEffectiveVolume(cat.key));
  }
}

/* ========= CUSTOM BLOB (IndexedDB, per game) ========= */

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbKey(key, gameId) {
  return gameId ? `${gameId}:${key}` : key;
}

export async function setSfxCustomBlob(key, blob, filename, gameId = _currentGameId) {
  const k = idbKey(key, gameId);
  const url = URL.createObjectURL(blob);
  loadIntoCache(key, url);
  _applySfxVolume(key);

  const db = await openIDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put({ blob, filename }, k);
    req.onsuccess = res;
    req.onerror = () => rej(req.error);
  });
}

export async function getSfxCustomFiles(gameId = _currentGameId) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    const keyReq = tx.objectStore(IDB_STORE).getAllKeys();
    const result = new Map();
    let data, keys;
    req.onsuccess = () => { data = req.result; if (keys !== undefined) finish(); };
    keyReq.onsuccess = () => { keys = keyReq.result; if (data !== undefined) finish(); };
    req.onerror = keyReq.onerror = () => reject(req.error);
    function finish() {
      const prefix = gameId ? `${gameId}:` : null;
      keys.forEach((k, i) => {
        const ks = String(k);
        if (prefix) {
          if (ks.startsWith(prefix)) result.set(ks.slice(prefix.length), data[i]);
        } else {
          if (!ks.includes(":")) result.set(ks, data[i]);
        }
      });
      resolve(result);
    }
  });
}

export async function clearSfxCustomFile(key, gameId = _currentGameId) {
  const k = idbKey(key, gameId);
  const old = cache.get(key);
  if (old?.src?.startsWith("blob:")) URL.revokeObjectURL(old.src);
  const meta = getCategoryMeta(key);
  if (meta) {
    loadIntoCache(key, buildSfxUrl(meta.folder, getSfxVariant(key)));
    _applySfxVolume(key);
  }
  const db = await openIDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).delete(k);
    req.onsuccess = res;
    req.onerror = () => rej(req.error);
  });
}

export async function clearAllSfxCustomFiles(gameId = _currentGameId) {
  for (const cat of getSfxCategories()) {
    await clearSfxCustomFile(cat.key, gameId);
  }
}

/* ========= CLOUD URL ========= */

export function loadSfxFromCloud(urlMap) {
  for (const [key, url] of urlMap) {
    loadIntoCache(key, url);
    _applySfxVolume(key);
  }
}

/* ========= FADE ========= */

// Każdy plik: pierwsze 5% to wejście, ostatnie 8% to wyjście.
const FADE_IN_RATIO = 0.05;
const FADE_OUT_RATIO = 0.08;

function scheduleFade(audio) {
  const nodes = audioNodes.get(audio);
  if (!nodes) return;
  const now = audioContext.currentTime;
  const position = audio.currentTime || 0;
  const duration = audio.duration;
  const gain = nodes.gain.gain;
  const target = nodes.volume;
  gain.cancelScheduledValues(now);
  if (!Number.isFinite(duration) || duration <= 0) {
    gain.setValueAtTime(target, now);
    return;
  }
  const fadeIn = duration * FADE_IN_RATIO;
  const fadeOut = duration * FADE_OUT_RATIO;
  const fadeOutStart = duration - fadeOut;
  const current = position < fadeIn ? target * position / fadeIn
    : position > fadeOutStart ? target * Math.max(0, (duration - position) / fadeOut)
    : target;
  gain.setValueAtTime(current, now);
  if (position < fadeIn) gain.linearRampToValueAtTime(target, now + fadeIn - position);
  if (position < fadeOutStart) gain.setValueAtTime(target, now + fadeOutStart - position);
  gain.linearRampToValueAtTime(0, now + Math.max(0, duration - position));
}

export function playSfxAudio(audio, volume = 1) {
  const context = getAudioContext();
  const nodes = audioNodes.get(audio);
  nodes.generation++;
  const generation = nodes.generation;
  nodes.gain.gain.cancelScheduledValues(context.currentTime);
  nodes.gain.gain.setValueAtTime(0, context.currentTime);
  nodes.volume = Math.max(0, Math.min(1, volume));
  audio.currentTime = 0;
  // Wywołane synchronicznie w obsłudze gestu. Fade wykonuje silnik audio,
  // również wtedy, gdy przeglądarka ogranicza klatki strony/iframe.
  const resumed = context.state === "running" ? Promise.resolve() : context.resume();
  const playing = audio.play();
  return Promise.all([resumed, playing]).then(() => {
    if (nodes.generation === generation && !audio.paused && !audio.ended) scheduleFade(audio);
  });
}

/* ========= ODTWARZANIE ========= */

export function stopSfx(key) {
  _cancelFade(key);
  const a = cache.get(key);
  if (!a) return;
  stopSfxAudio(a);
}

export function isSfxPlaying(key) {
  const a = cache.get(key);
  return !!a && !a.paused && !a.ended;
}

// Actual audio state, used in addition to timing estimates for action gates.
export function isAnySfxPlaying() {
  return [...cache.values()].some(audio => !audio.paused && !audio.ended);
}

export function debugSfx(key) {
  const a = cache.get(key);
  if (!a) { console.warn("[sfx debug]", key, "— NOT IN CACHE"); return; }
  console.log("[sfx debug]", key, "| src:", a.src?.slice(-40), "| duration:", a.duration, "| paused:", a.paused, "| ended:", a.ended, "| error:", a.error?.code, "| readyState:", a.readyState, "| volume:", audioNodes.get(a)?.volume);
}

export function onSfxEnd(key, fn) {
  const a = cache.get(key);
  if (!a) return () => {};
  a.addEventListener("ended", fn, { once: true });
  return () => a.removeEventListener("ended", fn);
}

// Instrumentacja WYŁĄCZNIE do obserwacji w E2E (tests/e2e/control.spec.js) —
// zero wpływu na normalne działanie: jedna operacja push() na window, zawsze
// włączona (nie ma trybu "testowego" do przełączania). Bez tego nie dałoby
// się z Playwrighta zweryfikować, JAKI dźwięk (i w jakiej kolejności) faktycznie
// poleciał — Audio Web API nie eksponuje tego nigdzie w DOM.
export function playSfx(key) {
  const requestedAt = performance.now();
  if (typeof window !== "undefined") {
    (window.__sfxLog ??= []).push({ key, at: Date.now(), muted: globalMuted });
  }
  const a = cache.get(key);
  if (!a) {
    reportPlayback({ key, failed: true, error: "sound_not_loaded", delayMs: 0 });
    return;
  }
  try {
    const started = playSfxAudio(a, _getEffectiveVolume(key));
    if (started?.then) started.then(() => {
      reportPlayback({ key, failed: false, delayMs: Math.max(0, Math.round(performance.now() - requestedAt)) });
    }).catch(error => {
      reportPlayback({ key, failed: true, error: String(error?.name || "play_rejected"), delayMs: Math.max(0, Math.round(performance.now() - requestedAt)) });
    });
  } catch (error) {
    reportPlayback({ key, failed: true, error: String(error?.name || "play_failed"), delayMs: Math.max(0, Math.round(performance.now() - requestedAt)) });
  }
}

// Sound previews are mutually exclusive, while gameplay cues may still
// intentionally overlap. Keep this policy separate from playSfx().
export function playSfxPreview(key) {
  if (previewSfxKey && previewSfxKey !== key) stopSfx(previewSfxKey);
  previewSfxKey = key;
  playSfx(key);
}

export function stopSfxPreview(key = null) {
  if (!previewSfxKey || (key && previewSfxKey !== key)) return;
  stopSfx(previewSfxKey);
  previewSfxKey = null;
}

export function createSfxMixer() {
  let audio = null;
  let raf = null;
  let _endedHandler = null;
  const listeners = new Set();

  function notify() {
    if (!audio) return;
    const t = audio.currentTime || 0;
    const d = audio.duration || 0;
    for (const fn of listeners) fn(t, d);
  }
  function tick() {
    if (audio && !audio.paused) {
      notify();
      raf = requestAnimationFrame(tick);
    }
  }
  return {
    play(key) {
      this.stop();
      audio = cache.get(key);
      if (!audio) return;
      playSfxAudio(audio, _getEffectiveVolume(key)).catch(() => {});
      // Fired when audio ends naturally — lets onTime listeners detect end even if last RAF tick missed it
      _endedHandler = () => {
        const d = audio?.duration || 0;
        for (const fn of listeners) fn(d, d);
      };
      audio.addEventListener("ended", _endedHandler, { once: true });
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (audio) {
        if (_endedHandler) { audio.removeEventListener("ended", _endedHandler); _endedHandler = null; }
        stopSfxAudio(audio);
      }
      audio = null;
    },
    onTime(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get time() { return audio ? audio.currentTime : 0; },
    get duration() { return audio?.duration || 0; },
  };
}

const durationPromises = new Map();

export function getSfxDuration(key) {
  if (durationPromises.has(key)) return durationPromises.get(key);
  const a = cache.get(key);
  if (!a) { const p = Promise.resolve(0); durationPromises.set(key, p); return p; }
  const p = new Promise((resolve) => {
    if (!Number.isNaN(a.duration) && a.duration > 0) { resolve(a.duration); return; }
    const onMeta = () => { a.removeEventListener("loadedmetadata", onMeta); resolve(a.duration || 0); };
    a.addEventListener("loadedmetadata", onMeta);
    setTimeout(() => { a.removeEventListener("loadedmetadata", onMeta); resolve(a.duration || 0); }, 5000);
  });
  durationPromises.set(key, p);
  return p;
}

// Control2 and Display2 use decoded duration: MP3 metadata may initially
// estimate a different length. Cache by the actual source, including uploads.
const decodedDurations = new Map();
export async function getSfxDurationAccurate(key) {
  const source = cache.get(key)?.src;
  const Decoder = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!source || !Decoder) return getSfxDuration(key);
  if (!decodedDurations.has(source)) {
    const pending = (async () => {
      const response = await fetch(source, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Audio duration fetch failed");
      const bytes = await response.arrayBuffer();
      const context = new Decoder(1, 1, 44100);
      const buffer = await context.decodeAudioData(bytes);
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error("Invalid decoded duration");
      return buffer.duration;
    })();
    decodedDurations.set(source, pending);
    pending.catch(() => decodedDurations.delete(source));
  }
  try { return await decodedDurations.get(source); }
  catch { return getSfxDuration(key); }
}

/* ========= AUDIO UNLOCK ========= */

let unlocked = false;
let unlockPromise = null;

export async function unlockAudio() {
  const context = getAudioContext();
  if (unlocked && context.state === "running") return true;
  if (unlockPromise) return unlockPromise;
  try {
    const a = new Audio();
    a.volume = 0;
    a.src = "/assets/audio/reveal/classic.mp3?v=v2026-10-18T20260";
    // Call play() synchronously in the gesture handler, then trust its
    // promise. Previously a rejected autoplay attempt still returned true,
    // allowing Display to report an unlock the browser had refused.
    const resumed = context.resume();
    const playing = a.play();
    unlockPromise = Promise.all([resumed, playing]).then(() => {
      a.pause();
      unlocked = context.state === "running";
      return unlocked;
    }).catch(() => false).finally(() => { unlockPromise = null; });
    return await unlockPromise;
  } catch {
    unlockPromise = null;
    return false;
  }
}

export function isAudioUnlocked() { return unlocked && audioContext?.state === "running"; }

/* ========= INICJALIZACJA ========= */

/**
 * Wywołać raz po loadSfxManifest() i setCurrentGameId().
 * Wczytuje warianty z localStorage, głośności, własne pliki z IndexedDB.
 */
export async function initSfx() {
  for (const cat of getSfxCategories()) {
    loadIntoCache(cat.key, buildSfxUrl(cat.folder, getSfxVariant(cat.key)));
  }
  applySfxVolumes();

  if (_currentGameId) {
    const gameFiles = await getSfxCustomFiles(_currentGameId);
    for (const [key, { blob }] of gameFiles) {
      loadIntoCache(key, URL.createObjectURL(blob));
      _applySfxVolume(key);
    }
  }
}

/**
 * Nadpisuje ustawienia z game.settings.sound (per-game).
 * volumes: { key: 0–100 }, variants: { key: "classic.mp3?v=v2026-10-18T20260" }
 */
export function applySfxGameSettings({ volumes = {}, variants = {} } = {}) {
  // Brak wpisu oznacza 100%, tak jak suwak ustawień. Nie dziedziczymy
  // głośności poprzedniej gry zapisanej w tej samej przeglądarce.
  for (const { key } of getSfxCategories()) {
    const pct = volumes[key];
    setSfxVolume(key, typeof pct === "number" && Number.isFinite(pct) ? pct / 100 : 1);
  }
  for (const [key, file] of Object.entries(variants)) {
    // "__custom__" nie jest plikiem z audio/ — pomijamy,
    // plik custom zostanie załadowany osobno przez loadSfxFromCloud()
    if (file && file !== "__custom__") {
      localStorage.setItem(`sfx_variant_${key}`, file);
    }
  }
}
