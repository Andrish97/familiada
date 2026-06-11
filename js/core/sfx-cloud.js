// js/core/sfx-cloud.js — Supabase Storage dla dźwięków użytkownika
import { sb } from "./supabase.js?v=v2026-06-11T21271";

const BUCKET = "user-sounds";
const LS_SAVE_FLAG = "sfx_save_cloud";

// ===================== FLAG =====================

export function getSfxSaveFlag() {
  return localStorage.getItem(LS_SAVE_FLAG) === "1";
}

export function setSfxSaveFlag(v) {
  if (v) localStorage.setItem(LS_SAVE_FLAG, "1");
  else localStorage.removeItem(LS_SAVE_FLAG);
}

// ===================== UPLOAD =====================

export async function uploadSoundToCloud(userId, key, blob) {
  const path = `${userId}/${key}.mp3`;
  const { error } = await sb().storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: "audio/mpeg" });
  if (error) throw error;
}

// ===================== DELETE =====================

export async function deleteSoundFromCloud(userId, key) {
  const { error } = await sb().storage
    .from(BUCKET)
    .remove([`${userId}/${key}.mp3`]);
  if (error) throw error;
}

export async function deleteAllSoundsFromCloud(userId) {
  const { data, error } = await sb().storage
    .from(BUCKET)
    .list(userId + "/");
  if (error) throw error;
  if (!data?.length) return;
  const paths = data.map(f => `${userId}/${f.name}`);
  const { error: e2 } = await sb().storage.from(BUCKET).remove(paths);
  if (e2) throw e2;
}

// ===================== LIST / URLS =====================

export async function listCloudSounds(userId) {
  const { data, error } = await sb().storage
    .from(BUCKET)
    .list(userId + "/");
  if (error) throw error;
  if (!data?.length) return new Map();

  const result = new Map();
  for (const file of data) {
    // wytnij rozszerzenie → key
    const key = file.name.replace(/\.mp3$/i, "");
    const { data: signed, error: se } = await sb().storage
      .from(BUCKET)
      .createSignedUrl(`${userId}/${file.name}`, 3600);
    if (!se && signed?.signedUrl) {
      result.set(key, signed.signedUrl);
    }
  }
  return result;
}
