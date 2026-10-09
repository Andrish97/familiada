// familiada/logo/js/db.js
// Dostęp do tabeli user_logos i plików logo w Storage.

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-09T02340";
import { getTabId } from "../../shared/js/core/resource-lock.js?v=v2026-10-09T02340";

/** Błąd „zasób zajęty” z RPC *_checked -- reason: logo (inna karta edytuje to logo)
 *  | control | settings (pula logo trzymana przez grę) | locked. */
function busyError(result) {
  const e = new Error("logo in use");
  e.code = "RESOURCE_IN_USE";
  e.reason = result?.blocker_type === "logo" ? "logo" : (result?.blocker_context || result?.reason);
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

// Przez RPC, nie goły update(): sprawdza atomowo, czy to logo (inna karta) albo
// pula logo właściciela (rozgrywka / otwarte ustawienia gry) nie są trzymane
// przez kogoś innego -- docs/blokady-zasobow.md, „Zgodność zasobów”. Własna
// karta (p_tab_id) nie przeszkadza sama sobie.
export async function updateLogo(id, patch) {
  const { data, error } = await sb().rpc("update_logo_checked", { p_logo_id: id, p_patch: patch, p_tab_id: getTabId() });
  if (error) throw error;
  if (!data?.ok) throw busyError(data);
}

// Plik obrazu w Storage usuwa baza razem z wierszem (migracja 313).
export async function deleteLogo(id) {
  const { data: result, error } = await sb().rpc("delete_resource_checked", { p_resource_type: "logo", p_resource_id: id, p_tab_id: getTabId() });
  if (error) throw error;
  if (!result?.ok) throw busyError(result);
}
