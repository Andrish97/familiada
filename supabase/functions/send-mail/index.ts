import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function htmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const requestId = crypto.randomUUID();
  let uid: string | null = null;
  let actorUserId: string | null = null;

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Missing token" }, 401);

    const { data: userData, error: authError } = await sbAnon.auth.getUser(token);
    if (authError || !userData?.user) return json({ ok: false, error: "Invalid JWT" }, 401);
    uid = userData.user.id;
    actorUserId = uid;

    const raw = await req.text();
    if (!raw.trim()) return json({ ok: false, error: "Empty body" }, 400);

    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

    const items = Array.isArray(body.items) ? body.items : [body];
    const validItems = items.filter((x: any) => x?.to && x?.subject && x?.html).map((x: any) => ({
      to: String(x.to).trim(),
      subject: String(x.subject).trim(),
      html: String(x.html).trim(),
    }));

    if (!validItems.length) return json({ ok: false, error: "No valid emails" }, 400);

    const settings = await sbAdmin.from("mail_settings").select("delay_ms,batch_max").eq("id", 1).maybeSingle();
    const batchMax = Math.min(500, Math.max(1, Number(settings?.data?.batch_max) || 100));
    const toQueue = validItems.slice(0, batchMax);

    const rows = toQueue.map((it: any) => ({
      created_by: uid,
      to_email: it.to,
      subject: it.subject,
      html: it.html,
      text: htmlToText(it.html),
      status: "pending",
      not_before: new Date().toISOString(),
      attempts: 0,
    }));

    const { error } = await sbAdmin.from("mail_queue").insert(rows);
    if (error) throw error;

    return json({ ok: true, queued: rows.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});