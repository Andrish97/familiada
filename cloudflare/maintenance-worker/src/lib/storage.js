// src/lib/storage.js -- Supabase Storage (message-attachments bucket) helpers.
import { getSupabaseConfig } from "./supabase.js";

export async function uploadToStorage(env, bucketPath, data_b64, mimeType) {
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error("storage_upload_failed:missing_supabase_config");
  // bucketPath format: "message-attachments/{path}" or just "{bucket}/{path}"
  const url = `${cfg.baseUrl}/storage/v1/object/${bucketPath}`;
  const binaryStr = atob(data_b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${cfg.serviceRoleKey}`, "Content-Type": mimeType },
    body: bytes,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`storage_upload_failed:${res.status}:${err.slice(0, 200)}`);
  }
  return bucketPath;
}

export async function downloadFromStorage(env, bucketPath) {
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error("storage_download_failed:missing_supabase_config");
  const url = `${cfg.baseUrl}/storage/v1/object/${bucketPath}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${cfg.serviceRoleKey}` },
  });
  return res; // return raw Response to proxy
}
