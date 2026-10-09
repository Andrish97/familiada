// familiada/logo/js/db.js
// Dostęp do tabeli user_logos i plików logo w Storage.

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-09T02074";
import { storagePathFromUrl } from "./image.js?v=v2026-10-09T02074";

/** Błąd „zasób zajęty” z RPC *_checked -- reason: control | settings | … */
function busyError(result) {
  const e = new Error("logo in use");
  e.code = "RESOURCE_IN_USE";
  e.reason = result?.reason;
  return e;
}

export function isUniqueViolation(e) {
  return e?.code === "23505" || /duplicate key value/i.test(String(e?.message || ""));
}

/**
 * Lista do kafelków -- BEZ ciężkiej części payloadu (fabricData, obraz
 * base64, stara historia undo). Miniatura potrzebuje tylko bitów/wierszy.
 */
export async function listLogos() {
  const { data, error } = await sb()
    .from("user_logos")
    .select("id,name,type,updated_at,bits_b64:payload->>bits_b64,w:payload->w,h:payload->h,layers:payload->layers,source_mode:payload->source->>mode")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    updated_at: r.updated_at,
    payload: { bits_b64: r.bits_b64, w: r.w, h: r.h, layers: r.layers, source: r.source_mode ? { mode: r.source_mode } : null },
  }));
}

/** Pełny rekord (do edycji i eksportu). */
export async function fetchLogo(id) {
  const { data, error } = await sb().from("user_logos").select("id,name,type,updated_at,payload").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createLogo(row) {
  const { data, error } = await sb().from("user_logos").insert(row).select("id").single();
  if (error) throw error;
  return data.id;
}

/** Upload a self-contained IMAGE source from an imported .famlogo to Storage. */
export async function uploadImportedLogoImage(dataUrl, userId) {
  if (!userId) throw new Error("You must be signed in to upload a logo image");
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+=*)$/i);
  if (!match) throw new Error("Unsupported or invalid embedded logo image");
  const mime = match[1].toLowerCase();
  const encoded = match[2];
  if (encoded.length > Math.ceil((5 * 1024 * 1024) / 3) * 4) throw new Error("Logo image exceeds 5 MB");
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Logo image exceeds 5 MB or is empty");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[mime];
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const storage = sb().storage.from("user-logos");
  const { error } = await storage.upload(path, new Blob([bytes], { type: mime }), {
    cacheControl: "3600", upsert: false, contentType: mime,
  });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

/** Upload the flattened, color-neutral DRAW result used by the Host. */
export async function uploadDrawHostRaster(blob, userId) {
  if (!userId) throw new Error("You must be signed in to upload a logo image");
  if (!(blob instanceof Blob) || blob.type !== "image/png" || !blob.size || blob.size > 5 * 1024 * 1024) {
    throw new Error("Invalid DRAW host image (PNG, up to 5 MB required)");
  }
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}-draw-host.png`;
  const storage = sb().storage.from("user-logos");
  const { error } = await storage.upload(path, blob, {
    cacheControl: "3600", upsert: false, contentType: "image/png",
  });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

export async function uploadImportedDrawHostRaster(dataUrl, userId) {
  const match = String(dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/i);
  if (!match || match[1].length > Math.ceil((5 * 1024 * 1024) / 3) * 4) throw new Error("Invalid embedded DRAW host PNG");
  const bytes = Uint8Array.from(atob(match[1]), char => char.charCodeAt(0));
  return uploadDrawHostRaster(new Blob([bytes], { type: "image/png" }), userId);
}

export async function removeDrawHostRaster(url, userId) {
  const path = storagePathFromUrl(url, userId);
  if (!path || !path.endsWith("-draw-host.png")) return;
  const { error } = await sb().storage.from("user-logos").remove([path]);
  if (error) console.warn("[logo/db] could not remove old DRAW host raster:", error);
}

export async function removeLogoImageUrl(imageUrl, userId) {
  const path = storagePathFromUrl(imageUrl, userId);
  if (!path) return;
  const { error } = await sb().storage.from("user-logos").remove([path]);
  if (error) console.warn("[logo/db] could not remove imported image:", error);
}

// Przez RPC, nie goły update(): sprawdza atomowo, czy pula logo właściciela
// nie jest teraz zajęta (rozgrywka / otwarte ustawienia gry) -- patrz
// docs/plan-testy-i-poprawki.md, „Model: zasób ma stan busy/free”.
export async function updateLogo(id, patch) {
  const { data, error } = await sb().rpc("update_logo_checked", { p_logo_id: id, p_patch: patch });
  if (error) throw error;
  if (!data?.ok) throw busyError(data);
}

// Najpierw RPC (blokuje, gdy logo jest używane), dopiero potem plik obrazu
// w Storage -- inaczej odmowa usunięcia zostawiłaby wiersz bez obrazu.
export async function deleteLogo(id) {
  const { data: logo, error: fetchError } = await sb().from("user_logos").select("payload->source->>imageUrl,payload->source->>hostRasterUrl").eq("id", id).single();
  if (fetchError) throw fetchError;

  const { data: result, error } = await sb().rpc("delete_resource_checked", { p_resource_type: "logo", p_resource_id: id });
  if (error) throw error;
  if (!result?.ok) throw busyError(result);

  const urls = [logo?.imageUrl, logo?.hostRasterUrl].filter(Boolean);
  if (!urls.length) return;
  try {
    const user = (await sb().auth.getUser())?.data?.user;
    const paths = urls.map(url => storagePathFromUrl(url, user?.id)).filter(Boolean);
    if (paths.length) await sb().storage.from("user-logos").remove(paths);
  } catch (e) {
    console.warn("[logo/db] could not remove image file:", e);
  }
}
