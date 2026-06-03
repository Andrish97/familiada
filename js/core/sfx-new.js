// js/core/sfx-new.js — sandbox rozszerzenia sfx.js
// Dodaje: manifest z audio_new/sounds.json, warianty, głośności, custom blob URL, IndexedDB

const MANIFEST_PATH = "../audio_new/sounds.json?v=v2026-06-03T21003";
const AUDIO_BASE    = "../audio_new/";
const IDB_NAME      = "familiada-sfx";
const IDB_STORE     = "custom-files";
const LS_VOL_PREFIX = "sfx_vol_";
const LS_VAR_PREFIX = "sfx_variant_";

// ===================== MANIFEST =====================

let manifest = null; // tablica categories po załadowaniu

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

function getCategoryMeta(key) {
  return (manifest || []).find(c => c.key === key) || null;
}

// ===================== CACHE AUDIO =====================

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
  const a = new Audio(url);
  a.preload = "auto";
  cache.set(key, a);
  return a;
}

// ===================== WARIANTY =====================

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

// ===================== GŁOŚNOŚCI =====================

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

// ===================== CUSTOM BLOB (IndexedDB) =====================

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

  // wróć do aktywnego wariantu
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

// ===================== CLOUD URL =====================

export function loadSfxFromCloud(urlMap) {
  for (const [key, url] of urlMap) {
    loadIntoCache(key, url);
    applySfxVolume(key);
  }
}

// ===================== ODTWARZANIE =====================

export function playSfx(key) {
  const a = cache.get(key);
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}

export function createSfxMixer() {
  let audio = null;
  let raf = null;
  const listeners = new Set();

  function notify() {
    if (!audio) return;
    for (const fn of listeners) fn(audio.currentTime || 0, audio.duration || 0);
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
    get time() { return audio?.currentTime || 0; },
    get duration() { return audio?.duration || 0; },
  };
}

// ===================== INICJALIZACJA =====================

/**
 * Wywołać raz przy starcie (po loadSfxManifest):
 * wczytuje zapisane warianty, głośności i custom blobs z IndexedDB
 */
export async function initSfx() {
  for (const cat of getSfxCategories()) {
    const variant = getSfxVariant(cat.key);
    loadIntoCache(cat.key, buildUrl(cat.folder, variant));
  }
  applySfxVolumes();

  // wczytaj custom blobs z IndexedDB
  const files = await getSfxCustomFiles();
  for (const [key, { blob }] of files) {
    const url = URL.createObjectURL(blob);
    loadIntoCache(key, url);
    applySfxVolume(key);
  }
}

// ===================== AUDIO UNLOCK =====================

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
