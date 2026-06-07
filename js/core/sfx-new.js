// js/core/sfx-new.js
// Kopia sfx.js z rozszerzeniami: manifest, warianty, głośności, custom blob, cloud URL.
// Plik samodzielny — nie importuje sfx.js.

const MANIFEST_PATH = "../audio_new/sounds.json?v=v2026-06-03T21150";
const AUDIO_BASE    = "../audio_new/";
const IDB_NAME      = "familiada-sfx";
const IDB_STORE     = "custom-files";
const LS_VOL_PREFIX = "sfx_vol_";
const LS_VAR_PREFIX = "sfx_variant_";

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

const cache = new Map(); // key → Audio

function buildUrl(folder, file) {
  return `${AUDIO_BASE}${folder}/${file}`;
}

function loadIntoCache(key, url) {
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
  return localStorage.getItem(LS_VAR_PREFIX + key) || "classic.mp3";
}

export function setSfxVariant(key, file) {
  const meta = getCategoryMeta(key);
  if (!meta) return;
  localStorage.setItem(LS_VAR_PREFIX + key, file);
  loadIntoCache(key, buildUrl(meta.folder, file));
  applySfxVolume(key);
}

export function resetSfxVariants() {
  for (const cat of getSfxCategories()) {
    localStorage.removeItem(LS_VAR_PREFIX + cat.key);
    loadIntoCache(cat.key, buildUrl(cat.folder, "classic.mp3"));
    applySfxVolume(cat.key);
  }
}

/* ========= GŁOŚNOŚCI ========= */

export function getSfxVolume(key) {
  const v = localStorage.getItem(LS_VOL_PREFIX + key);
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
  localStorage.setItem(LS_VOL_PREFIX + key, String(clamped));
  const a = cache.get(key);
  if (a) a.volume = clamped;
}

function applySfxVolume(key) {
  const a = cache.get(key);
  if (a) a.volume = getSfxVolume(key);
}

export function applySfxVolumes() {
  for (const cat of getSfxCategories()) {
    applySfxVolume(cat.key);
  }
}

export function resetSfxVolumes() {
  for (const cat of getSfxCategories()) {
    localStorage.removeItem(LS_VOL_PREFIX + cat.key);
    const a = cache.get(cat.key);
    if (a) a.volume = 1.0;
  }
}

/* ========= CUSTOM BLOB (IndexedDB) ========= */

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function setSfxCustomBlob(key, blob, filename) {
  const url = URL.createObjectURL(blob);
  loadIntoCache(key, url);
  applySfxVolume(key);

  const db = await openIDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put({ blob, filename }, key);
    req.onsuccess = res;
    req.onerror = () => rej(req.error);
  });
}

export async function getSfxCustomFiles() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    const keyReq = tx.objectStore(IDB_STORE).getAllKeys();
    const result = new Map();
    let data, keys;
    req.onsuccess = () => { data = req.result; if (keys) finish(); };
    keyReq.onsuccess = () => { keys = keyReq.result; if (data) finish(); };
    req.onerror = keyReq.onerror = () => reject(req.error);
    function finish() {
      keys.forEach((k, i) => result.set(k, data[i]));
      resolve(result);
    }
  });
}

export async function clearSfxCustomFile(key) {
  const old = cache.get(key);
  if (old?.src?.startsWith("blob:")) URL.revokeObjectURL(old.src);

  const meta = getCategoryMeta(key);
  if (meta) {
    loadIntoCache(key, buildUrl(meta.folder, getSfxVariant(key)));
    applySfxVolume(key);
  }

  const db = await openIDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).delete(key);
    req.onsuccess = res;
    req.onerror = () => rej(req.error);
  });
}

export async function clearAllSfxCustomFiles() {
  for (const cat of getSfxCategories()) {
    await clearSfxCustomFile(cat.key);
  }
}

/* ========= CLOUD URL ========= */

export function loadSfxFromCloud(urlMap) {
  for (const [key, url] of urlMap) {
    loadIntoCache(key, url);
    applySfxVolume(key);
  }
}

/* ========= PROSTE ODTWARZANIE ========= */

export function playSfx(key) {
  const a = cache.get(key);
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
    if (audio && !audio.paused) raf = requestAnimationFrame(tick);
  }

  return {
    play(key) {
      this.stop();
      audio = cache.get(key);
      if (!audio) return;
      audio.currentTime = 0;
      audio.play().catch(() => {});
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (audio) { try { audio.pause(); audio.currentTime = 0; } catch {} }
      audio = null;
    },
    onTime(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get time() { return audio ? audio.currentTime : 0; },
    get duration() { return audio?.duration || 0; },
  };
}

/* ========= DOKŁADNE MIERZENIE DŁUGOŚCI AUDIO ========= */

const durationPromises = new Map();

/**
 * Zwraca Promise z dokładną długością dźwięku w sekundach (float).
 * Jeśli nie da się odczytać – zwraca 0.
 */
export function getSfxDuration(key) {
  if (durationPromises.has(key)) return durationPromises.get(key);

  const a = cache.get(key);
  if (!a) {
    const p = Promise.resolve(0);
    durationPromises.set(key, p);
    return p;
  }

  const p = new Promise((resolve) => {
    if (!Number.isNaN(a.duration) && a.duration > 0) { resolve(a.duration); return; }
    const onMeta = () => { a.removeEventListener("loadedmetadata", onMeta); resolve(a.duration || 0); };
    a.addEventListener("loadedmetadata", onMeta);
    setTimeout(() => { a.removeEventListener("loadedmetadata", onMeta); resolve(a.duration || 0); }, 5000);
  });

  durationPromises.set(key, p);
  return p;
}

/* ========= AUDIO UNLOCK (gesture) ========= */

let unlocked = false;

export function unlockAudio() {
  if (unlocked) return true;
  try {
    const a = new Audio();
    a.volume = 0;
    a.src = `${AUDIO_BASE}bells/classic.mp3`;
    a.play().catch(() => {});
    unlocked = true;
    return true;
  } catch { return false; }
}

export function isAudioUnlocked() { return unlocked; }

/* ========= INICJALIZACJA ========= */

/**
 * Wywołać raz przy starcie (po loadSfxManifest):
 * wczytuje zapisane warianty, głośności i custom blobs z IndexedDB.
 */
export async function initSfx() {
  for (const cat of getSfxCategories()) {
    loadIntoCache(cat.key, buildUrl(cat.folder, getSfxVariant(cat.key)));
  }
  applySfxVolumes();

  const customFiles = await getSfxCustomFiles();
  for (const [key, { blob }] of customFiles) {
    loadIntoCache(key, URL.createObjectURL(blob));
    applySfxVolume(key);
  }
}
