import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Admin client – service role only, used for all DB/auth operations
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    if (!serviceRoleKey) {
      return json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    // Validate JWT via per-request user client (recommended Supabase Edge Function pattern)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) {
      return json({ ok: false, error: `Invalid JWT: ${authError?.message || "no user"}` }, 401);
    }

    const userId = authUser.id;

    // Read user record directly from auth.users – avoids admin.auth.admin API
    // which may be unavailable in some Edge Function environments.
    const { data: u, error: userErr } = await admin
      .schema("auth")
      .from("users")
      .select("id, email, new_email, user_metadata")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !u) {
      return json({ ok: false, error: `User lookup failed: ${userErr?.message || "not found"}` }, 500);
    }

    const email: string = String(u.email || authUser.email || "").toLowerCase();
    const meta = ((u.user_metadata || {}) as Record<string, unknown>);
    const metaPending = String(meta.familiada_email_change_pending || "").trim();
    const metaIntent = String(meta.familiada_email_change_intent || "").trim();

    // new_email is the GoTrue field for a pending email change
    const rawPending = (typeof u.new_email === "string" && u.new_email.includes("@"))
      ? u.new_email
      : metaPending;

    let pending_email = rawPending && rawPending.toLowerCase() !== email ? rawPending.toLowerCase() : "";
    let is_pending = !!pending_email;

    // Auto-heal A: auth.users.new_email is set but metadata has no pending →
    // user already cancelled; clear the auth side and report no pending.
    if (is_pending && !metaPending) {
      const { error: rpcErr } = await admin.rpc("auth_clear_email_change", { p_user_id: userId });
      if (rpcErr) console.warn("auth_clear_email_change (auto-heal A) failed:", rpcErr);
      pending_email = "";
      is_pending = false;
    }

    // Auto-heal B: auth has no pending but metadata still has it → clear metadata.
    if (!is_pending && (metaPending || metaIntent)) {
      const nextMeta = { ...meta, familiada_email_change_pending: "", familiada_email_change_intent: "" };
      const { error: metaErr } = await admin
        .schema("auth")
        .from("users")
        .update({ user_metadata: nextMeta })
        .eq("id", userId);
      if (metaErr) console.warn("clear pending metadata (auto-heal B) failed:", metaErr);
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
