// js/core/sfx-cloud.js
// Operacje na Supabase Storage dla per-game custom plików audio.
// Bucket: user-sounds, ścieżka: {userId}/{gameId}/{sfxKey}
//
// Wszystkie funkcje przyjmują sb = instancja klienta Supabase (sb()).
// Nie importują sb globalnie — łatwiejsze testowanie i brak cyklicznych zależności.

const BUCKET = "user-sounds";

function storagePath(userId, gameId, key) {
  return `${userId}/${gameId}/${key}`;
}

/**
 * Wgrywa blob audio do bucketu. Nadpisuje jeśli już istnieje.
 * @param {object} sb - klient Supabase
 * @param {string} userId
 * @param {string} gameId
 * @param {string} key - klucz sfx, np. "bells"
 * @param {Blob} blob
 */
export async function uploadGameSound(sb, userId, gameId, key, blob) {
  const path = storagePath(userId, gameId, key);
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type || "audio/mpeg",
    });
  if (error) throw error;
}

/**
 * Usuwa plik audio z bucketu. Ignoruje błąd 404 (plik nie istniał).
 */
export async function deleteGameSound(sb, userId, gameId, key) {
  const path = storagePath(userId, gameId, key);
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  // 404 = plik nie istniał — ignoruj
  if (error && !error.message?.includes("Not Found") && error.statusCode !== 404) {
    throw error;
  }
}

/**
 * Usuwa wszystkie pliki audio danej gry z bucketu.
 * @param {string[]} keys - tablica kluczy sfx do usunięcia
 */
export async function deleteAllGameSounds(sb, userId, gameId, keys) {
  if (!keys || keys.length === 0) return;
  const paths = keys.map(k => storagePath(userId, gameId, k));
  const { error } = await sb.storage.from(BUCKET).remove(paths);
  if (error && !error.message?.includes("Not Found") && error.statusCode !== 404) {
    throw error;
  }
}

/**
 * Zwraca podpisany URL dla pliku audio (wygasa po expiresIn sekund).
 */
export async function getGameSoundSignedUrl(sb, userId, gameId, key, expiresIn = 3600) {
  const path = storagePath(userId, gameId, key);
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Zwraca Map<key, signedUrl> dla podanych kluczy.
 * Klucze których nie udało się pobrać są pomijane (bez rzucania błędu).
 * @param {string[]} keys - tylko klucze z variant === "__custom__"
 * @returns {Promise<Map<string, string>>}
 */
export async function listGameSounds(sb, userId, gameId, keys) {
  if (!keys || keys.length === 0) return new Map();
  const result = new Map();
  await Promise.all(
    keys.map(async key => {
      try {
        const url = await getGameSoundSignedUrl(sb, userId, gameId, key);
        result.set(key, url);
      } catch {
        // plik nie istnieje lub brak dostępu — pomijamy cicho
      }
    })
  );
  return result;
}
