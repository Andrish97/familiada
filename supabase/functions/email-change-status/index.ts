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

// Client used only to validate JWT → userId
const sb = createClient(supabaseUrl, supabaseAnonKey);

// Admin client to read full user record (incl. new_email on some GoTrue versions)
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

    const { data: userData, error: authError } = await sb.auth.getUser(token);
    if (authError || !userData?.user) {
      return json({ ok: false, error: "Invalid JWT" }, 401);
    }

    const userId = userData.user.id;

    const { data: adminRes, error: adminErr } = await admin.auth.admin.getUserById(userId);
    if (adminErr || !adminRes?.user) {
      return json({ ok: false, error: "Admin getUserById failed" }, 500);
    }

    const u: any = adminRes.user;
    const email: string = String(u?.email || userData.user.email || "").toLowerCase();

    // Try multiple possible fields across GoTrue versions + our own metadata fallback.
    const meta = (u?.user_metadata || {}) as Record<string, unknown>;
    const metaPending = String(meta.familiada_email_change_pending || "").trim();
    const metaIntent = String(meta.familiada_email_change_intent || "").trim();
    
    const pendingCandidates = [
      u?.new_email,
      u?.email_new,
      u?.email_change?.new_email,
      u?.email_change?.email,
      metaPending,
    ];

    const rawPending = pendingCandidates.find((v) => typeof v === "string" && v.includes("@")) || "";
    let pending_email = rawPending && rawPending.toLowerCase() !== email ? rawPending.toLowerCase() : "";
    let is_pending = !!pending_email;
    
    // --- Auto-heal logic ---
    //
    // A) If auth still reports pending (e.g. auth.users.new_email), but our metadata says "no pending",
    // user likely clicked "cancel". Clear auth pending fields server-side and report no pending.
    if (is_pending && !metaPending) {
      const { error: rpcErr } = await admin.rpc("auth_clear_email_change", { p_user_id: userId });
      if (rpcErr) console.warn("auth_clear_email_change (auto-heal A) failed:", rpcErr);
      pending_email = "";
      is_pending = false;
    }
    
    // B) If pending is gone (confirmed elsewhere), but metadata still holds pending,
    // clear metadata to avoid UI bouncing back to pending state.
    if (!is_pending && (metaPending || metaIntent)) {
      const nextMeta = { ...meta, familiada_email_change_pending: "", familiada_email_change_intent: "" };
      const { error: metaErr } = await admin.auth.admin.updateUserById(userId, { user_metadata: nextMeta });
      if (metaErr) console.warn("clear pending metadata (auto-heal B) failed:", metaErr);
    }


    return json({
      ok: true,
      email,
      pending_email,
      is_pending,
    });

  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
