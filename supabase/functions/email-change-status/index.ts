import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") || "";

// Only one client needed: service role for all DB access
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Validate JWT locally using SUPABASE_JWT_SECRET – no network call, no anon client
async function verifyJWT(token: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = Uint8Array.from(
      atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return String(payload.sub || "") || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    if (!serviceRoleKey) return json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
    if (!jwtSecret) return json({ ok: false, error: "Missing SUPABASE_JWT_SECRET" }, 500);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const userId = await verifyJWT(token);
    if (!userId) return json({ ok: false, error: "Invalid or expired JWT" }, 401);

    // Read user record directly from auth.users via PostgREST (service role)
    const { data: u, error: userErr } = await admin
      .schema("auth")
      .from("users")
      .select("id, email, new_email, user_metadata")
      .eq("id", userId)
      .maybeSingle();

    if (userErr) return json({ ok: false, error: `DB error: ${userErr.message}` }, 500);
    if (!u) return json({ ok: false, error: "User not found" }, 401);

    const email = String(u.email || "").toLowerCase();
    const meta = (u.user_metadata || {}) as Record<string, unknown>;
    const metaPending = String(meta.familiada_email_change_pending || "").trim();
    const metaIntent = String(meta.familiada_email_change_intent || "").trim();

    const rawPending =
      typeof u.new_email === "string" && u.new_email.includes("@")
        ? u.new_email
        : metaPending;

    let pending_email =
      rawPending && rawPending.toLowerCase() !== email ? rawPending.toLowerCase() : "";
    let is_pending = !!pending_email;

    // Auto-heal A: new_email in DB but metadata says no pending → already cancelled
    if (is_pending && !metaPending) {
      const { error: rpcErr } = await admin.rpc("auth_clear_email_change", { p_user_id: userId });
      if (rpcErr) console.warn("auth_clear_email_change (auto-heal A):", rpcErr.message);
      pending_email = "";
      is_pending = false;
    }

    // Auto-heal B: no pending in DB but metadata still has it → clear metadata
    if (!is_pending && (metaPending || metaIntent)) {
      const nextMeta = {
        ...meta,
        familiada_email_change_pending: "",
        familiada_email_change_intent: "",
      };
      const { error: metaErr } = await admin
        .schema("auth")
        .from("users")
        .update({ user_metadata: nextMeta })
        .eq("id", userId);
      if (metaErr) console.warn("clear pending metadata (auto-heal B):", metaErr.message);
    }

    return json({ ok: true, email, pending_email, is_pending });
  } catch (e) {
    console.error("[email-change-status] uncaught:", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
