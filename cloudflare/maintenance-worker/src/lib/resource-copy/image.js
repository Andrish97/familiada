// Called only with a recipient and copy ID from the validated database plan.
import { decodeImportedLogoImage } from "../../../../../web/shared/js/core/logo-image-data.js";
import { cloneLogoImagePath } from "./paths.js";
import { getSupabaseConfig } from "../core/supabase.js";

async function digest(bytes) {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadCloneLogoImage(env, plan) {
  cloneLogoImagePath(plan, "image/png");
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error("copy_storage_unavailable");
  return uploadCloneLogoBytes(env, plan, decodeImportedLogoImage(plan.image_data));
}

export async function uploadCloneLogoBytes(env, plan, {bytes,mime}) {
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error("copy_storage_unavailable");
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 5 * 1024 * 1024) throw new Error("invalid_copy_storage_plan");
  const path = cloneLogoImagePath(plan, mime);
  const objectPath = `/storage/v1/object/user-logos/${path}`;
  const hash = await digest(bytes);
  const headers = { apikey: cfg.serviceRoleKey, Authorization: `Bearer ${cfg.serviceRoleKey}` };
  const response = await fetch(cfg.baseUrl + objectPath, {
    method: "POST", headers: { ...headers, "Content-Type": mime, "x-upsert": "false" }, body: bytes,
  });
  let already = false;
  if (!response.ok) {
    // A concurrent retry can encounter the earlier immutable upload. Never
    // replace a recipient file: acknowledge only exactly the same bytes.
    if (response.status !== 409 && response.status !== 400) throw new Error(`copy_image_upload_failed:${response.status}`);
    const previous = await fetch(cfg.baseUrl + `/storage/v1/object/authenticated/user-logos/${path}`, { headers });
    if (!previous.ok) throw new Error(`copy_image_upload_failed:${response.status}`);
    const length = Number(previous.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > 5 * 1024 * 1024) throw new Error("copy_image_conflict");
    const stored = new Uint8Array(await previous.arrayBuffer());
    if (stored.length !== bytes.length || await digest(stored) !== hash) throw new Error("copy_image_conflict");
    already = true;
  }
  return { path, publicUrl: cfg.baseUrl + `/storage/v1/object/public/user-logos/${path}`, sha256: hash, already };
}
