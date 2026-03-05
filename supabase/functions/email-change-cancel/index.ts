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

// Admin client – service role only
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    if (!serviceRoleKey) return json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    // Validate JWT via per-request user client
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) return json({ ok: false, error: `Invalid JWT: ${authError?.message || "no user"}` }, 401);

    const userId = authUser.id;

    // Read current user record for email and metadata
    const { data: u, error: userErr } = await admin
      .schema("auth")
      .from("users")
      .select("id, email, user_metadata")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !u) {
      return json({ ok: false, error: `User lookup failed: ${userErr?.message || "not found"}` }, 500);
    }

    const email = String(u.email || authUser.email || "").trim();
    const meta = ((u.user_metadata || {}) as Record<string, unknown>);
    const nextMeta: Record<string, unknown> = {
      ...meta,
      familiada_email_change_pending: "",
      familiada_email_change_intent: "",
    };

    // 1. Clear pending metadata directly in auth.users (avoids Admin Auth API)
    const { error: updError } = await admin
      .schema("auth")
      .from("users")
      .update({ user_metadata: nextMeta })
      .eq("id", userId);

    if (updError) throw new Error(`Metadata update failed: ${updError.message}`);

    // 2. Clear auth.users pending email-change fields (new_email + tokens)
    const { data: cleared, error: rpcErr } = await admin.rpc("auth_clear_email_change", {
      p_user_id: userId,
    });
    if (rpcErr) {
      console.warn("auth_clear_email_change failed:", rpcErr);
      // don't fail hard – metadata already cleared
    }

    return json({ ok: true, email, cleared: !!cleared });

  } catch (e) {
    console.error("[email-change-cancel] uncaught:", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
