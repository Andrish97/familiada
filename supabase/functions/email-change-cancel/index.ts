import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const sb = createClient(supabaseUrl, supabaseAnonKey);
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

    const { data: userData, error: authError } = await sb.auth.getUser(token);
    if (authError || !userData?.user) return json({ ok: false, error: "Invalid JWT" }, 401);

    const userId = userData.user.id;
    const email = String(userData.user.email || "").trim();

    const meta = (userData.user.user_metadata || {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = { ...meta, familiada_email_change_pending: "" };

    const { error: updError } = await admin.auth.admin.updateUserById(userId, {
      email,
      user_metadata: nextMeta,
    });

    if (updError) throw updError;
    
    // Clear auth.users pending email-change fields (new_email + tokens) if present.
    const { data: cleared, error: rpcErr } = await admin.rpc("auth_clear_email_change", {
      p_user_id: userId,
    });
    if (rpcErr) {
      console.warn("auth_clear_email_change failed:", rpcErr);
      // don't fail hard - metadata already cleared
    }
    
    return json({ ok: true, email, cleared: !!cleared });

  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
