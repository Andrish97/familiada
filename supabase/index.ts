import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(supabaseUrl, supabaseAnonKey);

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    // ---- AUTH ----
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const { data: userData, error: authError } = await sb.auth.getUser(token);
    if (authError || !userData?.user) {
      return json({ ok: false, error: "Invalid JWT" }, 401);
    }

    // ---- BODY (robust) ----
    const raw = await req.text();
    if (!raw.trim()) {
      return json({ ok: false, error: "Empty body" }, 400);
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return json(
        {
          ok: false,
          error: "Invalid JSON body",
          hint: "Send JSON with Content-Type: application/json",
          body_preview: raw.slice(0, 200),
        },
        400
      );
    }

    const to = String(body?.to || "").trim();
    const subject = String(body?.subject || "").trim();
    const html = String(body?.html || "").trim();

    if (!to || !subject || !html) {
      return json({ ok: false, error: "Missing fields (to, subject, html)" }, 400);
    }

    if (!SENDGRID_KEY) {
      return json({ ok: false, error: "Missing SENDGRID_API_KEY env" }, 500);
    }

    // ---- SENDGRID ----
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: "no-reply@familiada.online", name: "Familiada" },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });

    if (!sgRes.ok) {
      const errTxt = await sgRes.text();
      return json({ ok: false, error: "SendGrid failed", details: errTxt }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}