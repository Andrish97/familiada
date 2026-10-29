// Import motywów wyświetlacza (plan: familijna-server/docs/import-motywow-plan.md).
// Jedyna droga zapisu do bucketu user-themes: konto z dostępem z panelu admina
// wysyła plik, funkcja sprawdza go tym samym walidatorem co strony i zapisuje
// wersję oczyszczoną. Akcje: upload { text }, delete { id }.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseThemeFile, serializeThemeFile, themeObjectPath, THEME_BUCKET, THEME_FILE_MAX_BYTES } from "../_shared/display-theme-file.js";

const LIMIT = 20;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const sb = createClient(supabaseUrl, supabaseAnonKey);
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!serviceRoleKey) return json({ ok: false, error: "not_configured" }, 503);
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const { data: userData, error: authError } = token ? await sb.auth.getUser(token) : { data: null, error: true };
  if (authError || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
  const userId = userData.user.id;

  const raw = await req.text();
  if (raw.length > THEME_FILE_MAX_BYTES * 2 + 1024) return json({ ok: false, error: "too_large" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "invalid_body" }, 400); }

  try {
    if (body?.action === "delete") {
      const id = String(body.id || "");
      if (!UUID.test(id)) return json({ ok: false, error: "invalid_id" }, 400);
      // Plik usuwa kolejka storage-cleanup (wyzwalacz po DELETE wiersza).
      const { data, error } = await admin.from("user_display_themes").delete().eq("id", id).eq("owner_id", userId).select("id");
      if (error) throw error;
      if (!data?.length) return json({ ok: false, error: "not_found" }, 404);
      return json({ ok: true });
    }
    if (body?.action !== "upload") return json({ ok: false, error: "unknown_action" }, 400);

    const { data: access, error: accessError } = await admin.from("theme_import_access").select("user_id").eq("user_id", userId).maybeSingle();
    if (accessError) throw accessError;
    if (!access) return json({ ok: false, error: "forbidden" }, 403);
    const { count, error: countError } = await admin.from("user_display_themes").select("id", { count: "exact", head: true }).eq("owner_id", userId);
    if (countError) throw countError;
    if ((count ?? 0) >= LIMIT) return json({ ok: false, error: "limit", limit: LIMIT }, 409);

    // Walidator jest w JS: ok jako boolean nie zawęża unii, więc typ podany wprost.
    type Parsed = { ok: true; theme: any } | { ok: false; error: string; detail: string };
    const parsed = parseThemeFile(typeof body.text === "string" ? body.text : "") as unknown as Parsed;
    if (!parsed.ok) return json({ ok: false, error: "invalid_theme", reason: parsed.error, detail: parsed.detail }, 422);
    const theme = parsed.theme;
    const content = serializeThemeFile(theme);
    const id = crypto.randomUUID();
    const { error: uploadError } = await admin.storage.from(THEME_BUCKET).upload(themeObjectPath(id), new Blob([content], { type: "application/json" }), {
      contentType: "application/json", upsert: false, cacheControl: "3600",
    });
    if (uploadError) throw uploadError;
    const row = { id, owner_id: userId, name: theme.name, size_bytes: new TextEncoder().encode(content).length, background: theme.inputs.T?.default ?? null, uses_background: !!theme.inputs.T, background_label: theme.inputs.T?.label ?? null };
    const { error: insertError } = await admin.from("user_display_themes").insert(row);
    if (insertError) {
      await admin.storage.from(THEME_BUCKET).remove([themeObjectPath(id)]);
      throw insertError;
    }
    return json({ ok: true, theme: { id, name: theme.name, background: row.background, uses_background: row.uses_background, background_label: row.background_label } });
  } catch (e) {
    console.error("[display-themes]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: "server_error" }, 500);
  }
});
