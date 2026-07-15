// js/core/sfx.js
// Rozszerzony moduł dźwięku: manifest, warianty, głośności, własne pliki (IndexedDB).

const MANIFEST_PATH = "/audio/sounds.json?v=v2026-07-15T17571";
const AUDIO_BASE    = "/audio/";
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
const _fadeRafs = new Map(); // key → rafId (zdefiniowane tu, używane w loadIntoCache i fade)

function _cancelFade(key) {
  const id = _fadeRafs.get(key);
  if (id) cancelAnimationFrame(id);
  _fadeRafs.delete(key);
}

function buildUrl(folder, file) {
  return `${AUDIO_BASE}${folder}/${file}`;
}

function loadIntoCache(key, url) {
  _cancelFade(key);
  const old = cache.get(key);
  if (old) {
    try { old.pause(); } catch {}
    if (old.src.startsWith("blob:")) URL.revokeObjectURL(old.src);
  }
  durationPromises.delete(key);
  const a = new Audio(url);
  a.preload = "auto";
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
  loadIntoCache(key, buildUrl(meta.folder, file));
  _applySfxVolume(key);
}

export function resetSfxVariants() {
  for (const cat of getSfxCategories()) {
    localStorage.removeItem(`sfx_variant_${cat.key}`);
    loadIntoCache(cat.key, buildUrl(cat.folder, "classic.mp3"));
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
  if (a) a.volume = clamped;
}

function _applySfxVolume(key) {
  const a = cache.get(key);
  if (a) a.volume = getSfxVolume(key);
}

// Głośności sesyjne (nadpisują localStorage na czas sesji, nie zapisują)
const _sessionVolumes = new Map();

// Ustawia głośność na żywo bez zapisu do localStorage (użycie w podsumowaniu)
export function setSessionSfxVolume(key, v) {
  const clamped = Math.max(0, Math.min(1, v));
  _sessionVolumes.set(key, clamped);
  // Gdy nie gra: ustaw bezpośrednio; gdy gra: fade RAF odbierze zmianę na następnym ticku
  const a = cache.get(key);
  if (a && a.paused) a.volume = clamped;
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
    if (a) a.volume = 1.0;
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
    loadIntoCache(key, buildUrl(meta.folder, getSfxVariant(key)));
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

// Fade: 5% długości na wejście, 8% na wyjście (min/max w sekundach)
const FADE_IN_RATIO  = 0.05;
const FADE_OUT_RATIO = 0.08;
const FADE_IN_MIN    = 0.08;
const FADE_IN_MAX    = 0.4;
const FADE_OUT_MIN   = 0.10;
const FADE_OUT_MAX   = 0.6;

function _fadeVolume(a, ct, dur, target) {
  if (!dur || !isFinite(dur) || dur <= 0) return target;
  const fadeIn  = Math.max(FADE_IN_MIN,  Math.min(FADE_IN_MAX,  dur * FADE_IN_RATIO));
  const fadeOut = Math.max(FADE_OUT_MIN, Math.min(FADE_OUT_MAX, dur * FADE_OUT_RATIO));
  const remaining = dur - ct;
  if (ct < fadeIn)           return target * (ct / fadeIn);
  if (remaining < fadeOut)   return target * Math.max(0, remaining / fadeOut);
  return target;
}

function _startFade(key, a) {
  _cancelFade(key);
  function tick() {
    if (!a || a.paused || a.ended) { _fadeRafs.delete(key); return; }
    const target = _getEffectiveVolume(key); // czyta na żywo — reaguje na zmianę głośności
    a.volume = Math.max(0, Math.min(1, _fadeVolume(a, a.currentTime, a.duration, target)));
    _fadeRafs.set(key, requestAnimationFrame(tick));
  }
  _fadeRafs.set(key, requestAnimationFrame(tick));
}

/* ========= ODTWARZANIE ========= */

export function stopSfx(key) {
  _cancelFade(key);
  const a = cache.get(key);
  if (!a) return;
  try { a.pause(); a.currentTime = 0; a.volume = 0; } catch {}
}

export function isSfxPlaying(key) {
  const a = cache.get(key);
  return !!a && !a.paused && !a.ended;
}

export function debugSfx(key) {
  const a = cache.get(key);
  if (!a) { console.warn("[sfx debug]", key, "— NOT IN CACHE"); return; }
  console.log("[sfx debug]", key, "| src:", a.src?.slice(-40), "| duration:", a.duration, "| paused:", a.paused, "| ended:", a.ended, "| error:", a.error?.code, "| readyState:", a.readyState, "| volume:", a.volume);
}

export function onSfxEnd(key, fn) {
  const a = cache.get(key);
  if (!a) return () => {};
  a.addEventListener("ended", fn, { once: true });
  return () => a.removeEventListener("ended", fn);
}

export function playSfx(key) {
  const a = cache.get(key);
  if (!a) return;
  try {
    _cancelFade(key);
    a.currentTime = 0;
    a.volume = 0;
    a.play().catch(() => {});
    _startFade(key, a);
  } catch {}
}

export function createSfxMixer() {
  let audio = null;
  let raf = null;
  let _fadeKey = null;
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
      // fade
      if (_fadeKey !== null) {
        const target = _getEffectiveVolume(_fadeKey);
        audio.volume = Math.max(0, Math.min(1, _fadeVolume(audio, audio.currentTime, audio.duration, target)));
      }
      notify();
      raf = requestAnimationFrame(tick);
    }
  }
  return {
    play(key) {
      this.stop();
      _fadeKey = key;
      audio = cache.get(key);
      if (!audio) return;
      audio.currentTime = 0;
      audio.volume = 0;
      audio.play().catch(() => {});
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
      _fadeKey = null;
      if (audio) {
        if (_endedHandler) { audio.removeEventListener("ended", _endedHandler); _endedHandler = null; }
        try { audio.pause(); audio.currentTime = 0; } catch {}
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

/* ========= AUDIO UNLOCK ========= */

let unlocked = false;

export function unlockAudio() {
  if (unlocked) return true;
  try {
    const a = new Audio();
    a.volume = 0;
    a.src = `${AUDIO_BASE}reveal/classic.mp3`;
    a.play().catch(() => {});
    unlocked = true;
    return true;
  } catch { return false; }
}

export function isAudioUnlocked() { return unlocked; }

/* ========= INICJALIZACJA ========= */

/**
 * Wywołać raz po loadSfxManifest() i setCurrentGameId().
 * Wczytuje warianty z localStorage, głośności, własne pliki z IndexedDB.
 */
export async function initSfx() {
  for (const cat of getSfxCategories()) {
    loadIntoCache(cat.key, buildUrl(cat.folder, getSfxVariant(cat.key)));
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
 * volumes: { key: 0–100 }, variants: { key: "classic.mp3?v=v2026-07-15T17571" }
 */
export function applySfxGameSettings({ volumes = {}, variants = {} } = {}) {
  for (const [key, pct] of Object.entries(volumes)) {
    if (typeof pct === "number") setSfxVolume(key, pct / 100);
  }
  for (const [key, file] of Object.entries(variants)) {
    // "__custom__" nie jest plikiem z audio/ — pomijamy,
    // plik custom zostanie załadowany osobno przez loadSfxFromCloud()
    if (file && file !== "__custom__") {
      localStorage.setItem(`sfx_variant_${key}`, file);
    }
  }
}
