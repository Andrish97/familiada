import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function getIntentFromTable(email: string): Promise<{ status: string; intent: string } | null> {
  try {
    const { data, error } = await admin
      .from("email_intents")
      .select("status,intent")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      status: String(data.status || "").trim().toLowerCase(),
      intent: String(data.intent || "").trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

async function findUserByEmail(email: string) {
  const { data, error } = await admin
    .schema("auth")
    .from("users")
    .select("id,email,email_confirmed_at,user_metadata")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findPendingEmailChange(email: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .schema("auth")
      .from("users")
      .select("id")
      .ilike("new_email", email)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) return true;
  } catch {}

  try {
    const { data, error } = await admin
      .schema("auth")
      .from("users")
      .select("id")
      .ilike("email_change", email)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) return true;
  } catch {}

  try {
    const { data, error } = await admin
      .schema("auth")
      .from("users")
      .select("id")
      .eq("user_metadata->>familiada_email_change_pending", email)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return !!data?.id;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    if (!serviceRoleKey) return json({ ok: false, error: "missing_service_key" }, 500);

    const body = await req.json().catch(() => ({}));
    const rawEmail = String(body?.email || "").trim().toLowerCase();
    if (!rawEmail || !rawEmail.includes("@")) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }

    const table = await getIntentFromTable(rawEmail);
    if (table && (table.status === "pending" || table.status === "confirmed")) {
      return json({
        ok: true,
        email: rawEmail,
        status: table.status,
        intent: table.intent === "guest_migrate" ? "guest_migrate" : "signup",
      });
    }

    const user = await findUserByEmail(rawEmail);
    if (user) {
      const confirmed = !!user.email_confirmed_at;
      const metaIntent = String(user?.user_metadata?.familiada_email_change_intent || "").trim().toLowerCase();
      return json({
        ok: true,
        email: rawEmail,
        status: confirmed ? "confirmed" : "pending",
        intent: confirmed ? "signup" : (metaIntent === "guest_migrate" ? "guest_migrate" : "signup"),
      });
    }

    const pendingChange = await findPendingEmailChange(rawEmail);
    if (pendingChange) {
      return json({
        ok: true,
        email: rawEmail,
        status: "pending",
        intent: "guest_migrate",
      });
    }

    return json({ ok: true, email: rawEmail, status: "none", intent: "signup" });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
