import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") || "";

async function verifyAndDecode(token: string): Promise<Record<string, unknown> | null> {
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

    const payload = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    if (!jwtSecret) return json({ ok: false, error: "Missing SUPABASE_JWT_SECRET" }, 500);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const payload = await verifyAndDecode(token);
    if (!payload?.sub) return json({ ok: false, error: "Invalid or expired JWT" }, 401);

    const email = String(payload.email || "").toLowerCase();
    const meta = (payload.user_metadata as Record<string, unknown>) || {};
    const metaPending = String(meta.familiada_email_change_pending || "").trim().toLowerCase();
    const pending_email = metaPending && metaPending !== email ? metaPending : "";

    return json({ ok: true, email, pending_email, is_pending: !!pending_email });
  } catch (e) {
    console.error("[email-change-status] uncaught:", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
