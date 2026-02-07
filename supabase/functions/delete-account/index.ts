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

    const deletions = [
      // Ankiety: głosy użytkownika
      admin.from("poll_text_entries").delete().eq("voter_user_id", userId),
      admin.from("poll_votes").delete().eq("voter_user_id", userId),
      // Ankiety: subskrypcje i zadania (jako właściciel i odbiorca)
      admin.from("poll_subscriptions").delete().eq("subscriber_user_id", userId),
      admin.from("poll_subscriptions").delete().eq("owner_id", userId),
      admin.from("poll_tasks").delete().eq("recipient_user_id", userId),
      admin.from("poll_tasks").delete().eq("owner_id", userId),
      // Bazy pytań: udostępnienia innych oraz własne bazy
      admin.from("question_base_shares").delete().eq("user_id", userId),
      admin.from("question_bases").delete().eq("owner_id", userId),
      // Gry: wszystkie gry użytkownika (cascade usuwa pytania/odpowiedzi/sesje)
      admin.from("games").delete().eq("owner_id", userId),
      // Ustawienia i zasoby użytkownika
      admin.from("user_flags").delete().eq("user_id", userId),
      admin.from("user_logos").delete().eq("user_id", userId),
    ];

    for (const req of deletions) {
      const { error } = await req;
      if (error) throw error;
    }

    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileError) throw profileError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
