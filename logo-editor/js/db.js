// familiada/logo-editor/js/db.js
// Dostęp do tabeli user_logos i plików logo w Storage.

import { sb } from "../../js/core/supabase.js?v=v2026-09-26T14341";
import { storagePathFromUrl } from "./image.js?v=v2026-09-26T14341";

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
  const { data: logo, error: fetchError } = await sb().from("user_logos").select("payload->source->>imageUrl").eq("id", id).single();
  if (fetchError) throw fetchError;

  const { data: result, error } = await sb().rpc("delete_resource_checked", { p_resource_type: "logo", p_resource_id: id });
  if (error) throw error;
  if (!result?.ok) throw busyError(result);

  const imageUrl = logo?.imageUrl;
  if (!imageUrl) return;
  try {
    const user = (await sb().auth.getUser())?.data?.user;
    const path = storagePathFromUrl(imageUrl, user?.id);
    if (path) await sb().storage.from("user-logos").remove([path]);
  } catch (e) {
    console.warn("[logo-editor/db] could not remove image file:", e);
  }
}
